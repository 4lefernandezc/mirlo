/*
 * Mirlo plugin: precise-volume
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/precise-volume/index.ts + renderer.ts + override.ts
 *   + volume-hud.css
 * Adapted to the Mirlo plugin host. Deviations:
 *   - the electron `globalShortcut` part lives in the shell: configure
 *     `globalShortcuts.volumeUp` / `volumeDown` (tauri accelerator syntax,
 *     e.g. "Ctrl+Alt+ArrowUp") in config.json; the shell registers them at
 *     startup and calls `changeVolume` in the page. Restart to apply.
 *   - `ipc.on('changeVolume'|'setVolume')` becomes direct calls on
 *     `window.__mirlo.plugins.get('precise-volume')`.
 *   - `stop()` removes listeners/HUD (upstream has no unload path).
 */
__MIRLO_PLUGINS__.register('precise-volume', {
  defaults: {
    enabled: false,
    steps: 1,
    arrowsShortcut: true,
    globalShortcuts: {
      volumeUp: '',
      volumeDown: '',
    },
    savedVolume: undefined,
  },
  styles: [
    `
#volumeHud {
  z-index: 999;
  position: absolute;
  transition: opacity 0.6s;
  pointer-events: none;
  padding: 10px;

  text-shadow: rgba(0, 0, 0, 0.5) 0px 0px 12px;
}

ytmusic-player[player-ui-state_='MINIPLAYER'] #volumeHud {
  top: 0 !important;
}
`,
  ],

  api: null,
  options: null,
  handlers: null,
  observers: null,

  debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  // --- ported renderer helpers ------------------------------------------
  moveVolumeHud(showVideo) {
    const volumeHud = document.querySelector('#volumeHud');
    if (!volumeHud) {
      return;
    }

    volumeHud.style.top = showVideo
      ? `${(document.querySelector('ytmusic-player').clientHeight - document.querySelector('video').clientHeight) / 2}px`
      : '0';
  },

  /** Restore saved volume and setup tooltip */
  async firstRun(ctx) {
    const options = this.options;
    const api = this.api;

    if (typeof options.savedVolume === 'number') {
      // Set saved volume as tooltip
      this.setTooltip(options.savedVolume);

      if (api.getVolume() !== options.savedVolume) {
        this.setVolume(options.savedVolume);
      }
    }

    this.setupPlaybar();

    this.setupLocalArrowShortcuts();

    // Workaround: computedStyleMap().get(string) returns CSSKeywordValue instead of CSSStyleValue
    const noVid =
      document.querySelector('#main-panel')?.computedStyleMap().get('display')?.value === 'none';
    this.injectVolumeHud(noVid);
    if (!noVid) {
      this.setupVideoPlayerOnwheel();
      if (!ctx.isEnabled('video-toggle')) {
        // Video-toggle handles hud positioning on its own
        const videoMode = () =>
          api.getPlayerResponse().videoDetails?.musicVideoType !== 'MUSIC_VIDEO_TYPE_ATV';
        document.querySelector('video')?.addEventListener('ytmd:src-changed', () =>
          this.moveVolumeHud(videoMode())
        );
      }
    }
  },

  injectVolumeHud(noVid) {
    // Mirlo: build the node with DOM APIs instead of upstream's
    // `insertAdjacentHTML` string, because YouTube Music enforces Trusted
    // Types (`require-trusted-types-for 'script'` throws on string HTML).
    const hud = document.createElement('span');
    hud.id = 'volumeHud';

    if (noVid) {
      const position = 'top: 18px; right: 60px;';
      const mainStyle = 'font-size: xx-large;';
      hud.setAttribute('style', position + mainStyle);

      document.querySelector('.center-content.ytmusic-nav-bar')?.appendChild(hud);
    } else {
      const position = 'top: 10px; left: 10px;';
      const mainStyle =
        'font-size: xxx-large; webkit-text-stroke: 1px black; font-weight: 600;';
      hud.setAttribute('style', position + mainStyle);

      document.querySelector('#song-video')?.insertAdjacentElement('afterend', hud);
    }
  },

  showVolumeHud(volume) {
    const volumeHud = document.querySelector('#volumeHud');
    if (!volumeHud) {
      return;
    }

    volumeHud.textContent = `${volume}%`;
    volumeHud.style.opacity = '1';

    this.hideVolumeHud(volumeHud);
  },

  /** Add onwheel event to video player */
  setupVideoPlayerOnwheel() {
    const panel = document.querySelector('#main-panel');
    if (!panel) return;

    this.handlers.panelWheel = (event) => {
      event.preventDefault();
      // Event.deltaY < 0 means wheel-up
      this.changeVolume(event.deltaY < 0);
    };
    panel.addEventListener('wheel', this.handlers.panelWheel);
  },

  saveVolume(volume) {
    this.options.savedVolume = volume;
    this.writeOptions();
  },

  /** Add onwheel event to play bar and also track if play bar is hovered */
  setupPlaybar() {
    const playerbar = document.querySelector('ytmusic-player-bar');
    if (!playerbar) return;

    this.handlers.playerbarWheel = (event) => {
      event.preventDefault();
      // Event.deltaY < 0 means wheel-up
      this.changeVolume(event.deltaY < 0);
    };
    playerbar.addEventListener('wheel', this.handlers.playerbarWheel);

    // Keep track of mouse position for showVolumeSlider()
    this.handlers.playerbarEnter = () => {
      playerbar.classList.add('on-hover');
    };
    this.handlers.playerbarLeave = () => {
      playerbar.classList.remove('on-hover');
    };
    playerbar.addEventListener('mouseenter', this.handlers.playerbarEnter);
    playerbar.addEventListener('mouseleave', this.handlers.playerbarLeave);

    this.setupSliderObserver();
  },

  /** Save volume + Update the volume tooltip when volume-slider is manually changed */
  setupSliderObserver() {
    const sliderObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target.nodeName === 'TP-YT-PAPER-SLIDER') {
          // This checks that volume-slider was manually set
          const target = mutation.target;
          const targetValueNumeric = Number(target.value);
          if (
            mutation.oldValue !== target.value &&
            (typeof this.options.savedVolume !== 'number' ||
              Math.abs(this.options.savedVolume - targetValueNumeric) > 4)
          ) {
            // Diff>4 means it was manually set
            this.setTooltip(targetValueNumeric);
            this.saveVolume(targetValueNumeric);
          }
        }
      }
    });

    const slider = document.querySelector('#volume-slider');
    if (!slider) return;

    // Observing only changes in 'value' of volume-slider
    sliderObserver.observe(slider, {
      attributeFilter: ['value'],
      attributeOldValue: true,
    });
    this.observers.slider = sliderObserver;
  },

  setVolume(value) {
    this.api.setVolume(value);
    // Save the new volume
    this.saveVolume(value);

    // Change slider position (important)
    this.updateVolumeSlider();

    // Change tooltips to new value
    this.setTooltip(value);
    // Show volume slider
    this.showVolumeSlider();
    // Show volume HUD
    this.showVolumeHud(value);
  },

  /** If (toIncrease = false) then volume decrease */
  changeVolume(toIncrease) {
    // Apply volume change if valid
    const steps = Number(this.options.steps || 1);
    this.setVolume(
      toIncrease
        ? Math.min(this.api.getVolume() + steps, 100)
        : Math.max(this.api.getVolume() - steps, 0)
    );
  },

  updateVolumeSlider() {
    const savedVolume = this.options.savedVolume ?? 0;
    // Slider value automatically rounds to multiples of 5
    for (const slider of ['#volume-slider', '#expand-volume-slider']) {
      const sliderElement = document.querySelector(slider);
      if (sliderElement) {
        sliderElement.value = String(savedVolume > 0 && savedVolume < 5 ? 5 : savedVolume);
      }
    }
  },

  showVolumeSlider() {
    const slider = document.querySelector('#volume-slider');
    if (!slider) return;

    // This class display the volume slider if not in minimized mode
    slider.classList.add('on-hover');

    this.hideVolumeSlider(slider);
  },

  setTooltip(volume) {
    // Set new volume as tooltip for volume slider and icon + expanding slider (appears when window size is small)
    const tooltipTargets = [
      '#volume-slider',
      'tp-yt-paper-icon-button.volume',
      '#expand-volume-slider',
      '#expand-volume',
    ];

    for (const target of tooltipTargets) {
      const tooltipTargetElement = document.querySelector(target);
      if (tooltipTargetElement) {
        tooltipTargetElement.title = `${volume}%`;
      }
    }
  },

  setupLocalArrowShortcuts() {
    if (this.options.arrowsShortcut) {
      this.handlers.arrowKeydown = (event) => {
        if (document.querySelector('ytmusic-search-box')?.opened) {
          return;
        }

        switch (event.code) {
          case 'ArrowUp': {
            event.preventDefault();
            this.changeVolume(true);
            break;
          }

          case 'ArrowDown': {
            event.preventDefault();
            this.changeVolume(false);
            break;
          }
        }
      };
      window.addEventListener('keydown', this.handlers.arrowKeydown);
    }
  },

  // --- host lifecycle ----------------------------------------------------
  async start(ctx) {
    this.ctx = ctx;
    this.handlers = {};
    this.observers = {};

    this.overrideListener();
  },

  // YO WHAT ARE YOU DOING NOW?!?!
  // (upstream comment) Ignore the volume-slider's own wheel/keydown listeners
  // while YouTube Music wires the page, then restore the native method.
  overrideListener() {
    const ignored = {
      id: ['volume-slider', 'expand-volume-slider'],
      types: ['mousewheel', 'keydown', 'keyup'],
    };

    Element.prototype._mirloAddEventListener = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function (type, listener, useCapture = false) {
      if (!(ignored.id.includes(this.id) && ignored.types.includes(type))) {
        this._mirloAddEventListener(type, listener, useCapture);
      }
    };

    // Restore original function after finished loading to avoid keeping Element.prototype altered
    window.addEventListener(
      'load',
      () => {
        if (Element.prototype._mirloAddEventListener) {
          Element.prototype.addEventListener = Element.prototype._mirloAddEventListener;
          Element.prototype._mirloAddEventListener = undefined;
        }
      },
      { once: true }
    );
  },

  async onPlayerApiReady(playerApi, ctx) {
    this.options = await ctx.getConfig();
    this.api = playerApi;

    // Without this function it would rewrite config 20 time when volume change by 20
    this.writeOptions = this.debounce(() => {
      ctx.setConfig(this.options);
    }, 1000);

    this.hideVolumeHud = this.debounce((volumeHud) => {
      volumeHud.style.opacity = '0';
    }, 2000);

    this.hideVolumeSlider = this.debounce((slider) => {
      slider.classList.remove('on-hover');
    }, 2500);

    await this.firstRun(ctx);
  },

  onConfigChange(config) {
    this.options = config;
  },

  stop() {
    const handlers = this.handlers || {};
    const playerbar = document.querySelector('ytmusic-player-bar');
    const panel = document.querySelector('#main-panel');

    if (handlers.arrowKeydown) window.removeEventListener('keydown', handlers.arrowKeydown);
    if (handlers.playerbarWheel) playerbar?.removeEventListener('wheel', handlers.playerbarWheel);
    if (handlers.playerbarEnter)
      playerbar?.removeEventListener('mouseenter', handlers.playerbarEnter);
    if (handlers.playerbarLeave)
      playerbar?.removeEventListener('mouseleave', handlers.playerbarLeave);
    if (handlers.panelWheel) panel?.removeEventListener('wheel', handlers.panelWheel);

    this.observers?.slider?.disconnect();
    document.querySelector('#volumeHud')?.remove();
  },
});
