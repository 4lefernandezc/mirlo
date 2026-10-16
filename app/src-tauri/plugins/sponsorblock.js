/*
 * Mirlo plugin: sponsorblock
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/sponsorblock/ (index.ts + segments.ts)
 * Adapted to the Mirlo plugin host. Deviations:
 *   - the segment fetch runs in the page (renderer) instead of the Electron
 *     main process; the SponsorBlock API sends `Access-Control-Allow-Origin: *`,
 *     so a plain `fetch` works. It is a third-party network call made only
 *     while this plugin is enabled (`apiURL` is configurable);
 *   - the video id comes from the player API on the bridge's
 *     `videodatachange` (dataloaded) compatibility event.
 */
__MIRLO_PLUGINS__.register('sponsorblock', {
  defaults: {
    enabled: false,
    apiURL: 'https://sponsor.ajay.app',
    categories: [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'music_offtopic',
    ],
  },

  api: null,
  config: null,
  currentSegments: [],

  // Segments are an array [ [start, end], … ] (upstream segments.ts)
  sortSegments(segments) {
    segments.sort((segment1, segment2) =>
      segment1[0] === segment2[0] ? segment1[1] - segment2[1] : segment1[0] - segment2[0]
    );

    const compiledSegments = [];
    let currentSegment;

    for (const segment of segments) {
      if (!currentSegment) {
        currentSegment = segment;
        continue;
      }

      if (currentSegment[1] < segment[0]) {
        compiledSegments.push(currentSegment);
        currentSegment = segment;
        continue;
      }

      currentSegment[1] = Math.max(currentSegment[1], segment[1]);
    }

    if (currentSegment) {
      compiledSegments.push(currentSegment);
    }

    return compiledSegments;
  },

  async fetchSegments(videoId) {
    const { apiURL, categories } = this.config;
    const sponsorBlockURL = `${apiURL}/api/skipSegments?videoID=${videoId}&categories=${JSON.stringify(
      categories
    )}`;
    try {
      const resp = await fetch(sponsorBlockURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        redirect: 'follow',
      });
      if (resp.status !== 200) {
        return [];
      }

      const segments = await resp.json();
      return this.sortSegments(segments.map((submission) => submission.segment));
    } catch (error) {
      console.log('[mirlo:sponsorblock] request failed:', error);
      return [];
    }
  },

  async videoDataChangeListener(event) {
    if (event.detail.name !== 'dataloaded') return;
    const videoId = this.api?.getVideoData()?.video_id;
    if (!videoId) return;
    this.currentSegments = await this.fetchSegments(videoId);
  },

  timeUpdateListener(e) {
    if (e.target instanceof HTMLVideoElement) {
      const target = e.target;

      for (const segment of this.currentSegments) {
        if (target.currentTime >= segment[0] && target.currentTime < segment[1]) {
          target.currentTime = segment[1];
          console.log('[mirlo:sponsorblock] skipping segment', segment);
        }
      }
    }
  },

  resetSegments() {
    this.currentSegments = [];
  },

  async start(ctx) {
    this.ctx = ctx;
    this.config = await ctx.getConfig();
  },

  onPlayerApiReady(api) {
    this.api = api;

    const video = document.querySelector('video');
    if (!video) return;

    document.addEventListener('videodatachange', this.videoDataChangeListener);
    video.addEventListener('timeupdate', this.timeUpdateListener);
    // Reset segments on song end
    video.addEventListener('emptied', this.resetSegments);
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
  },

  stop() {
    document.removeEventListener('videodatachange', this.videoDataChangeListener);

    const video = document.querySelector('video');
    if (!video) return;

    video.removeEventListener('timeupdate', this.timeUpdateListener);
    video.removeEventListener('emptied', this.resetSegments);
    this.currentSegments = [];
  },
});
