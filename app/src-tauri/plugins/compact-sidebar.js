/*
 * Mirlo plugin: compact-sidebar
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/compact-sidebar/index.ts
 * Adapted to the Mirlo plugin host. Deviation: the shell's bridge runs before
 * YouTube Music renders its app shell, so the guide button is awaited.
 */
__MIRLO_PLUGINS__.register('compact-sidebar', {
  defaults: { enabled: false },

  getCompactSidebar() {
    return document.querySelector('#mini-guide');
  },

  isCompactSidebarDisabled() {
    const compactSidebar = this.getCompactSidebar();
    return (
      compactSidebar === null ||
      window.getComputedStyle(compactSidebar).display === 'none'
    );
  },

  async start() {
    const button = await __MIRLO_PLUGINS__.waitForElement('#button');
    if (this.isCompactSidebarDisabled()) {
      button?.click();
    }
  },

  stop() {
    if (this.isCompactSidebarDisabled()) {
      document.querySelector('#button')?.click();
    }
  },

  onConfigChange() {
    if (this.isCompactSidebarDisabled()) {
      document.querySelector('#button')?.click();
    }
  },
});
