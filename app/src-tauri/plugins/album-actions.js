/*
 * Mirlo plugin: album-actions
 *
 * Ported from pear-desktop v3.11.0 (MIT, Â© 2021-2024 th-ch and pear-devs):
 *   src/plugins/album-actions/ (index.tsx + templates/*.tsx)
 * Adapted to the Mirlo plugin host: plain DOM/SVG construction instead of
 * SolidJS (Trusted Types), `#browse-page` awaited through the host helper,
 * and `stop()` also disconnects the page observer (so the plugin can be
 * disabled cleanly).
 */
__MIRLO_PLUGINS__.register('album-actions', {
  defaults: { enabled: false },

  styles: [
    `
#mirlo-album-action-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
}
.mirlo-bulk-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0 2px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}
.mirlo-bulk-button:hover {
  background: rgba(128, 128, 128, 0.2);
  opacity: 1;
}
.mirlo-bulk-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
.mirlo-bulk-icon {
  position: relative;
  width: 20px;
  height: 20px;
}
.mirlo-bulk-fill {
  position: absolute;
  inset: 0;
  -webkit-mask-image: linear-gradient(grey, grey);
  mask-image: linear-gradient(grey, grey);
  -webkit-mask-size: 100% 50%;
  mask-size: 100% 50%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
/* Bulk actions fire one like per row; YouTube shows the same "saved to liked
   music" snackbar for every click. Suppress the snackbars while applying. */
body.mirlo-bulk-action tp-yt-paper-toast,
body.mirlo-bulk-action paper-toast,
body.mirlo-bulk-action ytmusic-toast,
body.mirlo-bulk-action ytmusic-notification-action-renderer,
body.mirlo-bulk-action #toast {
  display: none !important;
}
`,
  ],

  observer: null,
  changeObserver: null,
  waiting: false,
  maskSetters: null,
  toastTimer: null,

  // upstream templates/like-button.tsx, unlike-button.tsx,
  // dislike-button.tsx, undislike-button.tsx (render order: un-dislike,
  // dislike, like, un-like)
  BUTTON_DEFS: [
    {
      id: 'allundislike',
      label: 'Remove dislike from all',
      path: 'M17,4h-1H6.57C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21 c0.58,0,1.14-0.24,1.52-0.65L17,14h4V4H17z M10.4,19.67C10.21,19.88,9.92,20,9.62,20c-0.26,0-0.5-0.11-0.63-0.3 c-0.07-0.1-0.15-0.26-0.09-0.47l1.52-4.94l0.4-1.29H9.46H5.23c-0.41,0-0.8-0.17-1.03-0.46c-0.12-0.15-0.25-0.4-0.18-0.72l1.34-6 C5.46,5.35,5.97,5,6.57,5H16v8.61L10.4,19.67z M20,13h-3V5h3V13z',
    },
    {
      id: 'alldislike',
      label: 'Dislike all',
      path: 'M18,4h3v10h-3V4z M5.23,14h4.23l-1.52,4.94C7.62,19.97,8.46,21,9.62,21c0.58,0,1.14-0.24,1.52-0.65L17,14V4H6.57 C5.5,4,4.59,4.67,4.38,5.61l-1.34,6C2.77,12.85,3.82,14,5.23,14z',
    },
    {
      id: 'alllike',
      label: 'Like all',
      path: 'M3,11h3v10H3V11z M18.77,11h-4.23l1.52-4.94C16.38,5.03,15.54,4,14.38,4c-0.58,0-1.14,0.24-1.52,0.65L7,11v10h10.43 c1.06,0,1.98-0.67,2.19-1.61l1.34-6C21.23,12.15,20.18,11,18.77,11z',
    },
    {
      id: 'allunlike',
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
    box.setAttribute('style', 'width:20px;height:20px;');
    box.appendChild(this.buildSvg(path));
    return box;
  },

  buildButton(def, onClick, setMask) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = def.id;
    button.className = 'mirlo-bulk-button';
    button.title = def.label;
    button.setAttribute('aria-label', def.label);
    button.addEventListener('click', onClick);

    const icon = document.createElement('div');
    icon.className = 'mirlo-bulk-icon';
    icon.setAttribute('aria-hidden', 'true');

    const base = this.iconBox(def.path);
    base.style.opacity = '0.45';

    const fill = document.createElement('div');
    fill.className = 'mirlo-bulk-fill';
    fill.appendChild(this.iconBox(def.path));

    icon.appendChild(base);
    icon.appendChild(fill);
    button.appendChild(icon);

    setMask((size) => {
      fill.style.webkitMaskSize = size;
      fill.style.maskSize = size;
    });
    return button;
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

  onPageChange() {
    if (this.waiting) return;
    this.waiting = true;
    try {
      this.mountButtons();
    } finally {
      this.waiting = false;
    }
  },

  mountButtons() {
    // Finds the playlist
    const playlist =
      document.querySelector('ytmusic-playlist-shelf-renderer') ??
      document.querySelector(':nth-last-child(1 of ytmusic-shelf-renderer)');

    if (!playlist) {
      return;
    }

    // Bulk actions only make sense where tracks expose like/dislike buttons;
    // album pages do not, so do not inject dead buttons there. Removing the
    // container re-triggers the page observer once, so this must not run on
    // the insert path (that would loop forever and freeze the UI).
    const listsLength = playlist.querySelectorAll(
      '#button-shape-dislike > button'
    ).length;
    if (listsLength === 0) {
      document.querySelector('#mirlo-album-action-buttons')?.remove();
      return;
    }

    const buttonContainer = this.buildButtonContainer();

    // The like/dislike buttons change aria-pressed after an action; refresh
    // the bulk rows from that instead of rebuilding the whole menu.
    this.changeObserver?.disconnect();
    this.changeObserver = new MutationObserver(() => this.refresh());
    for (const btn of playlist.querySelectorAll(
      '#button-shape-like, #button-shape-dislike'
    )) {
      this.changeObserver.observe(btn, {
        attributes: true,
        childList: false,
        subtree: true,
      });
    }
    this.updateCounts(playlist, buttonContainer);
    const menuParent = document.querySelector('#action-buttons')?.parentElement;
    if (menuParent && !document.querySelector('#mirlo-album-action-buttons')) {
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

  refresh() {
    const playlist =
      document.querySelector('ytmusic-playlist-shelf-renderer') ??
      document.querySelector(':nth-last-child(1 of ytmusic-shelf-renderer)');
    const buttonContainer = document.querySelector(
      '#mirlo-album-action-buttons > div'
    );
    if (playlist && buttonContainer) this.updateCounts(playlist, buttonContainer);
  },

  updateCounts(playlist, buttonContainer) {
    const total = playlist.querySelectorAll(
      '#button-shape-dislike > button'
    ).length;
    if (!total) return;
    const liked = playlist.querySelectorAll(
      '#button-shape-like > button[aria-pressed=true]'
    ).length;
    const disliked = playlist.querySelectorAll(
      '#button-shape-dislike > button[aria-pressed=true]'
    ).length;
    // Each button acts on the tracks that are not yet in its target state, so
    // it is shown only while there is work to do. The fill shows how much
    // work remains.
    const pending = {
      alllike: total - liked,
      allunlike: liked,
      alldislike: total - disliked,
      allundislike: disliked,
    };
    for (const [id, count] of Object.entries(pending)) {
      const button = buttonContainer.querySelector(`#${id}`);
      if (!button) continue;
      if (count > 0) {
        button.style.display = '';
        this.maskSetters?.[id]?.(`100% ${(count / total) * 100}%`);
      } else {
        button.style.display = 'none';
      }
    }
  },

  loadFullList(event) {
    if (!(event.target instanceof Element)) return;
    event.stopPropagation();
    const button = event.target.closest('button');
    if (button?.id) this.applyToList(button.id);
  },

  applyToList(id) {
    const selectors = {
      allundislike: '#button-shape-dislike > button[aria-pressed=true]',
      alldislike: '#button-shape-dislike > button[aria-pressed=false]',
      alllike: '#button-shape-like > button[aria-pressed=false]',
      allunlike: '#button-shape-like > button[aria-pressed=true]',
    };
    if (!selectors[id]) return;
    const playlist =
      document.querySelector('ytmusic-playlist-shelf-renderer') ??
      document.querySelector(':nth-last-child(1 of ytmusic-shelf-renderer)');

    // One like per row means one snackbar per row; hide them for the burst.
    document.body.classList.add('mirlo-bulk-action');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      document.body.classList.remove('mirlo-bulk-action');
      this.toastTimer = null;
    }, 2500);

    playlist?.querySelectorAll(selectors[id]).forEach((elem) => elem.click());
    // YouTube flips aria-pressed asynchronously; refresh once it settles.
    setTimeout(() => this.refresh(), 300);
  },

  stop() {
    this.observer?.disconnect();
    this.changeObserver?.disconnect();
    this.observer = null;
    this.changeObserver = null;
    clearTimeout(this.toastTimer);
    this.toastTimer = null;
    document.body.classList.remove('mirlo-bulk-action');
    for (const button of document.querySelectorAll('.mirlo-bulk-button')) {
      button.remove();
    }
    document.querySelector('#mirlo-album-action-buttons')?.remove();
  },
});
