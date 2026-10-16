/*
 * Mirlo plugin: playback-speed
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/playback-speed/index.ts + renderer.tsx + components/slider.tsx
 *   (+ helpers from plugins/utils/renderer/check.ts)
 * Adapted to the Mirlo plugin host. Deviations:
 *   - no SolidJS: the slider DOM is built directly (same markup/classes/ids);
 *   - the speed value lives in memory for the session (upstream also only
 *     persisted through the app's own config; plain option persistence can
 *     be added when the settings UI lands).
 */
__MIRLO_PLUGINS__.register('playback-speed', {
  defaults: { enabled: false },

  MIN_PLAYBACK_SPEED: 0.07,
  MAX_PLAYBACK_SPEED: 16,

  speed: 1,
  title: 'Playback speed',
  sliderContainer: null,
  menuObserver: null,

  // From plugins/utils/renderer/check.ts (upstream)
  isMusicOrVideoTrack() {
    for (const menuSelector of document.querySelectorAll('tp-yt-paper-listbox #navigation-endpoint')) {
      if (
        menuSelector?.data?.addToPlaylistEndpoint?.videoId ||
        menuSelector?.data?.watchEndpoint?.videoId
      ) {
        return true;
      }
    }
    return false;
  },

  isPlayerMenu(menu) {
    return menu?.parentElement?.ytEventForwardingBehavior?.forwarder_?.eventSink?.matches(
      'ytmusic-menu-renderer.ytmusic-player-bar'
    );
  },

  forcePlaybackRate(e) {
    if (e.target instanceof HTMLVideoElement) {
      const videoElement = e.target;
      if (videoElement.playbackRate !== this.speed) {
        videoElement.playbackRate = this.speed;
      }
    }
  },

  roundToTwo(n) {
    return Math.round(n * 1e2) / 1e2;
  },

  updatePlaybackSpeed() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      videoElement.playbackRate = this.speed;
    }

    const slider = this.sliderContainer?.querySelector('tp-yt-paper-slider');
    if (slider) {
      slider.setAttribute('value', String(this.speed));
      slider.setAttribute('aria-valuenow', String(this.speed));
    }
    const label = this.sliderContainer?.querySelector('#ytmcustom-playback-speed');
    if (label) {
      label.textContent = `${this.title} (${this.speed})`;
    }
  },

  buildSliderContainer() {
    const container = document.createElement('div');
    container.setAttribute('aria-disabled', 'false');
    container.setAttribute('aria-selected', 'false');
    container.className = 'style-scope menu-item ytmusic-menu-popup-renderer';
    container.setAttribute('role', 'option');
    container.setAttribute('tabindex', '-1');

    const endpoint = document.createElement('div');
    endpoint.className = 'yt-simple-endpoint style-scope ytmusic-menu-navigation-item-renderer';
    endpoint.id = 'navigation-endpoint';
    endpoint.setAttribute('tabindex', '-1');

    const slider = document.createElement('tp-yt-paper-slider');
    slider.setAttribute('aria-disabled', 'false');
    slider.setAttribute('aria-label', this.title);
    slider.setAttribute('aria-valuemax', '2');
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuenow', String(this.speed));
    slider.className = 'volume-slider style-scope ytmusic-player-bar on-hover';
    slider.setAttribute('dir', 'ltr');
    slider.setAttribute('max', '2');
    slider.setAttribute('min', '0');
    slider.setAttribute('role', 'slider');
    slider.setAttribute('step', '0.125');
    slider.setAttribute('style', 'display: inherit !important');
    slider.setAttribute('tabindex', '0');
    slider.setAttribute('title', this.title);
    slider.setAttribute('value', String(this.speed));

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'style-scope tp-yt-paper-slider';
    sliderContainer.id = 'sliderContainer';

    const barContainer = document.createElement('div');
    barContainer.className = 'bar-container style-scope tp-yt-paper-slider';

    const progress = document.createElement('tp-yt-paper-progress');
    progress.setAttribute('aria-disabled', 'false');
    progress.setAttribute('aria-hidden', 'true');
    progress.setAttribute('aria-valuemax', '2');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuenow', '1');
    progress.className = 'style-scope tp-yt-paper-slider';
    progress.id = 'sliderBar';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('style', 'touch-action: none');
    progress.setAttribute('value', '1');

    const progressContainer = document.createElement('div');
    progressContainer.className = 'style-scope tp-yt-paper-progress';
    progressContainer.id = 'progressContainer';

    const secondaryProgress = document.createElement('div');
    secondaryProgress.className = 'style-scope tp-yt-paper-progress';
    secondaryProgress.hidden = true;
    secondaryProgress.id = 'secondaryProgress';
    secondaryProgress.setAttribute('style', 'transform: scaleX(0)');

    const primaryProgress = document.createElement('div');
    primaryProgress.className = 'style-scope tp-yt-paper-progress';
    primaryProgress.id = 'primaryProgress';
    primaryProgress.setAttribute('style', 'transform: scaleX(0.5)');

    progressContainer.appendChild(secondaryProgress);
    progressContainer.appendChild(primaryProgress);
    progress.appendChild(progressContainer);
    barContainer.appendChild(progress);

    const knob = document.createElement('div');
    knob.className = 'slider-knob style-scope tp-yt-paper-slider';
    knob.id = 'sliderKnob';
    knob.setAttribute('style', 'left: 50%; touch-action: none');

    const knobInner = document.createElement('input');
    knobInner.className = 'slider-knob-inner style-scope tp-yt-paper-slider';
    knobInner.setAttribute('value', '1');
    knob.appendChild(knobInner);

    sliderContainer.appendChild(barContainer);
    sliderContainer.appendChild(knob);
    slider.appendChild(sliderContainer);

    const label = document.createElement('div');
    label.className = 'text style-scope ytmusic-menu-navigation-item-renderer';
    label.id = 'ytmcustom-playback-speed';
    label.textContent = `${this.title} (${this.speed})`;

    endpoint.appendChild(slider);
    endpoint.appendChild(label);
    container.appendChild(endpoint);

    slider.addEventListener('immediate-value-changed', (e) => {
      let targetSpeed = Number((e.detail || {}).value ?? this.MIN_PLAYBACK_SPEED);

      if (isNaN(targetSpeed)) {
        targetSpeed = 1;
      }

      targetSpeed = Math.min(
        Math.max(this.MIN_PLAYBACK_SPEED, targetSpeed),
        this.MAX_PLAYBACK_SPEED
      );

      this.speed = targetSpeed;
      this.updatePlaybackSpeed();
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();

      if (isNaN(this.speed)) {
        this.speed = 1;
      }

      // E.deltaY < 0 means wheel-up
      this.speed = this.roundToTwo(
        e.deltaY < 0
          ? Math.min(this.speed + 0.01, this.MAX_PLAYBACK_SPEED)
          : Math.max(this.speed - 0.01, this.MIN_PLAYBACK_SPEED)
      );

      this.updatePlaybackSpeed();
    });

    return container;
  },

  onPlayerApiReady() {
    this.sliderContainer = this.buildSliderContainer();

    const observer = new MutationObserver(() => {
      const menu = document.querySelector('ytmusic-menu-popup-renderer tp-yt-paper-listbox');

      if (
        menu &&
        !menu.contains(this.sliderContainer) &&
        this.isMusicOrVideoTrack() &&
        this.isPlayerMenu(menu)
      ) {
        menu.prepend(this.sliderContainer);
      }
    });

    const popupContainer = document.querySelector('ytmusic-popup-container');
    if (popupContainer) {
      observer.observe(popupContainer, {
        childList: true,
        subtree: true,
      });
    }
    this.menuObserver = observer;

    const video = document.querySelector('video');
    if (video) {
      video.addEventListener('ratechange', this.forcePlaybackRate);
      video.addEventListener('ytmd:src-changed', this.forcePlaybackRate);
    }
  },

  stop() {
    this.menuObserver?.disconnect();
    this.menuObserver = null;

    const video = document.querySelector('video');
    if (video) {
      video.removeEventListener('ratechange', this.forcePlaybackRate);
      video.removeEventListener('ytmd:src-changed', this.forcePlaybackRate);
    }

    this.sliderContainer?.remove();
    this.sliderContainer = null;
  },
});
