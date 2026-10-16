/*
 * Mirlo plugin: video-toggle
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/video-toggle/index.tsx + templates/video-switch-button.tsx
 *   + button-switcher.css + force-hide.css
 * Adapted to the Mirlo plugin host. Deviations:
 *   - no SolidJS: the switch button DOM is built directly (same classes/ids);
 *   - `precise-volume` volume-HUD repositioning is a no-op until that plugin
 *     is ported (guarded through `ctx.isEnabled`);
 *   - mode changes take effect after a reload (upstream marks the plugin
 *     `restartNeeded` too).
 */
__MIRLO_PLUGINS__.register('video-toggle', {
  defaults: {
    enabled: false,
    hideVideo: false,
    mode: 'custom',
    forceHide: false,
    align: 'left',
  },
  styles: [
    // button-switcher.css
    `
.video-toggle-custom-mode #main-panel.ytmusic-player-page {
  align-items: unset !important;
}

.video-toggle-custom-mode #main-panel {
  position: relative;
}

.video-toggle-custom-mode .video-switch-button {
  z-index: 999;
  box-sizing: border-box;
  padding: 0;
  margin-top: 20px;
  margin-left: 10px;
  background: rgba(33, 33, 33, 0.4);
  border-radius: 30px;
  overflow: hidden;
  width: 20rem;
  text-align: center;
  font-size: 18px;
  letter-spacing: 1px;
  color: #fff;
  padding-right: 10rem;
  position: absolute;
}

.video-toggle-custom-mode .video-switch-button:before {
  content: attr(data-video-button-text);
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 10rem;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  pointer-events: none;
}

.video-toggle-custom-mode .video-switch-button-checkbox {
  cursor: pointer;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  z-index: 2;
}

.video-toggle-custom-mode .video-switch-button-label-span {
  position: relative;
}

.video-toggle-custom-mode
  .video-switch-button-checkbox:checked
  + .video-switch-button-label:before {
  transform: translateX(10rem);
  transition: transform 300ms linear;
}

.video-toggle-custom-mode
  .video-switch-button-checkbox
  + .video-switch-button-label {
  position: relative;
  padding: 15px 0;
  display: block;
  user-select: none;
  pointer-events: none;
}

.video-toggle-custom-mode
  .video-switch-button-checkbox
  + .video-switch-button-label:before {
  content: '';
  background: rgba(60, 60, 60, 0.4);
  height: 100%;
  width: 100%;
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 30px;
  transform: translateX(0);
  transition: transform 300ms;
}

/* disable the native toggler */
.video-toggle-custom-mode #av-id {
  display: none;
}
`,
    // force-hide.css
    `
/* Hide the video player */
.video-toggle-force-hide #main-panel {
  display: none !important;
}

/* Make the side-panel full width */
.video-toggle-force-hide .side-panel.ytmusic-player-page {
  max-width: 100% !important;
  width: 100% !important;
  margin: 0 !important;
}
`,
  ],

  config: null,
  api: null,

  applyStyleClass(config) {
    if (config.forceHide) {
      document.body.classList.add('video-toggle-force-hide');
      document.body.classList.remove('video-toggle-custom-mode');
    } else if (!config.mode || config.mode === 'custom') {
      document.body.classList.add('video-toggle-custom-mode');
      document.body.classList.remove('video-toggle-force-hide');
    }
  },

  async start(ctx) {
    this.ctx = ctx;
    const config = await ctx.getConfig();
    this.config = config;
    this.applyStyleClass(config);

    if (config.forceHide) {
      return;
    }

    switch (config.mode) {
      case 'native': {
        document
          .querySelector('ytmusic-player-page')
          ?.setAttribute('has-av-switcher', '');
        document.querySelector('ytmusic-player')?.setAttribute('has-av-switcher', '');
        document
          .querySelector('ytmusic-av-toggle')
          ?.removeAttribute('toggle-disabled');
        return;
      }

      case 'disabled': {
        document
          .querySelector('ytmusic-player-page')
          ?.removeAttribute('has-av-switcher');
        document
          .querySelector('ytmusic-player')
          ?.removeAttribute('has-av-switcher');
        document
          .querySelector('ytmusic-av-toggle')
          ?.setAttribute('toggle-disabled', '');
        return;
      }
    }
  },

  async onPlayerApiReady(api, ctx) {
    this.api = api;
    const config = this.config;

    // Mirlo: `#player` can render after the YouTube player element appears
    // (upstream runs in a later injection phase); wait for the container.
    const playerContainer = await __MIRLO_PLUGINS__.waitForElement('#player');

    // Upstream imports `precise-volume`'s moveVolumeHud directly; here the
    // hook is resolved through the plugin host when that plugin is enabled.
    const moveVolumeHud = (showVideo) => {
      if (!ctx.isEnabled('precise-volume')) return;
      window.__MIRLO_PLUGINS__.get('precise-volume')?.moveVolumeHud?.(showVideo);
    };

    const player = document.querySelector('ytmusic-player');
    const video = document.querySelector('video');

    const switchButtonContainer = document.createElement('div');
    switchButtonContainer.id = 'ytmd-video-toggle-switch-button-container';
    switchButtonContainer.style.display = 'flex';
    switchButtonContainer.addEventListener('click', (e) => e.stopPropagation());

    const switchButton = document.createElement('div');
    switchButton.className = 'video-switch-button';
    switchButton.setAttribute('data-video-button-text', 'Video');

    const checkbox = document.createElement('input');
    checkbox.checked = true;
    checkbox.className = 'video-switch-button-checkbox';
    checkbox.id = 'video-toggle-video-switch-button-checkbox';
    checkbox.type = 'checkbox';

    const label = document.createElement('label');
    label.className = 'video-switch-button-label';
    label.htmlFor = 'video-toggle-video-switch-button-checkbox';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'video-switch-button-label-span';
    labelSpan.textContent = 'Song';

    label.appendChild(labelSpan);
    switchButton.appendChild(checkbox);
    switchButton.appendChild(label);
    switchButtonContainer.appendChild(switchButton);

    const forceThumbnail = (img) => {
      const thumbnails = this.api?.getPlayerResponse()?.videoDetails?.thumbnail?.thumbnails ?? [];
      if (thumbnails && thumbnails.length > 0) {
        const thumbnail = thumbnails.at(-1)?.url.split('?')[0];
        if (thumbnail) img.src = thumbnail;
      }
    };

    const setVideoState = (showVideo) => {
      if (this.config) {
        this.config.hideVideo = !showVideo;
      }
      this.ctx.setConfig({ hideVideo: !showVideo }).catch(() => {});

      const checkboxElement = document.querySelector('.video-switch-button-checkbox');
      if (checkboxElement) checkboxElement.checked = !this.config?.hideVideo;

      if (player) {
        player.style.margin = showVideo ? '' : 'auto 0px';
        player.setAttribute('playback-mode', showVideo ? 'OMV_PREFERRED' : 'ATV_PREFERRED');

        const songVideo = document.querySelector('#song-video.ytmusic-player');
        const songImage = document.querySelector('#song-image');
        if (songVideo) songVideo.style.display = showVideo ? 'block' : 'none';
        if (songImage) songImage.style.display = showVideo ? 'none' : 'block';

        if (showVideo && video && !video.style.top) {
          video.style.top = `${(player.clientHeight - video.clientHeight) / 2}px`;
        }

        moveVolumeHud(showVideo);
      }
    };

    checkbox.addEventListener('change', (e) => {
      setVideoState(e.target.checked);
    });

    let showButton = true;
    const applyShowButton = () => {
      switchButtonContainer.style.display = showButton ? 'flex' : 'none';
    };

    const videoStarted = () => {
      const details = this.api?.getPlayerResponse()?.videoDetails;
      if (!details) return;

      if (details.musicVideoType === 'MUSIC_VIDEO_TYPE_ATV') {
        // Video doesn't exist -> switch to song mode
        setVideoState(false);
        // Hide toggle button
        showButton = false;
        applyShowButton();
      } else {
        const songImage = document.querySelector('#song-image #img.style-scope.yt-img-shadow');
        if (!songImage) {
          return;
        }
        // Switch to high-res thumbnail
        forceThumbnail(songImage);
        // Show toggle button
        showButton = true;
        applyShowButton();
        // Change display to video mode if video exist & video is hidden & option.hideVideo = false
        if (
          !this.config?.hideVideo &&
          document.querySelector('#song-video.ytmusic-player')?.style.display === 'none'
        ) {
          setVideoState(true);
        } else {
          moveVolumeHud(!this.config?.hideVideo);
        }
      }
    };

    /**
     * On load, after a delay, the page overrides the playback-mode to 'OMV_PREFERRED' which causes weird aspect ratio in the image container
     * this function fix the problem by overriding that override :)
     */
    const forcePlaybackMode = () => {
      if (player) {
        const playbackModeObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.target instanceof HTMLElement) {
              const target = mutation.target;
              if (target.getAttribute('playback-mode') !== 'ATV_PREFERRED') {
                playbackModeObserver.disconnect();
                target.setAttribute('playback-mode', 'ATV_PREFERRED');
              }
            }
          }
        });
        playbackModeObserver.observe(player, {
          attributeFilter: ['playback-mode'],
        });
      }
    };

    const observeThumbnail = () => {
      const thumbnail = document.querySelector('#song-image #img.style-scope.yt-img-shadow');
      if (!thumbnail) return;
      const playbackModeObserver = new MutationObserver((mutations) => {
        if (!player || !player.videoMode_) {
          return;
        }

        for (const mutation of mutations) {
          if (mutation.target instanceof HTMLImageElement) {
            const target = mutation.target;
            if (!target.src.startsWith('data:')) {
              continue;
            }

            forceThumbnail(target);
          }
        }
      });
      playbackModeObserver.observe(thumbnail, { attributeFilter: ['src'] });
    };

    if (config && config.mode !== 'native' && config.mode !== 'disabled') {
      playerContainer?.prepend(switchButtonContainer);

      // Mirlo: YouTube Music re-creates the player container while booting,
      // which detaches the button; re-attach it when that happens.
      this.reattachObserver = new MutationObserver(() => {
        if (switchButtonContainer.isConnected) return;
        const container = document.querySelector('#player');
        if (container) container.prepend(switchButtonContainer);
      });
      this.reattachObserver.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });

      setVideoState(!config.hideVideo);
      applyShowButton();
      forcePlaybackMode();
      // Fix black video
      if (video) {
        video.style.height = 'auto';
      }

      video?.addEventListener('ytmd:src-changed', videoStarted);

      observeThumbnail();
      videoStarted();

      switch (config.align) {
        case 'right': {
          switchButtonContainer.style.justifyContent = 'flex-end';
          return;
        }

        case 'middle': {
          switchButtonContainer.style.justifyContent = 'center';
          return;
        }

        default:
        case 'left': {
          switchButtonContainer.style.justifyContent = 'flex-start';
        }
      }
    }
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
    this.applyStyleClass(newConfig);
  },

  stop() {
    if (this.reattachObserver) {
      this.reattachObserver.disconnect();
      this.reattachObserver = null;
    }
    document.querySelector('#ytmd-video-toggle-switch-button-container')?.remove();
    document.body.classList.remove('video-toggle-custom-mode', 'video-toggle-force-hide');
  },
});
