/*
 * Mirlo plugin: skip-disliked-songs
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/skip-disliked-songs/index.ts
 * Adapted to the Mirlo plugin host (waits for the like button through the
 * host's `waitForElement`).
 */
__MIRLO_PLUGINS__.register('skip-disliked-songs', {
  defaults: { enabled: false },

  observer: null,

  async start() {
    const dislikeBtn = await __MIRLO_PLUGINS__.waitForElement('#like-button-renderer');
    if (!dislikeBtn) return;

    this.observer = new MutationObserver(() => {
      if (dislikeBtn.getAttribute('like-status') === 'DISLIKE') {
        document.querySelector('yt-icon-button.next-button')?.click();
      }
    });
    this.observer.observe(dislikeBtn, {
      attributes: true,
      childList: false,
      subtree: false,
    });
  },

  stop() {
    this.observer?.disconnect();
    this.observer = null;
  },
});
