/*
 * Mirlo plugin: captions-selector
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/captions-selector/ (back.ts + renderer.tsx + template)
 * Adapted to the Mirlo plugin host. Deviations: the Electron prompt becomes
 * the host's in-page choice menu; the subtitles button is built with
 * DOM/SVG APIs (Trusted Types); the `ytmd:src-changed` video event comes
 * from the bridge's compatibility layer.
 */
__MIRLO_PLUGINS__.register('captions-selector', {
  defaults: {
    enabled: false,
    disableCaptions: false,
    autoload: false,
    lastCaptionsCode: '',
  },

  api: null,
  config: null,
  captionsSettingsButton: null,
  captionTrackList: null,
  hidden: false,

  buildButton() {
    const label = 'Captions';

    const button = document.createElement('yt-icon-button');
    button.setAttribute('aria-disabled', 'false');
    button.setAttribute('aria-label', label);
    button.className = 'player-captions-button style-scope ytmusic-player-bar';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('title', label);

    const shape = document.createElement('span');
    shape.className = 'yt-icon-shape style-scope yt-icon yt-spec-icon-shape';

    const holder = document.createElement('div');
    holder.setAttribute('style', 'width:100%;height:100%;display:block;fill:currentcolor;');

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'style-scope yt-icon');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute(
      'style',
      'pointer-events:none;display:block;width:100%;height:100%;'
    );
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('class', 'style-scope yt-icon');
    path.setAttribute(
      'd',
      'M20 4H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2zm-9 6H8v4h3v2H8c-1.103 0-2-.897-2-2v-4c0-1.103.897-2 2-2h3v2zm7 0h-3v4h3v2h-3c-1.103 0-2-.897-2-2v-4c0-1.103.897-2 2-2h3v2z'
    );
    path.setAttribute('fill', 'currentColor');

    const group = document.createElementNS(svgNs, 'g');
    group.setAttribute('class', 'style-scope yt-icon');
    group.appendChild(path);
    svg.appendChild(group);
    holder.appendChild(svg);
    shape.appendChild(holder);
    button.appendChild(shape);

    button.addEventListener('click', (e) => this.chooseCaptions(e));
    return button;
  },

  toast(message) {
    document.querySelector('ytmusic-app')?.toastService?.show(message);
  },

  updateVisibility() {
    if (!this.captionsSettingsButton) return;
    this.captionsSettingsButton.style.display = this.hidden ? 'none' : '';
  },

  videoChangeListener() {
    if (this.config?.disableCaptions) {
      setTimeout(() => this.api?.unloadModule('captions'), 100);
      this.hidden = true;
      this.updateVisibility();
      return;
    }

    this.api?.loadModule('captions');

    setTimeout(() => {
      this.captionTrackList = this.api?.getOption('captions', 'tracklist') ?? [];

      if (this.config?.autoload && this.config?.lastCaptionsCode) {
        this.api?.setOption('captions', 'track', {
          languageCode: this.config.lastCaptionsCode,
        });
      }

      this.hidden = !this.captionTrackList?.length;
      this.updateVisibility();
    }, 250);
  },

  chooseCaptions(event) {
    const playerApi = this.api;
    if (!playerApi) return;

    if (this.captionTrackList?.length) {
      const currentCaptionTrack = playerApi.getOption('captions', 'track');
      const currentIndex = currentCaptionTrack
        ? this.captionTrackList.findIndex(
            (track) => track.languageCode === currentCaptionTrack.languageCode
          )
        : null;

      const items = this.captionTrackList.map((track, index) => ({
        label: track.displayName,
        value: index,
        selected: index === currentIndex,
      }));
      items.push({ label: 'None', value: null, selected: currentIndex === -1 });

      __MIRLO_PLUGINS__.showChoiceMenu(event.currentTarget, items, (index) => {
        const newCaptions = index === null ? undefined : this.captionTrackList[index];
        this.ctx.setConfig({ lastCaptionsCode: newCaptions?.languageCode ?? '' });

        if (newCaptions) {
          playerApi.setOption('captions', 'track', {
            languageCode: newCaptions.languageCode,
          });
          this.toast(`Captions: ${newCaptions.displayName}`);
        } else {
          playerApi.setOption('captions', 'track', {});
          this.toast('Captions disabled');
        }

        setTimeout(() => playerApi.playVideo(), 0);
      });
    } else {
      this.toast('No captions available');
    }
  },

  async start(ctx) {
    this.ctx = ctx;
    this.config = await ctx.getConfig();
  },

  onPlayerApiReady(playerApi) {
    this.api = playerApi;

    this.captionsSettingsButton = this.buildButton();
    const container = document.querySelector('.right-controls-buttons');
    if (container) container.appendChild(this.captionsSettingsButton);

    this.captionTrackList = this.api.getOption('captions', 'tracklist') ?? [];

    document
      .querySelector('video')
      ?.addEventListener('ytmd:src-changed', this.videoChangeListener);
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
  },

  stop() {
    this.api?.unloadModule('captions');
    document
      .querySelector('video')
      ?.removeEventListener('ytmd:src-changed', this.videoChangeListener);
    this.captionsSettingsButton?.remove();
    this.captionsSettingsButton = null;
  },
});
