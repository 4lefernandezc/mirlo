# FAQ

## Is Mirlo safe to use? Does it violate YouTube's terms?

Mirlo is a wrapper around the **official YouTube Music web player**: it loads
`music.youtube.com` in a native Windows WebView2 shell and uses your own
signed-in session, exactly like a browser window would. It does not extract
streams, download media, or bypass DRM. See
[terms and scope](terms.md) and
[ADR-0003](../adr/0003-tos-posture-and-defaults.md) for the full posture.

## Do I need YouTube Premium?

No. Mirlo works with free accounts. Whether you see ads depends on your
account (Premium removes them in the player itself). The optional built-in
ad-block is **off by default**; enabling it is your decision.

## Why is it lighter than similar apps?

Mirlo does not bundle a browser: it reuses the WebView2 runtime already
installed on Windows and keeps no per-app Node runtime. Measured on the same
machine: **371 MB vs 1179 MB** private memory, idle, versus the Electron
v3.11.0 build of pear-desktop (`docs/research/measurements.md`).

## Where are the settings?

- Tray icon → **Settings…** (or run `mirlo.exe --settings`).
- The settings file itself: `%LOCALAPPDATA%\Mirlo\config.json` (close the app
  before editing it by hand).
- Plugin changes apply with the **Reload player** button; global hotkey
  changes need an app restart.

## Which plugins ship enabled?

Stable additive plugins are enabled out of the box: navigation buttons,
video toggle, precise volume, captions selector, quality changer and compact
sidebar. Behavioral or opinionated plugins (ad-block, sponsorblock,
skip-disliked-songs, album-actions, synced lyrics, equalizer, …) ship **off**;
enable them per plugin in Settings. All are ported from
[pear-desktop](https://github.com/pear-devs/pear-desktop) (MIT) with
attribution.

## What are the global hotkeys?

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+Space` | Play / pause |
| `Ctrl+Alt+Right` | Next track |
| `Ctrl+Alt+Left` | Previous track |

They can be disabled in Settings. The *precise-volume* plugin adds optional
volume shortcuts (`Ctrl+Alt+ArrowUp/Down` by default) that are registered at
startup.

## How do I set up Discord Rich Presence?

1. Create an application at the
   [Discord Developer Portal](https://discord.com/developers/applications)
   (any name; it will be shown as "Listening to …").
2. Copy its **Application ID**.
3. In Mirlo Settings → General: enable *Discord Rich Presence* and paste the
   id. Discord must be running.

Mirlo cannot ship a shared client id — the presence appears under *your*
application's name.

## Why don't I see track-change notifications?

Windows toasts are shown only when the player window is not in the
foreground. If nothing appears, check **Windows Settings → System →
Notifications** — if notifications are disabled at the OS level, the toast is
silently dropped (this is logged once per run in `mirlo.log`).

## Where are the logs?

`%LOCALAPPDATA%\Mirlo\logs\mirlo.log` (previous file kept as `mirlo.log.old`).
Include it when reporting a bug. Typical harmless entry when offline or
before the first release exists:

```
[ERROR] update check failed: Could not fetch a valid release JSON from the remote
```

## How do updates work?

At startup (about 30 seconds in) and from the tray (*Check for updates…*),
Mirlo fetches the release manifest from GitHub. When a newer version exists
it asks for confirmation, downloads the installer, verifies its signature
against the public key compiled into the app, installs it and restarts.
Updates can be turned off in Settings → *Check for updates on startup*.

## The window is blank / white

That usually means the WebView2 runtime is missing or broken. Install or
repair it from
[Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/),
then relaunch Mirlo.

## My hotkeys stopped working

Another application is probably grabbing the same shortcut. Free the
combination or disable Mirlo's hotkeys in Settings.

## How do I fully remove Mirlo (including my session)?

Uninstall as described in [install.md](install.md), then delete
`%LOCALAPPDATA%\Mirlo`. That removes the configuration, logs and the
browser profile (including the stored Google session).
