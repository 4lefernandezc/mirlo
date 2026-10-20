/*
 * Mirlo bridge — injected at document start into the official player.
 *
 * Phase A implements the MVP subset of the inherited `ytmd:*` contract
 * (docs/research/ipc-contract.md):
 *   - config:            get / set (through the shell's JSON store)
 *   - player state:      reported to the shell as `report_player_state`
 *                        `{kind, data}` messages (play-or-paused, time-changed,
 *                        volume-changed, seeked, video-src-changed, navigation,
 *                        player-api-loaded, bridge-ready)
 *   - lifecycle:         reload / restart through shell commands
 *   - player control:    window.__mirlo.player.{play, pause, playPause, next,
 *                        previous, seek} (used by global hotkeys and the
 *                        SMTC media session through `eval`)
 *   - ad-block v2:       URL wrappers (fetch/XHR, non-Windows fallback for
 *                        the WebView2 network block) plus pruning of the ad
 *                        metadata from `/youtubei/v1/player` responses;
 *                        always installed, gated by the live config flag
 *                        (ships OFF by default, ADR-0003)
 *
 * Phase B adds the renderer plugin host (`window.__MIRLO_PLUGINS__`):
 *   - plugins register themselves (`register(id, def)`), the host starts the
 *     enabled ones after DOM ready and calls `onPlayerApiReady` once the
 *     YouTube player element (`#movie_player`) exists;
 *   - per-plugin config lives in `config.plugins[id]` (defaults in each
 *     plugin file) and is persisted through the `set_plugin_config` command;
 *   - a compatibility layer re-dispatches the player's native
 *     `videodatachange` event on `document` (like pear-desktop's
 *     `song-info-front`) so ported plugin code needs minimal diffs.
 *
 * The page is remote content: the only privileged surface it gets is the
 * reviewed Tauri command list above (see `capabilities/main.json`).
 */
