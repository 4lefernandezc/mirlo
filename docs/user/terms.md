# Terms and scope notes

Mirlo is an independent, non-profit open-source project. This page summarizes
what the application does, what it deliberately does **not** do, and the
network behavior, so users can make an informed decision. The technical
rationale lives in [ADR-0003](../adr/0003-tos-posture-and-defaults.md).

## What Mirlo is

- A **wrapper of the official YouTube Music web player** (`music.youtube.com`)
  running in the Microsoft Edge WebView2 runtime on Windows.
- You sign in with **your own account**; the session is stored locally by
  WebView2 in Mirlo's private profile folder.
- Feature additions (the plugin system) are renderer-side enhancements ported
  from pear-desktop (MIT) — UI tweaks, player controls, lyrics, local
  volume/EQ processing, etc.

## What Mirlo does NOT do

- **No stream extraction.** Mirlo never resolves or fetches audio/video
  streams through InnerTube or any other undocumented API for playback. (The
  crossfade plugin from upstream, which needs the next track's stream URL,
  is therefore excluded.)
- **No downloading** of media. The downloader plugin is excluded.
- **No DRM circumvention** and no bypassing of Premium or regional limits.
- **No account automation**: no credential handling beyond what the official
  web player does in its own WebView2 session.

## Ad-blocking

A conservative, opt-in ad/telemetry blocker (network-level on WebView2) ships
**disabled by default**. Enabling it is the user's own decision and may affect
the relationship with the service; Mirlo makes no guarantees about how the
service reacts. The same posture applies to community plugins that modify page
behavior (e.g. SponsorBlock), which are opt-in and fetch their data only while
enabled.

## Network behavior and privacy

- Mirlo has **no telemetry, no analytics and no servers of its own**.
- Regular network traffic is the YouTube Music player itself (required).
- Additional calls:
  - **Update checks** to this GitHub repository (can be disabled in Settings).
  - **SponsorBlock** (`sponsor.ajay.app`, configurable URL) — only while that
    plugin is enabled.
  - **LRCLib** (`lrclib.net`) for synced lyrics — only while that plugin is
    enabled.
  - **Discord** via local IPC (named pipe) — only while Rich Presence is
    enabled; never over the network.
- All app data stays under `%LOCALAPPDATA%\Mirlo` on your machine (portable
  copies keep the same layout under `data\` next to `mirlo.exe`).

## Trademarks and affiliation

Mirlo is not affiliated with, authorized by, endorsed by, or in any way
officially connected with Google LLC, YouTube, Discord Inc., or any of their
subsidiaries or affiliates. "YouTube Music" and related names, marks and
images are trademarks of their respective owners; any use is for
identification and reference purposes only. Mirlo's own code and branding are
provided under the [MIT license](../../LICENSE); ported plugin code retains
its original notices ([THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).

Use the software at your own risk.
