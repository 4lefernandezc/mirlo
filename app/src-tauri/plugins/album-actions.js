/*
 * Mirlo plugin: album-actions
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/album-actions/ (index.tsx + templates/*.tsx)
 * Adapted to the Mirlo plugin host: plain DOM/SVG construction instead of
 * SolidJS (Trusted Types), `#browse-page` awaited through the host helper,
 * and `stop()` also disconnects the page observer (so the plugin can be
 * disabled cleanly).
 */
__MIRLO_PLUGINS__.register('album-actions', {
  defaults: { enabled: false },

  observer: null,
  loadObserver: null,
  changeObserver: null,
  waiting: false,
  maskSetters: null,

  DEFAULT_MASK_SIZE: '100% 50%',

  // upstream templates/like-button.tsx, unlike-button.tsx,
  // dislike-button.tsx, undislike-button.tsx (render order: un-dislike,
  // dislike, like, un-like)
  BUTTON_DEFS: [
    {
      id: 'allundislike',
      filled: 'true',
      label: 'Remove dislike from all',
      path: 'M17,4h-1H6.57C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21 c0.58,0,1.14-0.24,1.52-0.65L17,14h4V4H17z M10.4,19.67C10.21,19.88,9.92,20,9.62,20c-0.26,0-0.5-0.11-0.63-0.3 c-0.07-0.1-0.15-0.26-0.09-0.47l1.52-4.94l0.4-1.29H9.46H5.23c-0.41,0-0.8-0.17-1.03-0.46c-0.12-0.15-0.25-0.4-0.18-0.72l1.34-6 C5.46,5.35,5.97,5,6.57,5H16v8.61L10.4,19.67z M20,13h-3V5h3V13z',
    },
    {
      id: 'alldislike',
      filled: 'false',
      label: 'Dislike all',
      path: 'M18,4h3v10h-3V4z M5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21c0.58,0,1.14-0.24,1.52-0.65L17,14V4H6.57 C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14z',
    },
    {
      id: 'alllike',
      filled: 'false',
      label: 'Like all',
      path: 'M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43 c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z',
    },
    {
      id: 'allunlike',
      filled: 'true',
      label: 'Remove like from all',
      path: 'M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11H3v10h4h1h9.43 c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z M7,20H4v-8h3V20z M19.98,13.17l-1.34,6 C18.54,19.65,18.03,20,17.43,20H8v-8.61l5.6-6.06C13.79,5.12,14.08,5,14.38,5c0.26,0,0.5,0.11,0.63,0.3 c0.07,0.1,0.15,0.26,0.09,0.47l-1.52,4.94L13.18,12h1.35h4.23c0.41,0,0.8,0.17,1.03,0.46C19.92,12.61,20.05,12.86,19.98,13.17z',
    },
  ],

  buildSvg(path) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'style-scope yt-icon');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute(
      'style',
      'pointer-events:none;display:block;width:100%;height:100%;'
    );
    svg.setAttribute('viewBox', '0 0 24 24');

    const group = document.createElementNS(svgNs, 'g');
    group.setAttribute('class', 'style-scope yt-icon');
    const pathElement = document.createElementNS(svgNs, 'path');
    pathElement.setAttribute('class', 'style-scope yt-icon');
    pathElement.setAttribute('d', path);
    pathElement.setAttribute('fill', 'currentColor');
    group.appendChild(pathElement);
    svg.appendChild(group);
    return svg;
  },

  iconBox(path) {
    const box = document.createElement('div');
    box.setAttribute('style', 'width:24px;height:24px;');
    box.appendChild(this.buildSvg(path));
    return box;
  },

  buildButton(def, onClick, setMask) {
    const wrapper = document.createElement('div');
    wrapper.className = 'style-scope';

    const button = document.createElement('button');
    button.setAttribute('aria-label', def.label);
    button.setAttribute('aria-pressed', 'false');
    button.className =
      'like-menu yt-spec-button-shape-next yt-spec-button-shape-next--text ' +
      'yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m ' +
      'yt-spec-button-shape-next--icon-button';
    button.setAttribute('data-filled', def.filled);
    button.setAttribute('data-type', def.id.includes('like') ? 'like' : 'dislike');
    button.id = def.id;
    button.addEventListener('click', onClick);

    const icon = document.createElement('div');
    icon.setAttribute('aria-hidden', 'true');
    icon.className = 'yt-spec-button-shape-next__icon';
    icon.style.color = 'var(--ytmusic-setting-item-toggle-active)';

    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.className = 'yt-spec-button-shape-next__icon';
    overlay.style.color = 'white';
    overlay.style.mask = 'linear-gradient(grey, grey)';
    overlay.style.webkitMask = 'linear-gradient(grey, grey)';
    overlay.style.webkitMaskSize = this.DEFAULT_MASK_SIZE;
    overlay.style.webkitMaskRepeat = 'no-repeat';
    overlay.style.zIndex = '1';
    overlay.style.position = 'absolute';
    overlay.appendChild(this.iconBox(def.path));

    icon.appendChild(overlay);
    icon.appendChild(this.iconBox(def.path));

    const feedback = document.createElement('yt-touch-feedback-shape');
    feedback.style.borderRadius = 'inherit';
    const feedbackInner = document.createElement('div');
    feedbackInner.setAttribute('aria-hidden', 'true');
    feedbackInner.className =
      'yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response';
    feedbackInner.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'yt-spec-touch-feedback-shape__stroke',
      })
    );
    feedbackInner.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'yt-spec-touch-feedback-shape__fill',
      })
    );
    feedback.appendChild(feedbackInner);

    button.appendChild(icon);
    button.appendChild(feedback);
    wrapper.appendChild(button);

    setMask((size) => {
      overlay.style.webkitMaskSize = size;
    });
    return wrapper;
  },

  buildButtonContainer() {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'row';

    this.maskSetters = {};
    for (const def of this.BUTTON_DEFS) {
      buttonContainer.appendChild(
        this.buildButton(
          def,
          this.loadFullList,
          (setter) => (this.maskSetters[def.id] = setter)
        )
      );
    }
    return buttonContainer;
  },

  // --- ported lifecycle --------------------------------------------------
  async start() {
    // Waits for pagechange
    this.onPageChange();
    const browsePage = await __MIRLO_PLUGINS__.waitForElement('#browse-page');
    if (!browsePage) return;

    this.observer = new MutationObserver(() => {
      this.onPageChange();
    });
    this.observer.observe(browsePage, {
      attributes: false,
      childList: true,
      subtree: true,
    });
  },

  async onPageChange() {
    if (this.waiting) {
      return;
    } else {
      this.waiting = true;
    }
    const continuations = await __MIRLO_PLUGINS__.waitForElement('#continuations');
    this.waiting = false;
    if (!continuations) return;

    const buttonContainer = this.buildButtonContainer();

    // Finds the playlist
    const playlist =
      document.querySelector('ytmusic-playlist-shelf-renderer') ??
      document.querySelector(':nth-last-child(1 of ytmusic-shelf-renderer)');

    if (!playlist) {
      return;
    }

    // Adds an observer for every button, so it gets updated when one is clicked
    this.changeObserver?.disconnect();

    this.changeObserver = new MutationObserver(() => {
      this.stop();
      this.start();
    });
    const allButtons = playlist.querySelectorAll(
      'yt-button-shape.ytmusic-like-button-renderer'
    );
    for (const btn of allButtons) {
      this.changeObserver.observe(btn, {
        attributes: true,
        childList: false,
        subtree: false,
      });
    }
    // Determine if button is needed and colors the percentage
    const listsLength = playlist.querySelectorAll(
      '#button-shape-dislike > button'
    ).length;
    if (continuations.children.length == 0 && listsLength > 0) {
      const counts = {
        alldislike: playlist?.querySelectorAll(
          '#button-shape-dislike > button[aria-pressed=true]'
        ).length,
        allundislike: playlist?.querySelectorAll(
          '#button-shape-dislike > button[aria-pressed=false]'
        ).length,
        allunlike: playlist?.querySelectorAll(
          '#button-shape-like > button[aria-pressed=false]'
        ).length,
        alllike: playlist?.querySelectorAll(
          '#button-shape-like > button[aria-pressed=true]'
        ).length,
      };
      for (const [id, size] of Object.entries(counts)) {
        const button = buttonContainer.querySelector(`#${id}`);
        const wrapper = button?.parentElement;
        if (size > 0) {
          if (wrapper) wrapper.style.display = '';
          this.maskSetters?.[id]?.(`100% ${100 - (size / listsLength) * 100}%`);
        } else if (wrapper) {
          wrapper.style.display = 'none';
        }
      }
    }
    const menuParent = document.querySelector('#action-buttons')?.parentElement;
    if (menuParent && !document.querySelector('.like-menu')) {
      const menu = document.createElement('div');
      menu.id = 'mirlo-album-action-buttons';
      menu.className =
        'action-buttons style-scope ytmusic-responsive-header-renderer';

      menuParent.insertBefore(
        menu,
        menuParent.children[menuParent.children.length - 1]
      );
      menu.appendChild(buttonContainer);
    }
  },

  loadFullList(event) {
    if (event.target instanceof Element) {
      event.stopPropagation();
      const button = event.target.closest('button');
      if (!button?.id) return;
      const id = button.id;
      const loader = document.getElementById('continuations');
      if (!loader) return;
      this.loadObserver = new MutationObserver(() => {
        this.applyToList(id, loader);
      });
      this.applyToList(id, loader);
      this.loadObserver.observe(loader, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      loader?.style.setProperty('top', '0');
      loader?.style.setProperty('left', '50%');
      loader?.style.setProperty('position', 'absolute');
    }
  },

  applyToList(id, loader) {
    if (loader.children.length != 0) return;
    this.loadObserver?.disconnect();
    let playlistButtons;
    const playlist =
      document.querySelector('ytmusic-playlist-shelf-renderer') ??
      document.querySelector(':nth-last-child(1 of ytmusic-shelf-renderer)');
    switch (id) {
      case 'allundislike':
        playlistButtons = playlist?.querySelectorAll(
          '#button-shape-dislike > button[aria-pressed=true]'
        );
        break;
      case 'alldislike':
        playlistButtons = playlist?.querySelectorAll(
          '#button-shape-dislike > button[aria-pressed=false]'
        );
        break;
      case 'alllike':
        playlistButtons = playlist?.querySelectorAll(
          '#button-shape-like > button[aria-pressed=false]'
        );
        break;
      case 'allunlike':
        playlistButtons = playlist?.querySelectorAll(
          '#button-shape-like > button[aria-pressed=true]'
        );
        break;
      default:
    }
    playlistButtons?.forEach((elem) => elem.click());
  },

  stop() {
    this.observer?.disconnect();
    this.changeObserver?.disconnect();
    this.loadObserver?.disconnect();
    this.observer = null;
    this.changeObserver = null;
    this.loadObserver = null;
    for (const button of document.querySelectorAll('.like-menu')) {
      button.remove();
    }
    document.querySelector('#mirlo-album-action-buttons')?.remove();
  },
});