(() => {
  'use strict';
  if (window.__mirlo || !window.__TAURI_INTERNALS__) return;

  const boot = window.__MIRLO_BOOT__ || {};
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);
  let config = Object.assign(
    { version: 2, adblock: false, hotkeys_enabled: true, plugins: {} },
    boot.config || {}
  );
  if (!config.plugins || typeof config.plugins !== 'object') config.plugins = {};

  // --- Ad-block (URL block + player-response prune) ---------------------
  // v1 on Windows answers matching requests with a synthesized 403 at the
  // WebView2 layer; these wrappers are the non-Windows/fallback layer for
  // that. v2 additionally prunes the ad metadata (`playerAds`,
  // `adPlacements`, `adSlots`) from `/youtubei/v1/player` responses:
  // YouTube Music announces audio ads inside that JSON and serves their
  // audio as regular streams, so URL blocking alone cannot stop them (the
  // same technique as uBlock Origin's json-prune filters on YouTube,
  // implemented independently). The wrappers are always installed and
  // consult the live `config.adblock` flag, so the settings toggle applies
  // without a page reload (ships OFF by default, ADR-0003).
  const AD_RE =
    /(doubleclick\.net|googlesyndication|googleadservices|\/pagead\/|\/api\/stats\/ads|activeview)/i;
  const PRUNED_KEYS = ['playerAds', 'adPlacements', 'adSlots'];

  const adblockStats = { blocked: 0, pruned: 0 };
  let adblockCheckedAt = 0;

  function adblockEnabled() {
    // The flag lives in the shell config; refresh it at most once every
    // 5 s so changes made in the settings window apply roughly live.
    const now = Date.now();
    if (now - adblockCheckedAt > 5000) {
      adblockCheckedAt = now;
      refreshConfig().catch(() => {});
    }
    return !!config.adblock;
  }

  function prunePlayerAds(response) {
    return response
      .clone()
      .json()
      .then((data) => {
        if (!data || typeof data !== 'object') return response;
        let pruned = false;
        for (const key of PRUNED_KEYS) {
          if (key in data) {
            delete data[key];
            pruned = true;
          }
        }
        if (!pruned) return response;
        adblockStats.pruned += 1;
        const headers = new Headers(response.headers);
        headers.delete('content-encoding');
        headers.delete('content-length');
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch(() => response);
  }

  function installAdblock() {
    const origFetch = window.fetch;
    window.fetch = function (input) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!adblockEnabled()) return origFetch.apply(this, arguments);
      if (AD_RE.test(url)) {
        adblockStats.blocked += 1;
        return Promise.reject(new TypeError('blocked by mirlo'));
      }
      const call = origFetch.apply(this, arguments);
      if (!url.includes('/youtubei/v1/player')) return call;
      return call.then(prunePlayerAds);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (adblockEnabled() && AD_RE.test(String(url))) this.__mirloBlocked = true;
      return origOpen.apply(this, arguments);
    };
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this.__mirloBlocked) {
        try {
          this.abort();
        } catch (_) {}
        return;
      }
      return origSend.apply(this, arguments);
    };
  }
  installAdblock();

  // --- Player access ----------------------------------------------------
  const q = (sel) => document.querySelector(sel);

  // The active playback video lives inside the player element; YouTube
  // Music also keeps preloaded/other <video> elements in the DOM, so never
  // take "the first video" (the DOM order can flip during transitions).
  const findVideo = () => q('#movie_player video') || q('video');

  const player = {
    playPause() {
      const b = q('#play-pause-button');
      if (b) {
        b.click();
        return true;
      }
      return false;
    },
    play() {
      const v = findVideo();
      if (v && v.paused) this.playPause();
      return true;
    },
    pause() {
      const v = findVideo();
      if (v && !v.paused) this.playPause();
      return true;
    },
    next() {
      const b = q('.next-button');
      if (b) {
        b.click();
        return true;
      }
      return false;
    },
    previous() {
      const b = q('.previous-button');
      if (b) {
        b.click();
        return true;
      }
      return false;
    },
    seek(seconds) {
      const p = q('#movie_player');
      if (p && typeof p.seekTo === 'function') {
        p.seekTo(seconds, true);
        return true;
      }
      return false;
    },
    state() {
      const v = findVideo();
      const title = q('ytmusic-player-bar .title');
      const byline = q('ytmusic-player-bar .byline');
      // The SPA keeps the address bar at the home URL often; the player API
      // is the reliable source for the current video id (artwork, etc.).
      let videoId = null;
      const p = q('#movie_player');
      if (p && typeof p.getVideoData === 'function') {
        try {
          const data = p.getVideoData();
          videoId = (data && data.video_id) || null;
        } catch (_) {}
      }
      return {
        url: location.href,
        videoId,
        title: title ? title.textContent : null,
        artist: byline ? byline.getAttribute('title') || byline.textContent : null,
        paused: v ? v.paused : null,
        time: v ? Math.round(v.currentTime * 10) / 10 : null,
        duration: v && isFinite(v.duration) ? Math.round(v.duration) : null,
        volume: v ? Math.round(v.volume * 100) / 100 : null,
        src: v && v.src ? v.src.slice(0, 120) : null,
      };
    },
  };

  function report(kind, data) {
    invoke('report_player_state', { kind, data }).catch((err) => {
      console.warn('[mirlo] report failed:', kind, err);
    });
  }

  // --- Shell API surface (hotkeys use player.* through eval) ------------
  async function refreshConfig() {
    config = await invoke('get_config');
  if (!config.plugins || typeof config.plugins !== 'object') config.plugins = {};

  // --- beforeunload neutralizer -----------------------------------------
  // YouTube Music arms a beforeunload handler, so Chromium shows its
  // "leave site?" dialog on unload (Spanish: "Los cambios no se guardarán")
  // — meaningless in a wrapper (nothing to lose) and, while pending, it
  // blocks renderer JS (looks like a freeze) and breaks automation.
  // WebView2's ScriptDialogOpening event does not fire for beforeunload
  // (verified live: the handler is never invoked), so the arming itself is
  // neutralized here, before any page script can register it.
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'beforeunload') return;
    return origAddEventListener.call(this, type, listener, options);
  };
  try {
    Object.defineProperty(window, 'onbeforeunload', {
      get: () => null,
      set: () => {},
      configurable: true,
    });
  } catch (_) {}

  // --- inactivity-prompt blocker -----------------------------------------
  // YouTube Music pops "Are you still there?" after a long stretch without
  // interaction and pauses playback until answered. Keeping the page's
  // last-activity timestamp (`window._lact`) fresh prevents the prompt
  // entirely (same approach as pear-desktop's renderer, MIT; the prompt
  // itself cannot be intercepted because it pauses the player first).
  window._lact = Date.now();
  setInterval(() => {
    window._lact = Date.now();
  }, 900_000);
    return config;
  }

  // --- Plugin host ------------------------------------------------------
  //
  // Each plugin module calls `__MIRLO_PLUGINS__.register(id, def)` where
  // `def` may provide: `defaults` (option defaults, including `enabled`),
  // `styles` (CSS strings injected while the plugin runs), and the lifecycle
  // methods `start(ctx)`, `onPlayerApiReady(api, ctx)`, `onConfigChange(cfg)`.
  const pluginRegistry = new Map();
  const pluginContexts = new Map();
  const pluginStyleDisposers = new Map();
  const activePlugins = new Set();
  const startedPlugins = new Set();
  const apiNotified = new Set();
  const hostState = { api: null, dataloaded: false, audio: null };

  function pluginDefaults(def) {
    return Object.assign({ enabled: false }, (def && def.defaults) || {});
  }

  function effectivePluginConfig(id) {
    const def = pluginRegistry.get(id);
    const overrides = config.plugins[id];
    return Object.assign(
      {},
      pluginDefaults(def),
      overrides && typeof overrides === 'object' ? overrides : {}
    );
  }

  function isPluginEnabled(id) {
    return !!effectivePluginConfig(id).enabled;
  }

  function bindPlugin(def) {
    for (const key of Object.keys(def)) {
      if (typeof def[key] === 'function') def[key] = def[key].bind(def);
    }
    return def;
  }

  function injectStyles(id, styles) {
    if (!styles || !styles.length) return null;
    const sheets = styles.map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
    return () => {
      for (const sheet of sheets) sheet.replaceSync('');
    };
  }

  function makePluginContext(id) {
    return {
      id,
      getConfig: async () => {
        await refreshConfig();
        return effectivePluginConfig(id);
      },
      setConfig: async (partial) => {
        const next = Object.assign({}, effectivePluginConfig(id), partial);
        config = await invoke('set_plugin_config', { pluginId: id, config: next });
        if (!config.plugins) config.plugins = {};
        const merged = effectivePluginConfig(id);
        const def = pluginRegistry.get(id);
        if (def && typeof def.onConfigChange === 'function') {
          try {
            def.onConfigChange(merged);
          } catch (err) {
            console.error(`[mirlo:${id}] onConfigChange failed`, err);
          }
        }
        return merged;
      },
      isEnabled: isPluginEnabled,
    };
  }

  // --- Audio provider (Web Audio graph, on demand) ----------------------
  //
  // Upstream pear-desktop always wires `AudioContext` +
  // `createMediaElementSource(video)` in its renderer core and dispatches
  // `ytmd:audio-can-play`. Mirlo only wires it when at least one enabled
  // plugin declares `audio: true`, so default-off plugins never reroute
  // audio (and a MediaElementSource is only ever created once per element).
  const audioWaiters = [];

  function wantsAudio() {
    for (const [id, def] of pluginRegistry) {
      if (isPluginEnabled(id) && def.audio === true) return true;
    }
    return false;
  }

  function dispatchAudioCanPlay() {
    document.dispatchEvent(
      new CustomEvent('ytmd:audio-can-play', { detail: hostState.audio })
    );
    for (const resolve of audioWaiters.splice(0)) resolve(hostState.audio);
  }

  function setupAudio() {
    if (hostState.audio || !wantsAudio()) return;
    const video = findVideo();
    if (!video) return;
    const audioContext = new AudioContext();
    const audioSource = audioContext.createMediaElementSource(video);
    audioSource.connect(audioContext.destination);
    hostState.audio = { audioContext, audioSource };

    // Autoplay policy can start the context suspended; resume on the first
    // user gesture (the player itself is click-driven anyway).
    if (audioContext.state === 'suspended') {
      document.addEventListener('click', () => audioContext.resume(), { once: true });
    }

    dispatchAudioCanPlay();
    // Like upstream, re-announce per video once enough data is buffered.
    const loadstartListener = () => {
      video.addEventListener('canplaythrough', dispatchAudioCanPlay, { once: true });
    };
    video.addEventListener('loadstart', loadstartListener, { passive: true });
    if (video.readyState === 4) dispatchAudioCanPlay();
    console.log('[mirlo] audio graph wired (state: ' + audioContext.state + ')');
  }

  function audio() {
    if (hostState.audio) return Promise.resolve(hostState.audio);
    setupAudio();
    if (hostState.audio) return Promise.resolve(hostState.audio);
    return new Promise((resolve) => audioWaiters.push(resolve));
  }

  // Simple choice popup used by plugins that need a picker (replaces the
  // Electron dialogs upstream uses). `items`: { label, value, selected }.
  function showChoiceMenu(anchor, items, onPick) {
    const existing = document.querySelector('#mirlo-choice-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'mirlo-choice-menu';
    menu.style.cssText =
      'position:fixed;z-index:10000;background:#212121;color:#fff;border-radius:8px;' +
      'padding:6px;min-width:200px;max-height:50vh;overflow-y:auto;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.55);font-size:14px;';
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.top + 8, window.innerHeight - 40))}px`;

    const close = () => {
      menu.remove();
      document.removeEventListener('click', onDocumentClick, true);
    };
    const onDocumentClick = (event) => {
      if (!menu.contains(event.target)) close();
    };

    for (const item of items) {
      const row = document.createElement('div');
      row.textContent = item.label;
      row.style.cssText = `padding:8px 12px;border-radius:6px;cursor:pointer;${
        item.selected ? 'color:#f5a524;' : ''
      }`;
      row.addEventListener('mouseenter', () => {
        row.style.background = '#333';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
      });
      row.addEventListener('click', () => {
        close();
        onPick(item.value);
      });
      menu.appendChild(row);
    }

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', onDocumentClick, true), 0);
  }

  function domReady() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      } else {
        resolve();
      }
    });
  }

  // Waits for a selector to appear (YouTube Music renders its app shell
  // asynchronously after the bridge starts). Resolves with null on timeout.
  function waitForElement(selector, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const immediate = document.querySelector(selector);
      if (immediate) {
        resolve(immediate);
        return;
      }
      let timer = null;
      const settle = (element) => {
        observer.disconnect();
        if (timer) clearTimeout(timer);
        resolve(element);
      };
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) settle(found);
      });
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });
      timer = setTimeout(() => settle(document.querySelector(selector)), timeoutMs);
    });
  }

  async function startPlugin(id) {
    if (activePlugins.has(id)) return;
    const def = pluginRegistry.get(id);
    if (!def) return;
    activePlugins.add(id);
    pluginContexts.set(id, makePluginContext(id));
    pluginStyleDisposers.set(id, injectStyles(id, def.styles));
    await domReady();
    if (!activePlugins.has(id)) return;
    Promise.resolve()
      .then(() => (typeof def.start === 'function' ? def.start(pluginContexts.get(id)) : null))
      .catch((err) => {
        console.error(`[mirlo:${id}] start failed`, err);
      })
      .finally(() => {
        // `#movie_player` can appear before DOMContentLoaded, so the API is
        // announced only after this plugin's own start() has finished (its
        // config is loaded by then).
        startedPlugins.add(id);
        setupAudio();
        notifyPlayerApi(id);
      });
    console.log(`[mirlo] plugin started: ${id}`);
  }

  function stopPlugin(id) {
    if (!activePlugins.has(id)) return;
    activePlugins.delete(id);
    const def = pluginRegistry.get(id);
    if (def && typeof def.stop === 'function') {
      try {
        def.stop();
      } catch (err) {
        console.error(`[mirlo:${id}] stop failed`, err);
      }
    }
    const dispose = pluginStyleDisposers.get(id);
    if (dispose) dispose();
    pluginStyleDisposers.delete(id);
    pluginContexts.delete(id);
    apiNotified.delete(id);
    startedPlugins.delete(id);
    console.log(`[mirlo] plugin stopped: ${id}`);
  }

  function notifyPlayerApi(id) {
    if (
      !hostState.api ||
      apiNotified.has(id) ||
      !activePlugins.has(id) ||
      !startedPlugins.has(id)
    ) {
      return;
    }
    const def = pluginRegistry.get(id);
    if (!def || typeof def.onPlayerApiReady !== 'function') return;
    apiNotified.add(id);
    try {
      const result = def.onPlayerApiReady(hostState.api, pluginContexts.get(id));
      // Plugins may use async hooks (e.g. awaiting a DOM element).
      if (result && typeof result.catch === 'function') {
        result.catch((err) => console.error(`[mirlo:${id}] onPlayerApiReady failed`, err));
      }
    } catch (err) {
      console.error(`[mirlo:${id}] onPlayerApiReady failed`, err);
    }
  }

  window.__MIRLO_PLUGINS__ = {
    register(id, def) {
      if (pluginRegistry.has(id)) return;
      pluginRegistry.set(id, bindPlugin(def));
    },
    init() {
      const startEnabled = () => {
        for (const [id] of pluginRegistry) {
          if (isPluginEnabled(id)) startPlugin(id);
        }
      };
      // The boot config is templated when the window is created; refresh from
      // the shell so page reloads (and future settings changes) see the
      // current plugin config without recreating the window. Falls back to
      // the boot config when the shell is unreachable.
      refreshConfig().then(startEnabled, (err) => {
        console.warn('[mirlo] config refresh failed; using boot config', err);
        startEnabled();
      });
    },
    isEnabled: isPluginEnabled,
    enable: (id) => startPlugin(id),
    disable: (id) => stopPlugin(id),
    waitForElement,
    showChoiceMenu,
    audio,
    onAudioReady: (cb) => {
      audio().then(cb);
    },
    // Debug/inspection helpers (also used by the settings UI later).
    ids: () => [...pluginRegistry.keys()],
    get: (id) => pluginRegistry.get(id),
  };

  // --- Player API + state wiring ----------------------------------------
  //
  // The YouTube player element (`#movie_player`) emits `videodatachange`;
  // like pear-desktop's `song-info-front`, we forward it to `document` and
  // emit `ytmd:src-changed` on the video element at `dataloaded` so ported
  // plugins and our own state reporting share one source of truth.
  function normalizeVideoDataChange(a, b) {
    if (a && typeof a === 'object') {
      const detail = a.detail;
      if (Array.isArray(detail)) return { name: detail[0], videoData: detail[1] };
      if (detail && typeof detail === 'object') {
        return { name: detail.name, videoData: detail.value !== undefined ? detail.value : detail.videoData };
      }
      return { name: undefined, videoData: undefined };
    }
    return { name: a, videoData: b };
  }

  function onPlayerApiReady(apiElement) {
    if (hostState.api) return;
    hostState.api = apiElement;
    apiElement.addEventListener('videodatachange', (a, b) => {
      const { name, videoData } = normalizeVideoDataChange(a, b);
      if (!name) return;
      if (name === 'dataloaded') {
        hostState.dataloaded = true;
        const video = findVideo();
        if (video) video.dispatchEvent(new CustomEvent('ytmd:src-changed'));
      }
      document.dispatchEvent(
        new CustomEvent('videodatachange', { detail: { name, videoData } })
      );
    });
    for (const id of activePlugins) notifyPlayerApi(id);
    report('player-api-loaded', player.state());
  }

  let video = null;
  let lastSrc = null;
  let lastHref = location.href;
  let lastTimeReport = 0;

  function attachVideo(v) {
    if (video === v) return;
    video = v;
    for (const name of ['play', 'pause', 'seeked', 'volumechange', 'loadedmetadata', 'emptied']) {
      v.addEventListener(name, () => {
        if (name === 'play' || name === 'pause') report('play-or-paused', player.state());
        else if (name === 'volumechange') report('volume-changed', player.state());
        else if (name === 'seeked') report('seeked', player.state());
        else report('video-src-changed', player.state());
      });
    }
    v.addEventListener('timeupdate', () => {
      const now = performance.now();
      if (now - lastTimeReport < 950) return;
      lastTimeReport = now;
      report('time-changed', player.state());
    });
  }

  function scan() {
    const v = findVideo();
    if (v) attachVideo(v);
    if (v) setupAudio();
    const apiElement = q('#movie_player');
    if (apiElement && !hostState.api) onPlayerApiReady(apiElement);
    if (location.href !== lastHref) {
      lastHref = location.href;
      report('navigation', player.state());
    }
    const src = v && v.src ? v.src.slice(0, 120) : null;
    if (src && src !== lastSrc) {
      lastSrc = src;
      report('video-src-changed', player.state());
    }
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement || document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', scan, { once: true });
  // Low-frequency safety net for SPA state the observer may miss; it reports
  // only when the href or media source actually changed.
  setInterval(scan, 2000);

  window.__mirlo = {
    version: boot.version || null,
    player,
    plugins: window.__MIRLO_PLUGINS__,
    adblockStats,
    async getConfig() {
      return refreshConfig();
    },
    async setConfig(partial) {
      const current = await refreshConfig();
      config = await invoke('set_config', {
        config: Object.assign({}, current, partial),
      });
      return config;
    },
    reload() {
      return invoke('reload_player');
    },
    restart() {
      return invoke('restart_app');
    },
    // "Continue where you left off": called once by the shell after the
    // player API is ready, with the state saved at the last close.
    async resumePlayback(target) {
      console.log('[mirlo] resumePlayback:', JSON.stringify(target));
      if (!target || !target.videoId) {
        console.log('[mirlo] resumePlayback: no usable target');
        return false;
      }

      // Any real user input takes over: never fight the user's choice.
      // Only trusted (real) events count — page scripts dispatch synthetic
      // pointer/key events during their own boot.
      let interacted = false;
      const onInput = (event) => {
        if (!event.isTrusted) return;
        interacted = true;
      };
      const inputTypes = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
      for (const type of inputTypes) {
        document.addEventListener(type, onInput, { capture: true, passive: true });
      }
      const cleanup = () => {
        for (const type of inputTypes) {
          document.removeEventListener(type, onInput, { capture: true });
        }
      };

      // The player element can be re-created during YouTube Music's boot
      // and its API is not necessarily attached when the event fires, so
      // resolve it freshly on every use.
      const player = () => {
        const el = q('#movie_player');
        return el && typeof el.getVideoData === 'function' ? el : null;
      };
      const currentId = () => {
        const el = player();
        if (!el) return null;
        try {
          const data = el.getVideoData();
          return (data && data.video_id) || null;
        } catch (_) {
          return null;
        }
      };
      const isApplied = () => {
        if (currentId() !== target.videoId) return false;
        const v = findVideo();
        if (!v) return false;
        if (v.paused !== target.paused) return false;
        return Math.abs(v.currentTime - (target.position || 0)) < 15;
      };
      const seekAndPlay = () => {
        const el = player();
        if (!el) return;
        try {
          if ((target.position || 0) > 1 && typeof el.seekTo === 'function') {
            el.seekTo(target.position, true);
          }
          if (target.paused) el.pauseVideo && el.pauseVideo();
          else el.playVideo && el.playVideo();
        } catch (err) {
          console.log('[mirlo] resumePlayback apply failed:', err);
        }
      };
      const navigateToTarget = () => {
        // Load through the app router (a synthetic watch-link click, like
        // the user picking a song): the raw loadVideoById() switches the
        // audio while YouTube Music's UI keeps showing the previous track.
        const a = document.createElement('a');
        a.href = `/watch?v=${encodeURIComponent(target.videoId)}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      // 1) Wait for the player API and a loaded video, then give YouTube
      //    Music's own queue restore a moment to settle before deciding.
      for (let i = 0; i < 30 && !currentId() && !interacted; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!interacted) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (interacted) {
        console.log('[mirlo] resumePlayback: user interacted, aborting');
        cleanup();
        return false;
      }

      // 2) Restore the position and the play/pause state, then keep a
      //    longer verification window: YouTube Music's own queue restore
      //    can finish late (seconds after boot) and override the state —
      //    it may resume playback on a paused target. Each iteration
      //    re-navigates if the restored track differs, re-applies the
      //    state and stops as soon as the target is in place. Real user
      //    input aborts at any point, so this never fights the user.
      for (let check = 0; check < 6 && !interacted; check++) {
        if (currentId() !== target.videoId) {
          navigateToTarget();
          for (let i = 0; i < 16 && !interacted; i++) {
            if (currentId() === target.videoId) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        seekAndPlay();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (isApplied()) break;
      }

      console.log(
        '[mirlo] resumePlayback done:',
        target.videoId,
        isApplied(),
        interacted ? 'user-interrupted' : 'ok'
      );
      // Confirm to the shell (it stops re-arming the resume on page loads).
      try {
        report('resume-done', {
          ok: isApplied(),
          reason: interacted ? 'input' : 'done',
          videoId: target.videoId,
        });
      } catch (_) {}
      cleanup();
      return true;
    },
  };

  // Media capabilities (diagnostics): on Linux, WebKitGTK's MSE codecs
  // depend on the system GStreamer plugin packages — the shell logs a
  // warning when they are missing because playback would fail.
  const mediaCaps = () => {
    try {
      return {
        ms: typeof MediaSource !== 'undefined',
        aac:
          typeof MediaSource !== 'undefined' &&
          MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'),
        opus:
          typeof MediaSource !== 'undefined' &&
          MediaSource.isTypeSupported('audio/webm; codecs="opus"'),
        h264:
          typeof MediaSource !== 'undefined' &&
          MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"'),
      };
    } catch (err) {
      return { err: String(err) };
    }
  };

  report('bridge-ready', {
    version: boot.version || null,
    adblock: !!config.adblock,
    href: location.href,
    caps: mediaCaps(),
  });
  console.log('[mirlo] bridge loaded', boot.version || '');
  scan();
})();
