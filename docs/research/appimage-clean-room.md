# AppImage multimedia clean-room tests — 2026-10-29

## Outcome

The published AppImage supplies GTK/WebKitGTK correctly, but its multimedia
packaging is incomplete. Installing host codec packages alone is not a
reliable fix: its launcher overrides GStreamer's system plugin search paths.

No production packaging, license, release or GitHub changes were made.

**Follow-up completed locally:** a selected-plugin candidate without FAAD
passes generated AAC/Opus samples and actual official-player playback,
seek and next-track checks in a second clean root. See
[candidate evidence and recipes](appimage-candidate.md). The findings below
describe the original published package and the first diagnostic controls.

## Artifacts and isolation

- Target: `Mirlo_0.1.8_amd64.AppImage`, 82,106,872 bytes.
  SHA-256: `587051a8c7b48a67439c78d360c87a42b6a676178a51e26497e2028e74586740`
  (matches the published checksum).
- Extracted with `unsquashfs` at offset 944632; original AppImage unchanged.
- Clean base: Canonical `ubuntu-base-22.04.5-base-amd64.tar.gz`.
  SHA-256: `242cd8898b33ea806ef5f13b1076ed7c76f9f989d18384452f7166692438ff1a`
  (matches Canonical's checksum list).
- Base glibc: Ubuntu `libc6` 2.35-0ubuntu3.8; supplied by the test OS, not
  the AppImage. This confirms operation on the intended glibc 2.35 baseline,
  not compatibility with older distributions.
- Separate root filesystem under a disposable working directory, mounted
  through Bubblewrap. No host `/usr`, `/lib`, home, Google session or
  GStreamer plugin directories were exposed. Only display sockets, device/
  process filesystems, DNS configuration, the read-only extracted AppDir
  and a dedicated results directory were available.
- Added desktop fundamentals: X11/Wayland, Mesa software rendering, fonts,
  fontconfig/Harfbuzz and D-Bus. No host `libgtk` or `libwebkit` packages
  were installed (checked with `dpkg -l` after each stage).
- WSL2/WSLg supplies the kernel/display; this is an isolated userspace test,
  not a separate physical machine. WebKit software rendering and disabling
  its nested sandbox were test-only settings inside the outer isolation.
- Audio used an isolated PulseAudio null sink; no physical audio output was
  assessed. Samples are generated sine waves, not extracted music streams.

## Tests and observations

| Environment | Result |
| --- | --- |
| Bare Ubuntu Base + AppDir | Missing normal desktop libraries (X11, fonts, graphics); this is not a supported desktop by itself. |
| Desktop fundamentals, no GTK/WebKit or GStreamer plugins installed | Unmodified Mirlo reaches `ready` and the player bridge reports AAC=false, Opus=false. The native media probe cannot create `autoaudiosink`. |
| Add `gstreamer1.0-plugins-base` and `gstreamer1.0-plugins-good` | Packaged-engine probe completes the Opus/WebM sample (5.333 s); AAC/MP4 returns `NotSupportedError`, media error 4. MSE AAC/Opus/H.264 all report false. |
| Also add `gstreamer1.0-plugins-bad` | Packaged-engine probe reports all three MSE types true. Opus and AAC samples reach their full durations, `ended=true`, no media error. Test exits 0. No `libav` or `ugly` GStreamer packages were installed. |
| Unmodified AppImage launcher, even after those host plugins are installed | Still reports AAC=false/Opus=false. The launcher restricts its system plugin paths to internal directories. |
| Same AppImage with diagnostic `GST_PLUGIN_PATH_1_0` pointing at the isolated system plugins | Real Mirlo reports `bridge-ready (ms=true aac=true opus=true)` and `player-api-loaded`. This is a diagnostic control, not a shipped fix or a verified full-track playback test. |

Loaded process maps confirm:

```text
/app/usr/lib/libgtk-3.so.0
/app/usr/lib/libwebkit2gtk-4.1.so.0
/app/usr/lib/libjavascriptcoregtk-4.1.so.0
/app/usr/lib/libgstreamer-1.0.so.0
/usr/lib/x86_64-linux-gnu/libc.so.6
```

The unmodified AppRun environment contains:

```text
GST_PLUGIN_SYSTEM_PATH=/app/usr/lib/gstreamer:
GST_PLUGIN_SYSTEM_PATH_1_0=/app/usr/lib/gstreamer-1.0:
```

Neither internal plugin directory exists in the published package. An
inherited `GST_PLUGIN_SYSTEM_PATH_1_0` was overwritten by the launcher;
the separate `GST_PLUGIN_PATH_1_0` diagnostic override worked.

## Positive playback probe

`tools/tests/appimage-media-probe.c` creates a minimal WebKit view using the
same packaged engine and reports actual media progress, not just codec flags.
Its exit status is 0 only when both generated samples end after more than
five seconds with no media error; failures return 1 or timeout with 2.

Observed final result:

```json
{
  "caps": { "aac": true, "opus": true, "h264": true },
  "passed": true,
  "samples": [
    { "type": "webm", "status": "playing", "time": 5.333333333, "duration": 5.333333333, "ended": true, "error": null },
    { "type": "m4a", "status": "playing", "time": 5.828333333, "duration": 5.828333333, "ended": true, "error": null }
  ]
}
```

At this stage, attaching the WebKit inspector repeatedly timed out on
`Runtime.evaluate`. The independent harness did **not** establish that a
full YouTube Music track played in Mirlo. The follow-up identified a missing
desktop `libGLESv2.so.2`, then verified real playback in the candidate.

### Repeating the probe

Build on a development machine with GTK/WebKit headers; run the resulting
executable inside the clean root, loading the **AppDir** libraries, not the
development machine's GTK/WebKit libraries. Do not install those development
packages into the clean root.

```sh
cc -Wall -Wextra -Wno-deprecated-declarations \
  tools/tests/appimage-media-probe.c -o media-probe \
  $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1)

# Generate test media on the development machine; copy only these files
# and the probe executable into the isolated /results directory.
gst-launch-1.0 -q audiotestsrc num-buffers=250 wave=sine freq=440 \
  ! audioconvert ! opusenc ! webmmux ! filesink location=tone.webm
gst-launch-1.0 -q audiotestsrc num-buffers=250 wave=sine freq=440 \
  ! audioconvert ! avenc_aac ! mp4mux ! filesink location=tone.m4a

# Inside the isolated root, with AppDir mounted at /app and a display:
# linuxdeploy patches WebKit helper paths relative to this working directory.
cd /app/usr
LD_LIBRARY_PATH=/app/usr/lib:/app/usr/lib/x86_64-linux-gnu \
  /results/media-probe file:///results/
```

Use fresh XDG cache/data paths between stages and a working audio sink (a
null sink is sufficient for decoding/timing). Preserve package lists and
process maps; a successful test on the development host alone is not proof
of AppImage independence.

## Preliminary license findings — not a distribution approval

Ubuntu's base/good/bad copyright manifests contain LGPL and other notices;
the group name `bad` is not itself a license classification. The successful
AAC test actually loaded:

```text
/usr/lib/x86_64-linux-gnu/gstreamer-1.0/libgstfaad.so
/usr/lib/x86_64-linux-gnu/libfaad.so.2.0.0
```

The installed `libfaad2` copyright file declares GPL-2+ and GPL-3+ sections.
Thus enabling all available media plugins indiscriminately could introduce
GPL dependencies. Selecting components, their notices/source obligations
and any alternative AAC decoder needs a deliberate licensing review before
distribution. No project license decision was made here.

## Follow-up / remaining work

The local candidate uses explicitly selected plugins and a custom
LGPL-configured FFmpeg/gst-libav build instead of FAAD. It does **not** enable
Tauri's wholesale media bundling in production. Its clean-root and
official-player results, remaining distribution review and reconstruction
steps are in [appimage-candidate.md](appimage-candidate.md).

Signed-in playback, real speakers, full-track completion, H.264 decoding
(rather than its capability flag), other distributions and final license
compliance remain unverified. No new release or catalog re-test was triggered.
