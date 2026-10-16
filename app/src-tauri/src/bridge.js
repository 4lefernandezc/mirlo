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
 *   - player control:    window.__mirlo.player.{playPause,next,previous}
 *                        (used by global hotkeys through `eval`)
 *   - ad-block v0:       fetch/XHR wrappers, only when enabled in the config
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

  // --- Ad-block v0 (ported from the validated Phase 0 PoC) --------------
  const AD_RE =
    /(doubleclick\.net|googlesyndication|googleadservices|\/pagead\/|\/api\/stats\/ads|activeview)/i;

  function installAdblock() {
    const origFetch = window.fetch;
    window.fetch = function (input) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (AD_RE.test(url)) {
        return Promise.reject(new TypeError('blocked by mirlo'));
      }
      return origFetch.apply(this, arguments);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (AD_RE.test(String(url))) this.__mirloBlocked = true;
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
  if (config.adblock) installAdblock();

  // --- Player access ----------------------------------------------------
  const q = (sel) => document.querySelector(sel);

  const player = {
    playPause() {
      const b = q('#play-pause-button');
      if (b) {
        b.click();
        return true;
      }
      return false;
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
    state() {
      const v = q('video');
      const title = q('ytmusic-player-bar .title');
      const byline = q('ytmusic-player-bar .byline');
      return {
        url: location.href,
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
  const hostState = { api: null, dataloaded: false };

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
        const video = q('video');
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
    const v = q('video');
    if (v) attachVideo(v);
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
  };

  report('bridge-ready', {
    version: boot.version || null,
    adblock: !!config.adblock,
    href: location.href,
  });
  console.log('[mirlo] bridge loaded', boot.version || '');
  scan();
})();
