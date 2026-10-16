/*
 * Mirlo plugin: navigation
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/navigation/ (index.tsx + style.css + back/forward buttons)
 * Adapted to the Mirlo plugin host: the buttons are built with DOM/SVG APIs
 * (Trusted Types) instead of SolidJS.
 */
__MIRLO_PLUGINS__.register('navigation', {
  defaults: { enabled: false },
  styles: [
    `
.navigation-item {
  font-family:
    Roboto,
    Noto Naskh Arabic UI,
    Arial,
    sans-serif;
  font-size: 20px;
  line-height: var(--ytmusic-title-1_-_line-height);
  font-weight: 500;
  --yt-endpoint-color: #fff;
  --yt-endpoint-hover-color: #fff;
  --yt-endpoint-visited-color: #fff;
  display: inline-flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  margin: 0 var(--ytd-margin-2x, 8px);
}

.navigation-item:hover {
  color: #fff;
}

.navigation-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  vertical-align: middle;
  fill: var(--iron-icon-fill-color, currentcolor);
  stroke: none;
  width: var(--iron-icon-width, 24px);
  height: var(--iron-icon-height, 24px);
  animation: var(--iron-icon_-_animation);
  padding: var(--ytd-margin-base, 4px) var(--ytd-margin-2x, 8px);
}
`,
  ],

  buttonContainer: null,

  buildButton({ title, tabId, path }) {
    const outer = document.createElement('div');
    outer.className = 'style-scope ytmusic-pivot-bar-renderer navigation-item';
    outer.setAttribute('role', 'tab');
    outer.setAttribute('tab-id', tabId);

    const inner = document.createElement('div');
    inner.setAttribute('aria-disabled', 'false');
    inner.className = 'search-icon style-scope ytmusic-search-box';
    inner.setAttribute('role', 'button');
    inner.setAttribute('tabindex', '0');
    inner.setAttribute('title', title);

    const iconHolder = document.createElement('div');
    iconHolder.className = 'tab-icon style-scope paper-icon-button navigation-icon';
    iconHolder.id = 'icon';

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'style-scope iron-icon');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute(
      'style',
      'pointer-events:none;display:block;width:100%;height:100%;'
    );
    svg.setAttribute('viewBox', '0 0 492 492');

    const pathElement = document.createElementNS(svgNs, 'path');
    pathElement.setAttribute('d', path);
    pathElement.setAttribute('fill', 'currentColor');

    const group = document.createElementNS(svgNs, 'g');
    group.setAttribute('class', 'style-scope iron-icon');
    group.appendChild(pathElement);
    svg.appendChild(group);
    iconHolder.appendChild(svg);
    inner.appendChild(iconHolder);
    outer.appendChild(inner);

    return outer;
  },

  start() {
    this.buttonContainer = document.createElement('div');

    const back = this.buildButton({
      title: 'Back',
      tabId: 'FEmusic_back',
      // upstream: back-button.tsx
      path: 'M109.3 265.2l218.9 218.9c5.1 5.1 11.8 7.9 19 7.9s14-2.8 19-7.9l16.1-16.1c10.5-10.5 10.5-27.6 0-38.1L198.6 246.1 382.7 62c5.1-5.1 7.9-11.8 7.9-19 0-7.2-2.8-14-7.9-19L366.5 7.9c-5.1-5.1-11.8-7.9-19-7.9-7.2 0-14 2.8-19 7.9L109.3 227c-5.1 5.1-7.9 11.9-7.8 19.1 0 7.2 2.8 14 7.8 19.1z',
    });
    back.addEventListener('click', () => history.back());

    const forward = this.buildButton({
      title: 'Forward',
      tabId: 'FEmusic_next',
      // upstream: forward-button.tsx
      path: 'M382.7,226.8L163.7,7.9c-5.1-5.1-11.8-7.9-19-7.9s-14,2.8-19,7.9L109.5,24c-10.5,10.5-10.5,27.6,0,38.1l183.9,183.9L109.3,430c-5.1,5.1-7.9,11.8-7.9,19c0,7.2,2.8,14,7.9,19l16.1,16.1c5.1,5.1,11.8,7.9,19,7.9s14-2.8,19-7.9L382.7,265c5.1-5.1,7.9-11.9,7.8-19.1C390.5,238.7,387.8,231.9,382.7,226.8z',
    });
    forward.addEventListener('click', () => history.forward());

    this.buttonContainer.appendChild(back);
    this.buttonContainer.appendChild(forward);

    document.querySelector('#right-content')?.prepend(this.buttonContainer);
  },

  stop() {
    this.buttonContainer?.remove();
    this.buttonContainer = null;
  },
});
