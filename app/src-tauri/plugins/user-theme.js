/*
 * Mirlo plugin: user-theme
 *
 * Original to Mirlo (not a pear-desktop port). Applies a preset palette and/or
 * user CSS through the CSS variables YouTube Music already defines; it injects
 * no markup and fetches nothing.
 *
 * Deviations/limits:
 *   - presets assume the page uses YouTube Music's dark theme;
 *   - custom CSS is appended after the palette so it wins on equal
 *     specificity;
 *   - `@import` and remote `url()` are stripped before injection (best effort,
 *     not a CSS sanitizer: review themes you copy from elsewhere);
 *   - with `album-color-theme` enabled, that plugin's inline variables win.
 */

(() => {
  const PALETTES = {
    midnight: {
      bg: '#0b1220',
      s1: '#141c2e',
      s2: '#0f1626',
      s3: '#070c16',
      text: '#e8eefc',
      muted: 'rgba(232, 238, 252, 0.65)',
    },
    amoled: {
      bg: '#000000',
      s1: '#0a0a0a',
      s2: '#050505',
      s3: '#000000',
      text: '#f1f1f1',
      muted: 'rgba(241, 241, 241, 0.6)',
    },
    warm: {
      bg: '#17120e',
      s1: '#221a14',
      s2: '#1b140f',
      s3: '#100c09',
      text: '#f2e9df',
      muted: 'rgba(242, 233, 223, 0.65)',
    },
    forest: {
      bg: '#0a1410',
      s1: '#12201a',
      s2: '#0d1813',
      s3: '#060d0a',
      text: '#e6f2ec',
      muted: 'rgba(230, 242, 236, 0.65)',
    },
  };

  function stripRemoteRefs(css) {
    return String(css || '')
      .replace(/@import[^;{}]*;?/gi, '')
      .replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\)/gi, 'none');
  }

  // Variables `album-color-theme` writes inline with !important; inline rules
  // beat any stylesheet, so a flat preset has to remove them outright.
  const ALBUM_VARS = [
    '--dark-theme-background-color',
    '--ytmusic-background',
    '--ytmusic-album-color',
    '--ytmusic-album-color-dark',
    '--ytmusic-album-color-ratio',
  ];

  function clearAlbumInline() {
    const root = document.documentElement;
    if (root) {
      for (const prop of [...root.style]) {
        if (prop.startsWith('--yt-spec-') || prop.startsWith('--ytmusic-color-')) {
          root.style.removeProperty(prop);
        } else if (ALBUM_VARS.includes(prop)) {
          root.style.removeProperty(prop);
        }
      }
    }
    // Initialization scripts run before <body> exists.
    document.body?.style.removeProperty('background');
  }

  function presetCss(name) {
    const p = PALETTES[name];
    if (!p) return '';
    const vars = {
      '--ytmusic-background': p.bg,
      '--dark-theme-background-color': p.s1,
      '--ytmusic-color-black1': p.s1,
      '--ytmusic-color-black2': p.s2,
      '--ytmusic-color-black3': p.s3,
      '--ytmusic-color-black4': p.s3,
      '--ytmusic-color-blackpure': p.s3,
      '--yt-spec-base-background': p.bg,
      '--yt-spec-raised-background': p.s1,
      '--yt-spec-menu-background': p.s1,
      '--yt-spec-general-background-a': p.s2,
      '--yt-spec-general-background-b': p.bg,
      '--yt-spec-general-background-c': p.s3,
      '--yt-spec-black-1': p.s1,
      '--yt-spec-black-2': p.s2,
      '--yt-spec-black-3': p.s2,
      '--yt-spec-black-4': p.s3,
      '--yt-spec-black-pure': p.s3,
      '--yt-spec-text-primary': p.text,
      '--yt-spec-text-secondary': p.muted,
      '--yt-spec-text-disabled': p.muted,
    };
    const decls = Object.entries(vars)
      .map(([key, value]) => `  ${key}: ${value} !important;`)
      .join('\n');
    return `:root {\n${decls}\n}\n\nhtml, body {\n  background-color: ${p.bg} !important;\n}\n\n/* A flat preset drops YouTube Music's per-track hero gradient. */\nytmusic-fullbleed-thumbnail-renderer {\n  display: none !important;\n}\n`;
  }

  let sheet = null;

  function applyTheme(config) {
    const preset = presetCss(config && config.preset);
    const custom = stripRemoteRefs(config && config.customCss);
    const flat = !!(config && config.preset && config.preset !== 'native');
    window.__MIRLO_FLAT_THEME__ = flat;
    if (flat) clearAlbumInline();
    const css = [preset, custom].filter(Boolean).join('\n');
    if (!sheet) sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    if (!document.adoptedStyleSheets.includes(sheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
  }

  // Apply before the first paint: the boot config is synchronous, unlike the
  // async get_config in start(). `start()` re-applies the fresh config.
  const boot = typeof window !== 'undefined' ? window.__MIRLO_BOOT__ : null;
  if (boot && boot.config && boot.config.plugins) {
    const raw = boot.config.plugins['user-theme'] || {};
    if (raw.enabled !== false) applyTheme(raw);
  }

  __MIRLO_PLUGINS__.register('user-theme', {
    // Mirlo default: enabled, but the default palette is a no-op.
    defaults: {
      enabled: true,
      preset: 'native',
      customCss: '',
    },

    async start(ctx) {
      this.config = await ctx.getConfig();
      applyTheme(this.config);
    },

    onConfigChange(config) {
      this.config = config;
      applyTheme(config);
    },

    stop() {
      window.__MIRLO_FLAT_THEME__ = false;
      if (!sheet) return;
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      sheet.replaceSync('');
      sheet = null;
    },

    // Exposed for the Node test harness.
    stripRemoteRefs,
  });
})();
