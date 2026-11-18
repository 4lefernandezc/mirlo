# FAQ

## How does playback work?

Mirlo opens the official `music.youtube.com` player in WebView2 on Windows
or WebKitGTK on Linux. It uses your own session, without extracting streams,
downloading media or bypassing DRM. See [terms and scope](terms.md).

## Do I need YouTube Premium?

No. Free accounts work within the official player's account/service limits.
Optional ad blocking is off by default.

## Does Mirlo include a browser?

Windows reuses the installed WebView2 runtime. Linux `.deb` and source builds
use system WebKitGTK; the AppImage includes WebKitGTK and multimedia libraries.
There is no shipped Node.js runtime. Resource use varies with player content
and enabled extensions.

## Where are Settings?

Use the sliders button in the player's top bar, tray → **Settings…**, or
`mirlo.exe --settings`. Extension changes use **Reload player**; global shortcut
changes require restarting the app.

The source tree also has system-language Settings, categories, search and a
sleep timer, **not yet in published 0.1.12**. See [Settings](settings.md).

## Which extensions are enabled by default?

Compact sidebar, video toggle, disable autoplay, precise volume, captions
selector, quality changer, synced lyrics and the Settings button.
Custom theme is always available but does nothing with the native palette
and empty CSS. The other extensions default off.

The eighteen adapted extensions retain pear-desktop's MIT attribution;
custom theme and Settings button are Mirlo extensions.

## Can I change colors or use synchronized lyrics?

[Custom theme](themes.md) offers four dark palettes and custom CSS.
Synced lyrics uses LRCLib, highlights timed lines and supports click-to-seek.
Unavailable timed lyrics fall back to native/plain text; first-time lookups
depend on the provider's availability.

## What are the global shortcuts?

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Space` | Play/pause |
| `Ctrl+Alt+Right` | Next track |
| `Ctrl+Alt+Left` | Previous track |

Disable them in Settings if another app uses the same combinations.
Precise volume has optional global volume bindings, empty/disabled by default.
App shortcuts work on X11, not Wayland; Linux media keys use MPRIS.

## How does Discord presence work?

On Windows, enable Discord Rich Presence and run the Discord client.
Mirlo uses local IPC to report the current track, artwork and progress.
There is no token/login setup. An optional `discord_client_id` override can be
edited in `config.json` while Mirlo is closed; it is not a Settings field.
Discord presence is not implemented on Linux.

## Why are there no track notifications?

Native notifications are Windows-only and suppressed while the player is
foreground. Check Windows → System → Notifications if banners are absent.
OS-disabled notifications can be dropped even when sending succeeds.

## Where are the data and logs?

Windows: `%LOCALAPPDATA%\Mirlo`. Linux: `$XDG_DATA_HOME/Mirlo`, or
`~/.local/share/Mirlo` by default. Portable Windows copies use adjacent `data/`.
`MIRLO_DATA_DIR` overrides these locations.

Logs are under `logs/mirlo.log`, with one rotated `mirlo.log.old`.
Review logs for personal paths and playback information before sharing them.
Edit `config.json` by hand only after quitting from the tray.

## How do portable copies and updates work?

Extract the Windows portable ZIP into a writable folder and run `mirlo.exe`.
Keep its `data/` folder when replacing the executable for an update.

Windows installed copies and Linux AppImage support signed updates after
confirmation. Windows portable and Linux `.deb` copies update manually.
Startup checks can be disabled; tray → **Check for updates…** remains available.
See [installation](install.md#updates).

## What if the player does not load?

Connection failures show a local recovery screen with manual/automatic retry.
On Windows, a blank window can also indicate a broken WebView2 installation;
repair the runtime from
[Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).
On Linux, check the [dependencies and graphics notes](install.md#linux-requirements).
The AppImage's restricted-host sandbox fallback allows startup but loses
renderer isolation.

## How do I remove the app and my session?

See [uninstall](install.md#uninstall). Uninstalling the program preserves data.
Deleting the relevant data folder removes saved settings, logs and the
browser session. A portable copy's application data is in its extracted folder.
