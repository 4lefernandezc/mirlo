# Mirlo 0.1.9 local release preparation

Date: 2026-10-31. Owner scope: Windows and Linux, including corresponding
sources/notices. No push, tag, GitHub draft or publication is authorized.

## Packaging changes

- 0.1.9 includes the local offline recovery screen on both platforms.
- Windows: pinned Tauri CLI 2.12.3, notices bundled as a resource; NSIS/MSI
  updater signatures, plus the portable ZIP.
- Linux: Ubuntu 22.04 build, explicit multimedia set and non-setuid sandbox
  helpers. `tools/linux/release.sh` assembles notices/sources and repacks
  **before** signing the AppImage/deb with the release version.
- All Linux starts force WebKit's sandbox before GTK or worker threads;
  the unsafe disable variable is removed. Restricted namespace policies can
  therefore fail startup instead of silently removing isolation.
- Source collection rejects unowned ELF files and unavailable exact APT
  source versions. It includes source archives/patches, native notices,
  common license texts, Rust crate sources and a safe Mirlo snapshot.
  Upstream source archive hashes are pinned; source files get inner hashes.

## Windows evidence

- Final NSIS: 3,979,257 bytes; MSI: 4,943,872 bytes; portable ZIP:
  2,748,686 bytes. `minisign-verify` 0.3.0 validates both installer
  signatures with the embedded public key and trusted version 0.1.9; flipping
  one byte of each artifact correctly fails verification.
- The final portable ZIP was extracted into a fresh directory and launched
  with a clean profile (no owner's session copied). `get_config` IPC works.
- WebView2 CDP network emulation: offline player navigation reaches the
  local recovery screen, manual retry stays local while disconnected,
  restoring connectivity automatically returns to the player and bridge.
  The player bridge is absent on the recovery page. Graceful close passes.
- Windows fmt, Clippy (`-D warnings`), all 31 Rust unit tests and all three
  Node renderer tests across the offline-recovery and volume suites pass.
  Packaging Python/wrapper tests run under Linux.

## Volume regression review

- `precise-volume` global hotkeys and its wheel handler call the same
  `changeVolume` method, but the wheel handler was on the player-bar bubble
  path. YouTube Music's native volume slider could process that same wheel
  event first, producing a larger second change. Mirlo now captures wheel
  events that pass through either volume slider, applies one precise step and
  stops propagation before the native handler. A Node regression test simulates
  a global-key step followed by slider wheel and verifies one step per action.
- WebView2 CDP on the fresh portable ZIP set volume to 40, invoked the
  hotkey's `changeVolume` path to reach 41, then dispatched a composed wheel
  event to the live slider. It reached 42 with `defaultPrevented=true` (not
  47+), so the native second step was suppressed. This is a synthetic wheel
  event, not a physical-mouse test; the profile was signed out.

## Linux evidence

- Ubuntu 22.04 AppImage and `.deb` build successfully. The `.deb` declares the
  system WebKit, GStreamer base/good/bad/libav and non-setuid sandbox helper
  dependencies without duplicates.
- Final AppImage: 81,508,856 bytes, SHA-256
  `1d486e8f1e76b1034b516c87917bab2cee0135fa46bac2d30f90e8cfcb7d61ad`.
  Its Tauri updater signature and the `.deb` signature both verify with the
  embedded key and trusted version 0.1.9; tampered-byte negative controls are
  included in the local verification pass.
- Normal non-root WSLg FUSE launch: Tauri IPC and the bridge initialize
  (`ms=true aac=true opus=true`); MPRIS registers. WebProcesses report
  Seccomp 2/NoNewPrivs 1, distinct user/mount/PID/network namespaces, a
  read-only AppDir and no visibility of the private canary; the UI positive
  control can read it. No inspector or unsafe sandbox flags were used.
- The `.deb` dependency list has no duplicate entries. All 10
  binary/portable/source assets pass the outer
  `SHA256SUMS.txt`; the source tar's Zstandard stream and 17,079 inner file
  checksums also verify.
- This fresh unauthenticated profile exposed no track metadata or playback
  position, so it is not evidence of signed-in playback or physical audio.
  The owner-confirmed WSLg listening test belongs to the earlier experimental
  candidate. GPU falls back to software in this WSLg environment.
- The source archive includes the pinned AppImage runtime/AppRun and bundled
  native/Rust sources and notices; its external hash is in `SHA256SUMS.txt`.

Evidence/artifacts are outside the repository under
`$env:TEMP\opencode\appimage-clean-test\` and
`$env:TEMP\opencode\mirlo-release-0.1.9\`. Do not commit binary artifacts,
private profiles, local absolute paths or the updater private key.

## Issues caught during preparation

1. Matching data files by a common basename (`copyright`) attributed unrelated
   installed packages. The collector now uses each data file's full path;
   a regression test covers that distinction.
2. The reused private build root had older security libraries whose exact
   sources no longer appeared in current APT indexes. Packaging correctly
   stopped. Upgrade the dedicated build root before rebuilding, not just
   its notices; the workflow does the same before compilation/assembly.
3. A local experimental command initially continued to repack after a
   failed collector. That intermediate image was never signed/distributed.
   The production wrapper already uses `set -euo pipefail`; the temporary
   harness was corrected too. Only the complete later run is releasable.

## Explicit limits

- No public update-install E2E to 0.1.9 before publication; cryptographic
  verification is local. No final installer installed over the owner's app.
- H.264 decoded-pixel success belongs to the earlier **unsandboxed** probe,
  not the sandbox-enabled release candidate. Audio playback is the target.
- Google sign-in/persistence on Linux, physical GPU/native PipeWire and
  namespace-restricting desktop policies remain unverified. Owner confirmed
  hearing the earlier WSLg playback; no credentials were copied for tests.
- Notice/source collection is not a legal certification or an exhaustive
  vulnerability audit. Mirlo remains MIT; native dependencies retain their
  own license terms. Preserve the source archive with its matching release.
