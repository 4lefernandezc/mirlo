# Local multimedia AppImage candidate — 2026-10-29

## Outcome and scope

**2026-10-30 follow-up:** full-track, decoded PCM, H.264, Debian userspace
and FUSE checks are complete, but the packaged WebKit sandbox check fails
(missing relative `bin/bwrap`). See [extended results](appimage-final-tests.md)
before considering distribution. Manual sign-in/listening and hardware GPU
checks remain outside the automated results.

**Sandbox follow-up:** a separate [sandbox-enabled candidate](appimage-sandbox-candidate.md)
now passes WebProcess isolation, private-file denial, real playback and IPC.
The owner has also confirmed listening during the WSLg tests. The artifact
and findings below identify the earlier multimedia-only candidate.

The experimental candidate plays generated AAC/MP4 and Opus/WebM samples
without installed GTK, WebKit or GStreamer packages. The complete AppImage
also plays a real track through the official YouTube Music player, seeks
and advances to a different real track in that same isolated userspace.

This is **not a release, license approval or production packaging change**.
It reuses the published v0.1.8 executable unchanged, so it does **not**
contain the later, locally committed offline recovery screen. No stream
extraction, Google session sharing, push, signing or publishing was used.

## Identified artifact

- Name: `Mirlo_multimedia_experimental_x86_64.AppImage`.
- Size: **80,402,936 bytes** (76.68 MiB).
- SHA-256: `aee29a5eb75e1c29cb89b77cff657aff58d3a18c402cb5e6538fd94ead2c5a4e`.
- Local location: `$env:TEMP\opencode\appimage-clean-test\`.
- Based on the original [0.1.8 AppImage](appimage-clean-room.md), unchanged
  runtime prefix (944632 bytes), repacked with SquashFS zstd level 19.
  The original runtime rejects xz (`supports only zlib, zstd`); the earlier
  xz experiment is not the candidate identified above.
- Compression/content differences explain why adding multimedia did not
  increase the size relative to the original 82,106,872-byte package.

## Decoder and selected plugins

Built **inside Ubuntu 22.04**, not against WSL's newer host glibc:

| Source | URL | SHA-256 |
| --- | --- | --- |
| FFmpeg 5.1.10 | https://ffmpeg.org/releases/ffmpeg-5.1.10.tar.xz | `392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293` |
| gst-libav 1.20.7 | https://gstreamer.freedesktop.org/src/gst-libav/gst-libav-1.20.7.tar.xz | `65e776e366f7f3549a9a829418817f464dcc5dc9845220c64a886683d8841b56` |

FFmpeg configuration:

```sh
--prefix=/opt/mirlo-codecs --libdir=/opt/mirlo-codecs/lib \
--disable-everything --disable-autodetect --disable-gpl --disable-nonfree \
--disable-version3 --disable-programs --disable-doc --disable-network \
--enable-shared --disable-static --enable-decoder=aac,aac_latm,h264 \
--enable-parser=aac,aac_latm,h264
```

`avcodec_license()` returns `LGPL version 2.1 or later`; generated
`CONFIG_GPL`, `CONFIG_NONFREE` and `CONFIG_VERSION3` are all 0. Meson used
the local shared FFmpeg libraries, `--wrap-mode=nofallback`, disabled tests
and docs; GCC 11.4.0, Meson 0.61.2, GStreamer core 1.20.3/base 1.20.1.

The 23 plugin libraries are:

```text
coreelements app playback typefindfunctions autodetect audioconvert
audiofx audioresample volume pulseaudio opus opusparse matroska isomp4
audioparsers subparse subenc videoparsersbad debugutilsbad videoconvert
videoscale vpx libav
```

`audiofx` supplies `scaletempo`; its addition removed the missing-element
warning. There is no `faad` plugin or `libfaad`. Including the scanner and
transitive libraries adds **45 ELF files**. Additions include FFmpeg
avcodec/avformat/avfilter/avutil, vpx, Opus, PulseAudio client/common,
sndfile, asyncns, FLAC, Vorbis/Ogg, apparmor and GStreamer support libraries.
Existing base libraries are retained; glibc and desktop/driver libraries
remain supplied by the OS. An `ldd` closure is not a complete inventory of
all possible runtime `dlopen` paths.

The launcher sources a local GStreamer hook immediately before
`AppRun.wrapped`. All plugin/scanner paths point inside `$APPDIR`; no
external plugin-path variable is supplied to the complete-image test.
Added ELF RPATHs use `$ORIGIN` relative to their bundled location.

## Isolation and evidence

A **second** Ubuntu Base 22.04.5 root was created for this candidate,
separate from the compiler/plugins root. `dpkg -l` confirmed no installed
`libgtk*`, `libwebkit*`, `libgstreamer*` or `gstreamer*` packages.

Installing PulseAudio initially brought GStreamer libraries transitively;
PulseAudio and both GStreamer libraries were removed before accepting any
result. Instead, a separate server in the build root exposes only a Unix
audio socket to the test root, using an anonymous isolated null sink.
No audio-server libraries or build-root plugins are mounted into the test
root. The test still requires ordinary desktop libraries and graphics
drivers; it is not a promise of operation on bare Ubuntu Base alone.

Desktop `libgles2` 1.4.0-1 supplies `libGLESv2.so.2`. Its absence caused
the inspector timeouts seen in the initial investigation; after installation,
`Runtime.evaluate` works. glibc remains the test OS's 2.35-0ubuntu3.8.

WSL2/WSLg provides the kernel/display. Bubblewrap isolates the root and PID
space; the environment is cleared and no host home, Google profile, `/usr`
or `/lib` is shared. Software rendering and disabling WebKit's nested
sandbox are **test-only**, inside that isolation, not product defaults.

### Generated samples (repeated with final plugin selection)

The existing `tools/tests/appimage-media-probe.c`, loaded against the
candidate's packaged libraries, exits 0:

| Sample | Final time/duration | Ended | Media error |
| --- | --- | --- | --- |
| Opus/WebM | 5.333333333 s | true | none |
| AAC/MP4 | 5.828333333 s | true | none |

MSE AAC, Opus and H.264 capability flags are all true. Process maps contain
`/app/usr/lib/gstreamer-1.0/libgstlibav.so`, `/app/usr/lib/libavcodec.so.59`,
packaged GTK/WebKit and `/usr/lib/x86_64-linux-gnu/libc.so.6` from the OS.
The harmless session-bus warning in the standalone probe does not prevent
either sample finishing. Actual H.264 frame decoding was not tested.

### Complete AppImage / official player

Launched with `--appimage-extract-and-run` in the clean root, with **no
`/app` mount and no external GStreamer paths**. Runtime maps show libraries
under its own `/tmp/appimage_extracted_<id>/usr/` directory. Mirlo logs
`bridge-ready (ms=true aac=true opus=true)` and `player-api-loaded`.

The WebKit inspector test used the official app router (temporary anchor
to `/watch?v=2wHU5ocfFsA`), muted the active video, and exercised
`window.__mirlo.player`. Final run:

| Check | Observed state |
| --- | --- |
| Playback | “Panama”, `2wHU5ocfFsA`, duration 213 s, unpaused; position 9.9 → 22.5 s over ~12 s |
| Seek to 90 s | Same track, 93.4 s after ~3 s, unpaused |
| Next | “Ain't Talkin' 'Bout Love”, `qtwBFz6lfrY`, duration 228 s, position 10.3 s, unpaused |

The first exploratory next-track check mistakenly accepted a 14 s item
with an empty title (likely an ad). That result was rejected. The corrected
test waits for short/untitled items to finish normally and requires a
different video ID, nonempty title, duration >30 s and unpaused state.
Those checks passed in the final run; they are test heuristics, not a
general advertisement classifier. No ad skipping was added to the product.

Temporary evidence under `$env:TEMP\opencode\appimage-clean-test\`:
`candidate-youtube-report.json`, `candidate-image/logs/mirlo.log`,
`candidate-image-maps.txt`, `candidate-probe-maps.txt`,
`clean-desktop-final-packages.txt`, `candidate-codec-check.json`,
`candidate-added-files.json`, and the configure/build logs. Files may be
removed by OS temporary-file cleanup; essential results are recorded here.

## Reconstructing the experiment

Preserved recipes: `tools/tests/appimage-candidate/{build-codecs.sh,assemble.py,pack.sh}`.
They are manual, version-specific experiments, **not CI hooks**. Use fresh
disposable roots outside the repository; never run the build/assembly
recipes against the workstation's `/opt` or `/usr`. Do not run Python with
`-O` (the recipes use assertions for self-checks).

1. Prepare a private Ubuntu 22.04 build root. Install `build-essential`,
   `pkg-config`, `nasm`, `python3`, `meson`, `ninja-build`, `patchelf`,
   `libgstreamer1.0-dev`, `libgstreamer-plugins-base1.0-dev` and
   `gstreamer1.0-plugins-base/good/bad`. Current recipes also require
   `bubblewrap`/`xdg-dbus-proxy` and the adjacent `bwrap` adapter for the
   sandbox follow-up; use commit `27342e2` for the earlier assembly alone.
   The build root may contain FAAD;
   the explicit assembly selection must not copy it.
2. Mount a disposable results directory at `/results`, containing the two
   source archives above. Run `bash build-codecs.sh` **inside** that root.
   Hashes, disabled license flags and the library's license string are
   checked; configuration and build logs are saved under `/results`.
3. Extract the verified original AppImage using `unsquashfs -o 944632`,
   and copy its AppDir into the build root at
   `/opt/mirlo-candidate.AppDir`. Run `python3 assemble.py` inside the
   root. It requires a fresh copy, adds the selected plugins, closes their
   dependencies, patches RPATHs, copies notices/configuration and writes
   `/results/candidate-added-files.json` with post-patch hashes.
4. On the development host, install `squashfs-tools` and Python 3. From
   a fresh temporary output directory run
   `bash <repo>/tools/tests/appimage-candidate/pack.sh <original.AppImage> <staged.AppDir>`.
   The original image hash/runtime offset are checked; existing output is
   not overwritten. Build timestamps/package updates mean output hashes
   are not expected to be bit-for-bit reproducible.
5. Prepare a separate desktop-only clean root as above; verify its package
   list before running. Expose only X11 display and isolated PulseAudio
   sockets, device/process filesystems, DNS and `/results`. Clear the
   environment; set `DISPLAY=:0`, `PULSE_SERVER` to the exposed socket and
   fresh `XDG_CACHE_HOME`/`XDG_DATA_HOME` paths. For the engine probe only,
   mount the AppDir read-only at `/app`, source its GStreamer hook with
   `APPDIR=/app`, and use the probe command in the initial report.
6. For the complete-image check, **omit `/app`**, plugin/library path
   overrides and the host profile. Set `MIRLO_DATA_DIR=/results/candidate-image`
   with a dedicated test config (resume/update checks disabled). Run
   `dbus-run-session -- <candidate.AppImage> --appimage-extract-and-run`.
   Inspect process maps and the Mirlo log, not just capability flags.
7. For inspector automation, expose `WEBKIT_INSPECTOR_SERVER=127.0.0.1:9234`
   and `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9235` only during the test.
   The page listing supplies `/socket/<n>/<n>/WebPage`; send
   `Target.setPauseOnStart(false)`, then nested `Inspector.enable`,
   `Page.enable`, `Runtime.enable` and `Inspector.initialized` through
   `Target.sendMessageToTarget`. Evaluate with `emulateUserGesture:true`.
   Use `__mirlo.player.state()`, `seek(90)` and `next()` with the assertions
   above. Always terminate the test's own processes/audio server afterwards.

The saved assembly/packing recipes are a cleaned-up transcription of the
tested steps: stricter notice and launcher checks, source-hash checks and
explicit packing inputs. Notice inventory changes can alter the image hash.
They do not preserve every machine-specific WSL orchestration helper.

Recipe checks: saved assembly executed against a fresh original AppDir;
all 45 added ELF hashes match the tested candidate and `cmp` confirms its
Mirlo executable is unchanged. Saved packing completes successfully (same
80,402,936 bytes; regenerated hash
`5618502166fe10b2fd7e389cbb5c94f8004cc4700ae34dff86010d7a9c497bfe`).
This regenerated image was not separately player-tested. Both shell
recipes pass `bash -n`; the codec compilation itself used the original
equivalent recipe, not a second full rebuild with the saved transcription.
Repository checks: Windows fmt/Clippy clean, 31 Rust tests pass.

## Distribution gate — still pending

- FFmpeg's LGPL configuration and absence of FAAD do **not** establish
  compliance of the entire image. Review each selected plugin and transitive
  library, preserved base libraries and notices. Source availability,
  modifications/build instructions, replacement/relinking obligations and
  any patent implications need review before distribution. Mirlo's license
  is unchanged; no legal conclusion is made here.
- Retained versions are an experimental compatibility baseline, not a
  security approval. Review current security fixes and source provenance
  before choosing versions for a distributed bundle.
- Still untested: physical speakers/PipeWire, signed-in playback, an entire
  official track to completion, H.264 decoding, FUSE launch, another Linux
  distribution/hardware and normal sandbox/GPU operation outside WSL. The
  [extended tests](appimage-final-tests.md) supersede the full-track/H.264/
  FUSE/second-userspace limitations and identify the sandbox failure; they
  do not clear distribution.
- Next implementation step, only after these gates: integrate a pinned,
  selected multimedia set into the normal Ubuntu 22.04 packaging pipeline
  and rebuild current Mirlo (including offline recovery). Do not just enable
  wholesale `bundleMediaFramework`, which can pull unreviewed host plugins.
