# AppImage candidate: extended tests — 2026-10-30

## Outcome

The experimental candidate passes full-track playback, non-silent decoded
audio, H.264 decoding, a second distribution's clean userspace and normal
FUSE launch. **It is not ready for distribution:** the WebKit sandbox check
fails because the packaged relative `bin/bwrap` helper is missing.

Candidate unchanged: 80,402,936 bytes, SHA-256
`aee29a5eb75e1c29cb89b77cff657aff58d3a18c402cb5e6538fd94ead2c5a4e`.
It still contains v0.1.8, not the later offline screen. No production
packaging, license, account, signing or release changes.

## Test matrix

| Question | Result | Boundary |
| --- | --- | --- |
| Entire official track | PASS | Signed out, isolated Ubuntu 22.04 userspace, packaged engine |
| Audio actually reaches a sink | PASS | Non-silent PCM captured from isolated null sink |
| H.264 frames decode | PASS | Generated 320×180 baseline MP4, 6 s, 25 distinct frame pixel hashes |
| Corrupt video rejected | PASS | Probe exits 1, media error 4; valid audio controls still finish |
| Existing audio-only probe | PASS | Optional video mode preserves the old AAC/Opus checks |
| Another distribution | PASS | Clean Debian 12/bookworm userspace; WSL kernel/display still shared |
| FUSE | PASS on WSL host | Real mount and complete AppImage launch/playback, no extract fallback |
| Normal rendering flags | PASS with software fallback | No explicit WebKit sandbox/rendering disable variables in Debian or host-FUSE run |
| WebKit nested sandbox | FAIL | Relative `bin/bwrap` missing; forcing sandbox aborts startup |
| Hardware/zero-copy graphics | NOT VERIFIED | DRM access denied in isolation; GL video sink dependencies absent |
| WSLg → Windows audio routing | PASS for routing | Active unmuted Mirlo stream → RDPSink, not a listening assertion |
| Signed-in playback | NOT RUN | Owner must log in; no credentials or existing profile copied |
| Physical listening/native PipeWire | NOT RUN | Agent cannot hear speakers; WSLg is not a native PipeWire desktop |

## Full official track and audio

Loaded “Panama” (`2wHU5ocfFsA`) through the official router. After loading,
seeked once to 0 and started playback; no further seeks or next commands
were sent. Read the active `#movie_player video`, not the bridge's briefly
stale cached position immediately after a seek.

- Initial active media position 0, nominal duration 213 s.
- Playback rate remained 1; no media errors or premature switches.
- Captured `ended` at position/duration **212.6545 s** for that same ID.
- The official queue advanced naturally to “Dirty Deeds Done Dirt Cheap”,
  `UIE4UjBtx-o`, nominal duration 232 s. Wall-clock sampling observed
  completion after about 209 s; this is not a calibrated clock-accuracy test.
- During that run, the isolated PulseAudio monitor captured **342,338
  signed 16-bit samples**, stereo 44.1 kHz, **3.8814 s**: RMS **1056.76**,
  peak **4942**, **342,161 nonzero samples**. The active uncorked/unmuted
  sink input identified Mirlo's `WebKitWebProcess`. This rules out a
  progressing UI with no decoded output to the test sink.

An initial extended run completed the track but its audio server failed
to start after the WSL restart. It was **not** accepted as audio-output
evidence. The server now uses its own writable temporary home; launcher
readiness checks `pactl info`, not the existence of a stale socket. The
full-track run was repeated successfully with the PCM checks above.

PCM is temporary diagnostic data, not a repository fixture, download
feature or distributed music asset. No source stream URL was extracted
or fetched outside the official player.

## H.264 positive and negative controls

`tools/tests/appimage-media-probe.c` accepts the optional second argument
`--h264` after its media base URI. Default invocation still checks only
AAC/Opus. Generate the extra fixture on a development machine, **not in
the clean root**:

```sh
gst-launch-1.0 -q videotestsrc num-buffers=144 pattern=ball \
  ! video/x-raw,width=320,height=180,framerate=24/1 \
  ! videoconvert ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=350 \
  ! video/x-h264,profile=baseline ! h264parse ! mp4mux \
  ! filesink location=h264.mp4
```

Fixture SHA-256:
`13206d2b1469d5f84d8353ef9bbbc7d016849b7ba614f16db53398e77e56f16a`.
This identifies the final generated fixture, not a reproducibility promise
for MP4 container timestamps.
The system x264 **encoder** only generates test media; it is not added to
the AppImage. Candidate decoding still uses the selected multimedia set.

Inside the clean root, use the packaged-library environment from the
[initial probe](appimage-clean-room.md), sourcing the candidate's own
GStreamer hook and placing the fixture beside `tone.webm`/`tone.m4a`:

```sh
cd /app/usr
LD_LIBRARY_PATH=/app/usr/lib:/app/usr/lib/x86_64-linux-gnu \
  /results/media-probe file:///results/ --h264
```

All three samples reach `ended=true`, no media error; video reaches 6 s
with width 320 and **25 distinct canvas frame hashes**. The check requires
at least three distinct pixel snapshots, completion, dimensions and elapsed
media time. WebKit's exposed frame counters stay zero on this engine, so
`getVideoPlaybackQuality()` alone gives a false negative. Process maps show
packaged `libgstlibav.so`/`libavcodec.so.59`.

Negative control: copy the valid audio fixtures into a separate directory
and create `h264.mp4` containing plain text there. Invoke the same probe
with that base URI and `--h264`. Expected/observed: exit **1**,
`passed=false`, video `NotSupportedError`, media error **4**, width 0,
zero distinct frames; both audio fixtures still finish. The probe compiles
with `-Wall -Wextra -Werror`.

