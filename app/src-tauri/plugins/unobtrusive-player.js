/*
 * Mirlo plugin: unobtrusive-player
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/unobtrusive-player/index.ts + style.css
 * Adapted to the Mirlo plugin host (the `videodatachange` document event is
 * provided by the bridge's compatibility layer).
 */
__MIRLO_PLUGINS__.register('unobtrusive-player', {
  defaults: { enabled: false },
  styles: [
    `
body.unobtrusive-player.unobtrusive-player--did-play {
  overflow: visible !important;

  & ytmusic-player-page,
  ytmusic-player-page * {
    visibility: hidden !important;
  }

  & #content {
    visibility: visible !important;
  }

  &
    ytmusic-app-layout:not(.content-scrolled)
    #nav-bar-background.ytmusic-app-layout,
  ytmusic-app-layout:not(.content-scrolled) #nav-bar-divider.ytmusic-app-layout,
  ytmusic-app-layout[is-bauhaus-sidenav-enabled][player-page-open]:not(
      .content-scrolled
    )
    #mini-guide-background.ytmusic-app-layout {
    opacity: 0 !important;
  }

  & .toggle-player-page-button {
    transform: rotate(180deg) !important;
  }
}
`,
  ],

  handlePlay(e) {
    if (!(e.target instanceof HTMLElement)) return;

    // Player bar handler
    if (
      e.target.closest('ytmusic-player-bar') &&
      !document.body.classList.contains('unobtrusive-player--auto-closing')
    ) {
      document.body.classList.remove('unobtrusive-player--did-play');
      return;
    }

    // Song play button handler
    if (
      e.target.closest('ytmusic-play-button-renderer') &&
      !e.target.closest('ytmusic-player-page')
    ) {
      document.body.classList.add('unobtrusive-player--did-play');
      return;
    }

    // Shuffle play menu item handler
    const shuffleIconPathData = document
      .querySelector('iron-iconset-svg[name="yt-sys-icons"] #shuffle')
      ?.firstChild?.getAttribute('d')
      ?.substring(0, 15);

    if (
      e.target.closest(
        `ytmusic-menu-navigation-item-renderer:has(yt-icon path[d^="${shuffleIconPathData}"])`
      )
    ) {
      document.body.classList.add('unobtrusive-player--did-play');
    }
  },

  handleVideoDataChange() {
    const isPlayerPageOpen =
      document
        .querySelector('ytmusic-app-layout')
        ?.attributes.getNamedItem('player-ui-state')?.value === 'PLAYER_PAGE_OPEN';

    if (
      document.body.classList.contains('unobtrusive-player--did-play') &&
      isPlayerPageOpen
    ) {
      document.body.classList.add('unobtrusive-player--auto-closing');

      document.querySelector('.toggle-player-page-button')?.click();

      // prevent animation flickering
      setTimeout(() => {
        document.body.classList.remove('unobtrusive-player--auto-closing');
      }, 500);
    }
  },

  start() {
    document.body.classList.add('unobtrusive-player');
    document.addEventListener('click', this.handlePlay);
  },

  onPlayerApiReady() {
    // Close player page when video changes while
    // `unobtrusive-player--did-play` className is present.
    document.addEventListener('videodatachange', this.handleVideoDataChange);
  },

  stop() {
    document.removeEventListener('click', this.handlePlay);
    document.removeEventListener('videodatachange', this.handleVideoDataChange);

    [
      'unobtrusive-player',
      'unobtrusive-player--did-play',
      'unobtrusive-player--auto-closing',
    ].forEach((className) => document.body.classList.remove(className));
  },
});
