/*
 * Mirlo plugin: blur-nav-bar
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/blur-nav-bar/index.ts + style.css
 * Adapted to the Mirlo plugin host (no Electron, styles injected by the host).
 */
__MIRLO_PLUGINS__.register('blur-nav-bar', {
  // Upstream registers the stylesheet for the whole plugin lifetime; the
  // host does the same while the plugin is enabled.
  defaults: { enabled: false },
  styles: [
    `
#nav-bar-background,
#header.ytmusic-item-section-renderer {
  background: rgba(0, 0, 0, 0.3) !important;
  backdrop-filter: blur(8px) !important;
}

ytmusic-tabs {
  backdrop-filter: blur(8px) !important;
}

ytmusic-tabs.stuck {
  background: rgba(0, 0, 0, 0.3) !important;
}

#nav-bar-divider {
  display: none !important;
}
`,
  ],
});
