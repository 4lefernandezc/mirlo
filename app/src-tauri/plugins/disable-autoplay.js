/*
 * Mirlo plugin: disable-autoplay
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/disable-autoplay/index.ts
 * Adapted to the Mirlo plugin host (the `videodatachange` document event is
 * provided by the bridge's compatibility layer). Deviations:
 *   - the upstream version pauses the first `timeupdate` seen after a load;
 *     if the track was paused, that listener stayed armed and paused the next
 *     user-initiated play. Mirlo instead pauses once at `dataloaded` and
 *     catches a late auto-start via a short-lived `play` listener;
 *   - an explicit user input (pointer/keyboard) within 1.5 s marks the track
 *     change as intentional, so clicking a song plays it instead of pausing.
 */
__MIRLO_PLUGINS__.register('disable-autoplay', {
  defaults: { enabled: true, applyOnce: false },

  config: null,
  api: null,
  lastInputAt: 0,
  armedUntil: 0,

  userInitiated() {
    return Date.now() - this.lastInputAt < 1500;
  },

  onInput() {
    this.lastInputAt = Date.now();
  },

  eventListener(event) {
    if (event.detail.name !== 'dataloaded') return;

    if (this.config?.applyOnce) {
      document.removeEventListener('videodatachange', this.eventListener);
    }

    // Do not fight an explicit choice: a song the user just picked plays.
    if (this.userInitiated()) return;

    // YouTube Music may start playback a moment after `dataloaded`; keep a
    // window open to pause that auto-start once.
    this.armedUntil = Date.now() + 4000;
    this.api?.pauseVideo();
  },

  playListener(event) {
    if (Date.now() > this.armedUntil) return;
    if (this.userInitiated()) return;
    if (typeof event.target?.pause === 'function') event.target.pause();
  },

  async start(ctx) {
    this.config = await ctx.getConfig();
  },

  onPlayerApiReady(api) {
    this.api = api;
    document.addEventListener('videodatachange', this.eventListener);
    document.addEventListener('play', this.playListener, true);
    document.addEventListener('pointerdown', this.onInput, true);
    document.addEventListener('keydown', this.onInput, true);
    document.addEventListener('mirlo:user-intent', this.onInput);
  },

  stop() {
    document.removeEventListener('videodatachange', this.eventListener);
    document.removeEventListener('play', this.playListener, true);
    document.removeEventListener('pointerdown', this.onInput, true);
    document.removeEventListener('keydown', this.onInput, true);
    document.removeEventListener('mirlo:user-intent', this.onInput);
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
  },
});
