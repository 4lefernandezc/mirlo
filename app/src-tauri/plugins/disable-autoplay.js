/*
 * Mirlo plugin: disable-autoplay
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/disable-autoplay/index.ts
 * Adapted to the Mirlo plugin host (the `videodatachange` document event is
 * provided by the bridge's compatibility layer). The upstream menu toggle for
 * `applyOnce` will be exposed by the Mirlo settings UI.
 */
__MIRLO_PLUGINS__.register('disable-autoplay', {
  defaults: { enabled: false, applyOnce: false },

  config: null,
  api: null,

  eventListener(event) {
    if (this.config?.applyOnce) {
      document.removeEventListener('videodatachange', this.eventListener);
    }

    if (event.detail.name === 'dataloaded') {
      this.api?.pauseVideo();
      document
        .querySelector('video')
        ?.addEventListener('timeupdate', this.timeUpdateListener, {
          once: true,
        });
    }
  },

  timeUpdateListener(e) {
    if (e.target instanceof HTMLVideoElement) {
      e.target.pause();
    }
  },

  async start(ctx) {
    this.config = await ctx.getConfig();
  },

  onPlayerApiReady(api) {
    this.api = api;

    document.addEventListener('videodatachange', this.eventListener);
  },

  stop() {
    document.removeEventListener('videodatachange', this.eventListener);
  },

  onConfigChange(newConfig) {
    this.config = newConfig;
  },
});
