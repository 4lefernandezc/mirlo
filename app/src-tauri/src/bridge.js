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
 * The page is remote content: the only privileged surface it gets is the
 * reviewed Tauri command list above (see `capabilities/main.json`).
 */
(() => {
  'use strict';
  if (window.__mirlo || !window.__TAURI_INTERNALS__) return;

  const boot = window.__MIRLO_BOOT__ || {};
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);
  let config = Object.assign(
    { version: 1, adblock: false, hotkeys_enabled: true },
    boot.config || {}
  );

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

  // --- State wiring (event-driven; no periodic IPC while idle) ----------
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
    report('player-api-loaded', player.state());
  }

  function scan() {
    const v = q('video');
    if (v) attachVideo(v);
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

  // --- Shell API surface (hotkeys use player.* through eval) ------------
  window.__mirlo = {
    version: boot.version || null,
    player,
    async getConfig() {
      config = await invoke('get_config');
      return config;
    },
    async setConfig(partial) {
      config = await invoke('set_config', {
        config: Object.assign({}, config, partial),
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
