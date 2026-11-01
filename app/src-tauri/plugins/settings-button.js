/*
 * Mirlo plugin: settings-button
 *
 * Original to Mirlo. Adds a button to the top bar that opens the local
 * settings window through the reviewed `open_settings` command. It grants no
 * new page privilege: the page only asks the shell to show its own window.
 */
__MIRLO_PLUGINS__.register('settings-button', {
  // Mirlo default: enabled (this is the in-app entry point to Settings).
  defaults: { enabled: true },
  styles: [
    `
#mirlo-settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}
#mirlo-settings-button:hover {
  background: rgba(128, 128, 128, 0.18);
  opacity: 1;
}
#mirlo-settings-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
`,
  ],

  button: null,

  buildButton() {
    const svgNs = 'http://www.w3.org/2000/svg';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'mirlo-settings-button';
    button.title = 'Mirlo settings';
    button.setAttribute('aria-label', 'Mirlo settings');

    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const lines = document.createElementNS(svgNs, 'path');
    lines.setAttribute('d', 'M4 7h8M18 7h2M4 17h2M12 17h8');
    svg.appendChild(lines);

    for (const [cx, cy] of [
      [15, 7],
      [9, 17],
    ]) {
      const knob = document.createElementNS(svgNs, 'circle');
      knob.setAttribute('cx', String(cx));
      knob.setAttribute('cy', String(cy));
      knob.setAttribute('r', '2.5');
      knob.setAttribute('fill', 'currentColor');
      knob.setAttribute('stroke', 'none');
      svg.appendChild(knob);
    }

    button.appendChild(svg);
    button.addEventListener('click', () => {
      // IPC lives behind the bridge API: `__TAURI_INTERNALS__` is not part of
      // the page surface (and is not always reachable from page scripts).
      const open = window.__mirlo?.openSettings;
      if (typeof open !== 'function') return;
      Promise.resolve(open()).catch((err) =>
        console.error('[mirlo:settings-button] open_settings failed', err)
      );
    });
    return button;
  },

  async start() {
    const right = await __MIRLO_PLUGINS__.waitForElement('#right-content', 20000);
    if (!right || this.button) return;
    this.button = this.buildButton();
    right.append(this.button);
  },

  stop() {
    this.button?.remove();
    this.button = null;
  },
});
