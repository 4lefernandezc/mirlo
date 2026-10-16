/*
 * Mirlo plugin: album-color-theme
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/album-color-theme/index.ts + style.css
 * Adapted to the Mirlo plugin host. Deviations:
 *   - no `fast-average-color` / `color` dependencies: average color and HSL
 *     darkening are computed locally with a canvas (~equivalent behavior);
 *   - the `transparent-player` interaction uses the host's `isEnabled`.
 */
__MIRLO_PLUGINS__.register('album-color-theme', {
  defaults: { enabled: false, ratio: 0.5 },
  styles: [
    `
yt-page-navigation-progress {
  --yt-page-navigation-container-color: #00000046 !important;
  --yt-page-navigation-progress-color: white !important;
}

#player-page {
  transition: transform 300ms,
  background-color 300ms cubic-bezier(0.2, 0, 0.6, 1) !important;
}

#nav-bar-background {
  transition: opacity 200ms,
  background-color 300ms cubic-bezier(0.2, 0, 0.6, 1) !important;
}

#mini-guide-background {
  transition: opacity 200ms,
  background-color 300ms cubic-bezier(0.2, 0, 0.6, 1) !important;
  border-right: 0px !important;
}

#guide-wrapper {
  transition: opacity 200ms,
  background-color 300ms cubic-bezier(0.2, 0, 0.6, 1) !important;
}

#items {
  border-radius: 10px !important;
}

/* fix blur navigation bar */

ytmusic-app-layout > [slot="player-page"]:not([is-mweb-modernization-enabled]):not(:has(ytmusic-player[player-ui-state=FULLSCREEN])) {
  padding-top: 90px;
  margin-top: calc(-90px + var(--menu-bar-height, 0px)) !important;
}

/* fix icon color */

.duration.ytmusic-player-queue-item, .byline.ytmusic-player-queue-item {
  color: rgba(255, 255, 255, 0.5) !important;
  --yt-endpoint-color: rgba(255, 255, 255, 0.5) !important;
  --yt-endpoint-hover-color: rgba(255, 255, 255, 0.5) !important;
  --yt-endpoint-visited-color: rgba(255, 255, 255, 0.5) !important;
}

.icon.ytmusic-menu-navigation-item-renderer {
  color: rgba(255, 255, 255, 0.5) !important;
}

.menu.ytmusic-player-bar {
  --iron-icon-fill-color: rgba(255, 255, 255, 0.5) !important;
}

ytmusic-player-bar {
  color: rgba(255, 255, 255, 0.5) !important;
}

.time-info.ytmusic-player-bar {
  color: rgba(255, 255, 255, 0.5) !important;
}

.volume-slider.ytmusic-player-bar, .expand-volume-slider.ytmusic-player-bar {
  --paper-slider-container-color: rgba(255, 255, 255, 0.5) !important;
}

/* fix background image */
ytmusic-fullbleed-thumbnail-renderer img {
  mask: linear-gradient(to bottom, #000 0%, #000 50%, transparent 100%);
}

.background-gradient.style-scope,
ytmusic-app-layout[is-bauhaus-sidenav-enabled] #mini-guide-background.ytmusic-app-layout {
  background: var(--ytmusic-background) !important;
}

ytmusic-browse-response[has-background]:not([disable-gradient]) .background-gradient.ytmusic-browse-response {
  background: unset !important;
}

#background.immersive-background.style-scope.ytmusic-browse-response {
  opacity: 0.6;
}
`,
  ],

  COLOR_KEY: '--ytmusic-album-color',
  DARK_COLOR_KEY: '--ytmusic-album-color-dark',
  RATIO_KEY: '--ytmusic-album-color-ratio',

  // --- local color math (replaces fast-average-color + color) -----------
  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h, s, l };
  },

  hslToRgb(h, s, l) {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r;
    let g;
    let b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  },

  // 'color' pkg `darken(ratio)`: HSL lightness multiplied by (1 - ratio).
  darken(rgb, ratio) {
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    return this.hslToRgb(hsl.h, hsl.s, hsl.l * (1 - ratio));
  },

  // Relative luminance (WCAG) used for 'color' pkg `luminosity()`.
  luminosity(rgb) {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  },

  averageColorFromImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = (canvas.width = Math.min(img.naturalWidth || 64, 64));
          const h = (canvas.height = Math.min(img.naturalHeight || 64, 64));
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(img, 0, 0, w, h);
          const { data } = context.getImageData(0, 0, w, h);
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 125) continue; // ignore transparent pixels
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n += 1;
          }
          resolve(n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null);
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  getMixedColor(color, key, alpha = 1, ratioMultiply) {
    const keyColor = `rgba(var(${key}), ${alpha})`;

    let colorRatio = `var(${this.RATIO_KEY}, 50%)`;
    let originalRatio = `calc(100% - var(${this.RATIO_KEY}, 50%))`;
    if (ratioMultiply) {
      colorRatio = `calc(var(${this.RATIO_KEY}, 50%) * ${ratioMultiply})`;
      originalRatio = `calc(100% - calc(var(${this.RATIO_KEY}, 50%) * ${ratioMultiply}))`;
    }
    return `color-mix(in srgb, ${color} ${originalRatio}, ${keyColor} ${colorRatio})`;
  },

  updateColor(alpha) {
    const variableMap = {
      '--ytmusic-color-black1': '#212121',
      '--ytmusic-color-black2': '#181818',
      '--ytmusic-color-black3': '#030303',
      '--ytmusic-color-black4': '#030303',
      '--ytmusic-color-blackpure': '#000',
      '--dark-theme-background-color': '#212121',
      '--yt-spec-base-background': '#0f0f0f',
      '--yt-spec-raised-background': '#212121',
      '--yt-spec-menu-background': '#282828',
      '--yt-spec-static-brand-black': '#212121',
      '--yt-spec-static-overlay-background-solid': '#000',
      '--yt-spec-static-overlay-background-heavy': 'rgba(0,0,0,0.8)',
      '--yt-spec-static-overlay-background-medium': 'rgba(0,0,0,0.6)',
      '--yt-spec-static-overlay-background-medium-light': 'rgba(0,0,0,0.3)',
      '--yt-spec-static-overlay-background-light': 'rgba(0,0,0,0.1)',
      '--yt-spec-general-background-a': '#181818',
      '--yt-spec-general-background-b': '#0f0f0f',
      '--yt-spec-general-background-c': '#030303',
      '--yt-spec-snackbar-background': '#030303',
      '--yt-spec-filled-button-text': '#030303',
      '--yt-spec-black-1': '#282828',
      '--yt-spec-black-2': '#1f1f1f',
      '--yt-spec-black-3': '#161616',
      '--yt-spec-black-4': '#0d0d0d',
      '--yt-spec-black-pure': '#000',
      '--yt-spec-black-pure-alpha-5': 'rgba(0,0,0,0.05)',
      '--yt-spec-black-pure-alpha-10': 'rgba(0,0,0,0.1)',
      '--yt-spec-black-pure-alpha-15': 'rgba(0,0,0,0.15)',
      '--yt-spec-black-pure-alpha-30': 'rgba(0,0,0,0.3)',
      '--yt-spec-black-pure-alpha-60': 'rgba(0,0,0,0.6)',
      '--yt-spec-black-pure-alpha-80': 'rgba(0,0,0,0.8)',
      '--yt-spec-black-1-alpha-98': 'rgba(40,40,40,0.98)',
      '--yt-spec-black-1-alpha-95': 'rgba(40,40,40,0.95)',
    };
    Object.entries(variableMap).map(([variable, color]) => {
      document.documentElement.style.setProperty(
        variable,
        this.getMixedColor(color, this.COLOR_KEY, alpha),
        'important'
      );
    });

    document.body.style.setProperty(
      'background',
      this.getMixedColor('rgba(3, 3, 3)', this.DARK_COLOR_KEY, alpha),
      'important'
    );
    document.documentElement.style.setProperty(
      '--ytmusic-background',
      // #030303
      this.getMixedColor('rgba(3, 3, 3)', this.DARK_COLOR_KEY, alpha),
      'important'
    );
  },

  async start(ctx) {
    this.ctx = ctx;
    this.config = await ctx.getConfig();
    document.documentElement.style.setProperty(
      this.RATIO_KEY,
      `${~~(this.config.ratio * 100)}%`
    );
  },

  onPlayerApiReady(playerApi) {
    document.addEventListener('videodatachange', async (event) => {
      if (event.detail.name !== 'dataloaded') return;

      const playerResponse = playerApi.getPlayerResponse();
      const thumbnail = playerResponse?.videoDetails?.thumbnail?.thumbnails?.at(0);
      if (!thumbnail) return;

      const albumColor = await this.averageColorFromImage(thumbnail.url).catch((err) => {
        console.error(err);
        return null;
      });

      if (albumColor) {
        const target = albumColor;

        this.darkColor = this.darken(target, 0.3);
        this.color = this.darken(target, 0.15);

        while (this.luminosity(this.color) > 0.5) {
          this.color = this.darken(this.color, 0.05);
          this.darkColor = this.darken(this.darkColor, 0.05);
        }

        document.documentElement.style.setProperty(
          this.COLOR_KEY,
          `${~~this.color.r}, ${~~this.color.g}, ${~~this.color.b}`
        );
        document.documentElement.style.setProperty(
          this.DARK_COLOR_KEY,
          `${~~this.darkColor.r}, ${~~this.darkColor.g}, ${~~this.darkColor.b}`
        );
      } else {
        document.documentElement.style.setProperty(this.COLOR_KEY, '0, 0, 0');
        document.documentElement.style.setProperty(this.DARK_COLOR_KEY, '0, 0, 0');
      }

      // Upstream blends the album color over the `transparent-player`
      // opacity when that plugin is enabled; it is not ported yet, so the
      // theme is applied at full alpha.
      this.updateColor(1);
    });
  },

  onConfigChange(config) {
    document.documentElement.style.setProperty(
      this.RATIO_KEY,
      `${~~(config.ratio * 100)}%`
    );
  },
});
