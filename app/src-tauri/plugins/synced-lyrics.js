/*
 * Mirlo plugin: synced-lyrics (reduced port)
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/synced-lyrics/ — reduced to the LRCLib provider
 *   (providers/LRCLib.ts), the LRC parser (parsers/lrc.ts) and a minimal
 *   synced panel.
 * Adapted to the Mirlo plugin host. Deviations (documented):
 *   - network transport is a page `fetch` to https://lrclib.net with the
 *     `Lrclib-Client` header (verified: CORS open, 200 OK) instead of the
 *     Electron main-process `net`;
 *   - only the LRCLib provider is ported (no MusixMatch/Genius/Megalobiz/
 *     YTMusic variants), and the UI is a toggleable overlay panel with a
 *     click-to-seek list instead of the upstream in-page sidebar.
 */
__MIRLO_PLUGINS__.register('synced-lyrics', {
  defaults: { enabled: false, showLyricsEvenIfInexact: false },
  styles: [
    `
.mirlo-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 8px;
  border: none;
  background: none;
  color: var(--yt-spec-text-primary, #aaaaaa);
  cursor: pointer;
  border-radius: 50%;
}
.mirlo-icon-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.mirlo-icon-button svg {
  width: 24px;
  height: 24px;
  display: block;
  fill: currentColor;
}
`,
  ],

  api: null,
  config: null,
  panel: null,
  button: null,
  lines: null,
  activeIndex: -1,
  lastTime: 0,
  hoverLock: false,
  requestToken: 0,

  // --- parsers/lrc.ts (upstream) ----------------------------------------
  LRC: {
    parse(text) {
      const tagRegex = /^\[(?<tag>\w+):\s*(?<value>.+?)\s*\]$/;
      const lyricRegex = /^\[(?<minutes>\d+):(?<seconds>\d+)\.(?<milliseconds>\d+)\](?<text>.+)$/;

      const lrc = { tags: [], lines: [] };
      let offset = 0;
      let previousLine = null;

      for (const line of text.split('\n')) {
        if (!line.trim().startsWith('[')) continue;

        const lyric = line.match(lyricRegex)?.groups;
        if (!lyric) {
          const tag = line.match(tagRegex)?.groups;
          if (tag) {
            if (tag.tag === 'offset') {
              offset = parseInt(tag.value);
              continue;
            }
            lrc.tags.push({ tag: tag.tag, value: tag.value });
          }
          continue;
        }

        const { minutes, seconds, milliseconds, text: lyricText } = lyric;
        const timeInMs =
          parseInt(minutes) * 60 * 1000 + parseInt(seconds) * 1000 + parseInt(milliseconds);

        const currentLine = {
          time: `${minutes}:${seconds}:${milliseconds}`,
          timeInMs,
          text: lyricText.trim(),
          duration: Infinity,
        };

        if (previousLine) {
          previousLine.duration = timeInMs - previousLine.timeInMs;
        }

        previousLine = currentLine;
        lrc.lines.push(currentLine);
      }

      for (const line of lrc.lines) {
        line.timeInMs += offset;
      }

      const first = lrc.lines.at(0);
      if (first && first.timeInMs > 300) {
        lrc.lines.unshift({
          time: '0:0:0',
          timeInMs: 0,
          duration: first.timeInMs,
          text: '',
        });
      }

      return lrc;
    },
  },

  // Minimal Jaro-Winkler (as used by upstream's @skyra/jaro-winkler import).
  jaroWinkler(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);
    let matches = 0;

    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, b.length);
      for (let j = start; j < end; j++) {
        if (bMatches[j] || a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (!matches) return 0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }
    transpositions /= 2;

    const jaro =
      (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
    if (jaro < 0.7) return jaro;

    let prefix = 0;
    while (prefix < 4 && a[prefix] === b[prefix]) prefix++;

    return jaro + prefix * 0.1 * (1 - jaro);
  },

  // --- providers/LRCLib.ts (upstream, reduced) ---------------------------
  async searchLrclib({ title, alternativeTitle, artist, album, songDuration }) {
    const baseUrl = 'https://lrclib.net';
    const clientHeader = {
      'Lrclib-Client': 'Mirlo v0.1.0 (https://github.com/4lefernandezc/mirlo)',
    };

    const buildSearch = async (params) => {
      let lastError = null;
      // LRCLib answers 503 "ServerOverloaded ... retry in a moment" under
      // load; retry briefly before giving up.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        try {
          const response = await fetch(`${baseUrl}/api/search?${params.toString()}`, {
            headers: clientHeader,
          });
          if (response.status === 503) {
            lastError = new Error('ServerOverloaded (503)');
            continue;
          }
          if (!response.ok) {
            throw new Error(`bad HTTPStatus(${response.statusText})`);
          }
          return await response.json();
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError ?? new Error('LRCLib request failed');
    };

    let query = new URLSearchParams({ artist_name: artist, track_name: title });
    if (album) query.set('album_name', album);

    let data = await buildSearch(query);
    if (!Array.isArray(data)) {
      throw new Error(`Expected an array, instead got ${typeof data}`);
    }

    if (data.length === 0) {
      if (!this.config?.showLyricsEvenIfInexact) {
        return null;
      }

      // Try to search with the alternative title (original language)
      const trackName = alternativeTitle || title;
      data = await buildSearch(new URLSearchParams({ q: trackName }));
      if (!Array.isArray(data)) {
        throw new Error(`Expected an array, instead got ${typeof data}`);
      }

      // If still no results, try with the original title as fallback
      if (data.length === 0 && alternativeTitle) {
        data = await buildSearch(new URLSearchParams({ q: title }));
        if (!Array.isArray(data)) {
          throw new Error(`Expected an array, instead got ${typeof data}`);
        }
      }
    }

    const filteredResults = [];
    for (const item of data) {
      const { artistName } = item;

      const artists = artist.split(/[&,]/g).map((i) => i.trim());
      const itemArtists = artistName.split(/[&,]/g).map((i) => i.trim());

      // Try to match using artist name first
      const permutations = [];
      for (const artistA of artists) {
        for (const artistB of itemArtists) {
          permutations.push([artistA.toLowerCase(), artistB.toLowerCase()]);
        }
      }
      for (const artistA of itemArtists) {
        for (const artistB of artists) {
          permutations.push([artistA.toLowerCase(), artistB.toLowerCase()]);
        }
      }

      const ratio = Math.max(...permutations.map(([x, y]) => this.jaroWinkler(x, y)));
      if (ratio <= 0.9) continue;
      filteredResults.push(item);
    }

    filteredResults.sort(({ duration: durationA }, { duration: durationB }) =>
      Math.abs(durationA - songDuration) - Math.abs(durationB - songDuration)
    );

    const closestResult = filteredResults[0];
    if (!closestResult) {
      return null;
    }

    if (Math.abs(closestResult.duration - songDuration) > 15) {
      return null;
    }

    if (closestResult.instrumental) {
      return null;
    }

    const raw = closestResult.syncedLyrics;
    const plain = closestResult.plainLyrics;
    if (!raw && !plain) {
      return null;
    }

    return {
      title: closestResult.trackName,
      artists: closestResult.artistName.split(/[&,]/g),
      lines: raw ? this.LRC.parse(raw).lines : undefined,
      lyrics: plain,
    };
  },

  // --- UI ----------------------------------------------------------------
  buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'mirlo-lyrics-panel';
    panel.style.cssText =
      'position:fixed;top:64px;right:12px;bottom:96px;width:360px;z-index:9998;' +
      'display:none;flex-direction:column;background:rgba(18,18,18,.94);color:#e8e8e8;' +
      'border:1px solid #303030;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.5);' +
      'font:14px/1.6 "Segoe UI",system-ui,sans-serif;overflow:hidden;';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #303030;';

    const title = document.createElement('div');
    title.id = 'mirlo-lyrics-title';
    title.style.cssText = 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    title.textContent = 'Lyrics';

    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Close lyrics';
    close.style.cssText =
      'background:none;border:none;color:#9aa0a6;font-size:20px;cursor:pointer;line-height:1;';
    close.addEventListener('click', () => this.togglePanel(false));

    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement('div');
    body.id = 'mirlo-lyrics-body';
    body.style.cssText = 'flex:1;overflow-y:auto;padding:10px 14px;';
    body.addEventListener('mouseenter', () => (this.hoverLock = true));
    body.addEventListener('mouseleave', () => (this.hoverLock = false));

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);
    return panel;
  },

  buildButton() {
    // A plain button with our own styles: a bare `yt-icon-button` custom
    // element renders as a 300x300 unstyled block in YT Music.
    const button = document.createElement('button');
    button.id = 'mirlo-lyrics-button';
    button.className = 'mirlo-icon-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Lyrics');
    button.setAttribute('title', 'Lyrics');

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('viewBox', '0 0 24 24');

    // Material "subject" glyph (lines of text)
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', 'M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z');
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener('click', () => this.togglePanel());
    return button;
  },

  togglePanel(force) {
    if (!this.panel) this.panel = this.buildPanel();
    const show = force !== undefined ? force : this.panel.style.display === 'none';
    this.panel.style.display = show ? 'flex' : 'none';
    if (show) this.renderBody();
  },

  setBody(message) {
    const body = this.panel?.querySelector('#mirlo-lyrics-body');
    if (!body) return;
    body.textContent = '';
    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'color:#9aa0a6;padding:8px 0;';
    messageEl.textContent = message;
    body.appendChild(messageEl);
  },

  renderBody() {
    const body = this.panel?.querySelector('#mirlo-lyrics-body');
    if (!body) return;
    body.textContent = '';
    this.lineElements = [];

    if (this.state === 'loading') {
      this.setBody('Searching lyrics…');
      return;
    }
    if (this.state === 'notfound') {
      this.setBody('No lyrics found for this track.');
      return;
    }
    if (this.state === 'error') {
      this.setBody('Lyrics provider error (retry later).');
      return;
    }

    if (this.lines?.length) {
      for (const line of this.lines) {
        const lineEl = document.createElement('div');
        lineEl.textContent = line.text || '♪';
        lineEl.style.cssText =
          'padding:2px 0;border-radius:6px;cursor:pointer;color:#9aa0a6;transition:color .2s;';
        lineEl.addEventListener('click', () => {
          const video = document.querySelector('video');
          if (video) video.currentTime = line.timeInMs / 1000;
        });
        body.appendChild(lineEl);
        this.lineElements.push(lineEl);
      }
      this.activeIndex = -1;
      this.updateActive();
    } else if (this.plainLyrics) {
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;font:inherit;color:#c8c8c8;margin:0;';
      pre.textContent = this.plainLyrics;
      body.appendChild(pre);
    } else {
      this.setBody('No lyrics found for this track.');
    }
  },

  updateActive() {
    if (!this.lines?.length || !this.lineElements?.length) return;
    const video = document.querySelector('video');
    if (!video) return;

    const timeMs = video.currentTime * 1000;
    let index = 0;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].timeInMs <= timeMs) index = i;
      else break;
    }

    if (index === this.activeIndex) return;
    if (this.lineElements[this.activeIndex]) {
      this.lineElements[this.activeIndex].style.color = '#9aa0a6';
      this.lineElements[this.activeIndex].style.fontWeight = '';
    }
    this.activeIndex = index;
    const activeEl = this.lineElements[index];
    if (activeEl) {
      activeEl.style.color = '#f5a524';
      activeEl.style.fontWeight = '600';
      if (!this.hoverLock && this.panel?.style.display === 'flex') {
        activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  },

  timeUpdateListener() {
    const now = performance.now();
    if (now - this.lastTime < 120) return;
    this.lastTime = now;
    this.updateActive();
  },

  async videoDataChangeListener(event) {
    if (event.detail.name !== 'dataloaded') return;
    await this.fetchLyrics();
  },

  async fetchLyrics() {
    const api = this.api;
    if (!api) return;
    const details = api.getPlayerResponse()?.videoDetails;
    if (!details) return;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const token = ++this.requestToken;
    this.state = 'loading';
    this.lines = null;
    this.plainLyrics = null;
    const titleEl = this.panel?.querySelector('#mirlo-lyrics-title');
    if (titleEl) titleEl.textContent = details.title || 'Lyrics';
    if (this.panel?.style.display === 'flex') this.renderBody();

    try {
      const result = await this.searchLrclib({
        title: details.title,
        artist: details.author,
        album: details.album,
        songDuration: details.lengthSeconds,
      });
      if (token !== this.requestToken) return; // a newer track won
      if (!result) {
        this.state = 'notfound';
      } else {
        this.state = 'ready';
        this.lines = result.lines;
        this.plainLyrics = result.lyrics;
        if (this.lines?.length) this.lines = this.lines.map((l) => ({ ...l }));
      }
    } catch (err) {
      console.log('[mirlo:synced-lyrics] fetch failed:', err);
      if (token !== this.requestToken) return;
      this.state = 'error';
      // One delayed re-attempt while the same track is still playing.
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.fetchLyrics();
      }, 15000);
    }

    if (this.panel?.style.display === 'flex') this.renderBody();
  },

  async start(ctx) {
    this.ctx = ctx;
    this.config = await ctx.getConfig();
    this.state = 'idle';
    this.lineElements = null;
  },

  async onPlayerApiReady(api) {
    this.api = api;

    this.button = this.buildButton();
    document.querySelector('#right-content')?.append(this.button);

    const video = document.querySelector('video');
    if (!video) return;

    document.addEventListener('videodatachange', this.videoDataChangeListener);
    video.addEventListener('timeupdate', this.timeUpdateListener);
    await this.fetchLyrics();
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
  },

  stop() {
    document.removeEventListener('videodatachange', this.videoDataChangeListener);
    document.querySelector('video')?.removeEventListener('timeupdate', this.timeUpdateListener);
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.button?.remove();
    this.button = null;
    this.panel?.remove();
    this.panel = null;
    this.lines = null;
    this.lineElements = null;
    this.requestToken++;
  },
});