## Debian userspace

Official `docker.io/library/debian:bookworm-slim` amd64 filesystem, obtained
anonymously over HTTPS with OCI manifest/layer SHA-256 checks. This tests
userspace compatibility, not another physical machine or kernel.

- Image index SHA-256:
  `99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3`.
- Selected manifest:
  `sha256:a3bba7dc7dbcc1f37c2856c51fc9a7fac96608f50cb87b1b4e4d8b8c85ae988e`.
- Root layer:
  `sha256:3c5439d0ae62993af4cc4e21b8c777297e81bc40e200d4633c85a3e0f977a3bc`.
- Added normal desktop/graphics/fonts/CA/D-Bus/FUSE prerequisites and system
  `bubblewrap` for investigation. No GTK, WebKit or GStreamer packages
  installed; package list checked.
- Generic test user, fresh data/cache. No personal home, credentials or
  system library trees mounted from the host.
- `--appimage-extract-and-run`, no explicit sandbox/rendering disable flags:
  “Panama”, `ad=false`, **13.961319 → 26.65893 s**, duration 213 s,
  unpaused, no error. Maps show packaged GTK/WebKit and Debian glibc. Mesa
  uses `swrast_dri.so`, not verified hardware GPU.

Ads finish normally. `getVideoData().video_id`/title can still describe the
requested song while the active media is an ad; those checks alone are
insufficient. The final test also requires `ad-showing=false`, active media
duration near 213 s, then continued progress.

## FUSE and WSLg audio

FUSE inside the remapped namespace failed with `FUSERMOUNT_PROG not set`.
This is **not proof of a broken normal desktop launch**: the artificial
namespace affects setuid fusermount ownership/privileges.

On the ordinary non-root Ubuntu 24.04 WSL host:

1. `--appimage-mount` creates a real read-only `fuse.Mirlo_...` mount with
   `usr/bin/mirlo`, mounted as the test user's UID/GID.
2. The complete candidate launches **without an extract flag**, external
   GStreamer paths or WebKit disable flags. Maps show packaged GTK/WebKit
   under `/tmp/.mount_Mirlo_<id>/usr/`.
3. With dedicated fresh data, ads finish; “Panama” advances **1.01324 →
   12.93945 s**, duration 213 s, unpaused and `ad=false`.
4. WSLg reports an active unmuted Mirlo stereo 48 kHz stream routed to its
   **RDPSink**, which connects to Windows audio.

This host has desktop/media packages, unlike the clean roots. The FUSE
test proves the normal launch path, not a separate dependency-independence
claim. Physical audibility still requires a human.

## Failed sandbox check — do not waive

In Debian without explicit disabling flags, Mirlo and WebKit share the
outer mount/user namespaces and report `Seccomp: 0`: no additional WebKit
sandbox was established. `NoNewPrivs: 1` alone is not proof of one.

The packaged engine contains the rewritten helper path `././/bin/bwrap`.
Neither the original AppDir nor this candidate includes that helper.
Installing Debian's `/usr/bin/bwrap` does not supply the relative helper
inside the AppDir. With `WEBKIT_FORCE_SANDBOX=1`, startup fails:

```text
Failed to start dbus proxy: Failed to spawn child process
"././/bin/bwrap" (No such file or directory)
```

Outer Bubblewrap isolation protected the tests; it is not an active **inner
WebKit sandbox**. The unchanged published packaging cannot be called
sandbox-verified either. Adding one helper has not been tested as a complete
fix: proxy/helper dependencies, namespaces, IPC and app behavior need a
reviewed sandbox-enabled candidate and rerun. No weakening flags were added
to Mirlo.

DRM nodes reject access in isolation; the selected plugins also omit GL
video sink dependencies noted by WebKit. Software playback works, but
hardware acceleration/zero-copy rendering is not certified.

## Evidence and remaining work

Temporary evidence under `$env:TEMP\opencode\appimage-clean-test\`:
`full-track-report.json`, `full-track-audio-report.json`,
`full-track-audio-routing.txt`, `h264-probe.log`, `h264-probe-maps.txt`,
`probe-legacy-control.json`, `probe-negative-control.json`,
`debian-image-identity.json`, `debian-desktop-packages.txt`,
`debian-extract-sandbox-report.json`, `debian-extract-sandbox-process-status.txt`,
`debian-extract-force-runtime.log`, `debian-host-fuse-report.json`,
`host-fuse-maps.txt`, `fuse-mount-evidence.txt`, `wslg-pulse-inputs.txt`.
Raw routing/maps may contain local identifiers; only reviewed results are
kept in the repository, not those raw files or audio.

REA's process-capture adapter was unavailable on Windows (descendant
cleanup unsupported); no tooling reconfiguration attempted. Evidence comes
from the owned WSL harness, inspector, process maps/status and PulseAudio,
not a claimed REA capture.

Repository checks: 31 Rust tests and two recovery-screen Node tests pass;
Windows fmt/Clippy clean. No product code or production workflow changed.

Remaining **manual/environment** checks: owner signs in to the dedicated
Linux test profile and confirms playback/account persistence; owner confirms
physical audio. Native Linux/PipeWire and actual GPU hardware remain outside
this WSL test boundary. No credentials/existing sessions were borrowed.

Next engineering gate: repair/retest packaged WebKit sandbox; review the
selected libraries' security and distribution/source/relinking obligations
before integration. Multimedia tests do not settle licensing or patents.
