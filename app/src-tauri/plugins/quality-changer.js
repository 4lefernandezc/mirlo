/*
 * Mirlo plugin: quality-changer
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/quality-changer/ (index.tsx + templates/quality-setting-button.tsx)
 * Adapted to the Mirlo plugin host. Deviation: the Electron native dialog is
 * replaced by the host's in-page choice menu (`showChoiceMenu`), and the
 * gear button is built with DOM/SVG APIs (YouTube Music enforces Trusted
 * Types, so string HTML is not allowed).
 */
__MIRLO_PLUGINS__.register('quality-changer', {
  defaults: { enabled: false },

  buttonContainer: null,
  api: null,

  buildButton() {
    const label = 'Player quality';

    const button = document.createElement('yt-icon-button');
    button.setAttribute('aria-disabled', 'false');
    button.setAttribute('aria-label', label);
    button.className = 'player-quality-button style-scope ytmusic-player';
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
      'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.1-1.65c.2-.15.25-.42.13-.64l-2-3.46c-.12-.22-.4-.3-.6-.22l-2.5 1c-.52-.4-1.08-.73-1.7-.98l-.37-2.65c-.06-.24-.27-.42-.5-.42h-4c-.27 0-.48.18-.5.42l-.4 2.65c-.6.25-1.17.6-1.7.98l-2.48-1c-.23-.1-.5 0-.6.22l-2 3.46c-.14.22-.08.5.1.64l2.12 1.65c-.04.32-.07.65-.07.98s.02.66.06.98l-2.1 1.65c-.2.15-.25.42-.13.64l2 3.46c.12.22.4.3.6.22l2.5-1c.52.4 1.08.73 1.7.98l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.6-.25 1.17-.6 1.7-.98l2.48 1c.23.1.5 0 .6-.22l2-3.46c.13-.22.08-.5-.1-.64l-2.12-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z'
    );
    path.setAttribute('fill', 'currentColor');

    const group = document.createElementNS(svgNs, 'g');
    group.setAttribute('class', 'style-scope yt-icon');
    group.appendChild(path);
    svg.appendChild(group);
    holder.appendChild(svg);
    shape.appendChild(holder);
    button.appendChild(shape);

    button.addEventListener('click', (e) => this.chooseQuality(e));
    return button;
  },

  chooseQuality(event) {
    event.stopPropagation();

    const api = this.api;
    if (!api) return;

    const qualityLevels = api.getAvailableQualityLevels();
    const labels = api.getAvailableQualityLabels();
    const currentLevel = api.getPlaybackQuality();

    __MIRLO_PLUGINS__.showChoiceMenu(
      event.currentTarget,
      labels.map((label, index) => ({
        label,
        value: qualityLevels[index],
        selected: qualityLevels[index] === currentLevel,
      })),
      (newQuality) => {
        api.setPlaybackQualityRange(newQuality);
        api.setPlaybackQuality(newQuality);
      }
    );
  },

  onPlayerApiReady(api) {
    this.api = api;
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.appendChild(this.buildButton());
    document
      .querySelector('.top-row-buttons.ytmusic-player')
      ?.prepend(this.buttonContainer);
  },

  stop() {
    this.buttonContainer?.remove();
    this.buttonContainer = null;
  },
});
