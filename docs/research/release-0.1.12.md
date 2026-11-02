# Release 0.1.12

Date: 2026-11-02. Published as latest at 2026-11-02T18:27:04Z.

https://github.com/4lefernandezc/mirlo/releases/tag/v0.1.12

## Scope and approval

Owner requested publication and explicitly said **do not comment**. No PR
comment or `/retest` was posted. Release contains the corrected AppImage
sandbox fallback, not a claim that the catalog has accepted it.

Root cause and local negative control:
[AppImage catalog fallback](appimage-catalog-fallback.md). The 0.1.11
launcher omitted FORCE on a failed probe, but did not explicitly disable the
sandbox; Rust then forced it again. 0.1.12 fixes both layers. Normal launches
still force the sandbox; restricted hosts intentionally lose inner renderer
isolation instead of failing to start.

## Build and checks

- Fix commit `f8da05b`; tag `v0.1.12` points to
  `e93a53cf332f61f5fe6a691fbdb0e96219d07df4`.
- Release workflow `41497668415`: Windows 6m49s, Linux 11m52s, checksums 45s;
  all green. Main CI `41497662562` also passed.
- Local Windows fmt/Clippy and 32 Rust tests pass; 14 Node tests pass.
- Local Linux release build, nine packaging tests, wrapper test and 33 Rust
  tests pass. The child-only environment test is ignored by the default
  suite but explicitly executed in three isolated subprocesses by its parent.
  Pre-existing Linux unused-code/import warnings remain; no Linux Clippy run.

## Draft verification, before publication

12 assets. Four updater signatures verify against the embedded public key
with trusted version exactly 0.1.12 and reject a flipped byte. All ten
external checksums match (six bundles/source archives and four signatures).
Source archive extracts and passes **17,087 internal checksums**.

`latest.json` has version 0.1.12 and six platform entries. Each URL matches
the correct release asset's API URL; each embedded signature matches its
downloaded `.sig`. No binary or signed artifact was modified.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| NSIS setup | 4,008,889 | `4fad85ca69c7775caaf76a346688e5c129c51b272c178abfefaad25fadf45916` |
| MSI | 4,956,160 | `70c78c12ad0bc3bfe79dd02fe68a1a7d26681ff2094f722d493e5f95f4ffa11a` |
| portable ZIP | 2,842,603 | `ba33a62325bd88e0c19046a7cbfb016cedff51ff15643473e1a1b5aa888c8475` |
| AppImage | 81,562,104 | `8dfd41680ddf8810b152dcc17334c2eca48ae1a3e766b720d8208ae4df0d1911` |
| deb | 3,529,106 | `65589ec8234f14ae87adc770df219fb3c5cb9c259ba7a4887d58932e462558de` |
| Linux sources | 526,526,503 | `c5daaa36456dd827bd694a1a9233feee576c7c5818f7c9edefd2a17ac6fe75c2` |

## Exact artifact runtime checks

### Linux

Downloaded, signed CI AppImage tested in a Debian 12 userspace with no
installed GTK/WebKit/GStreamer. Xvfb/software rendering, fresh signed-out
profiles and isolated user/mount/PID/network namespaces; loopback was the
only network interface. No manually injected WebKit sandbox-disable flags.

All four paths passed:

| Launch | Nested mounts | Result |
| --- | --- | --- |
| `--appimage-extract-and-run` | Allowed | Local light offline screen; live WebProcess; Seccomp 2 and separate renderer mount/PID/network namespaces |
| `--appimage-extract-and-run` | Denied with seccomp/EPERM | Automatic fallback warning; local offline screen and live WebProcess |
| Actual FUSE mount, then AppRun | Allowed | Same successful offline screen and renderer isolation checks |
| Actual FUSE mount, then AppRun | Denied with seccomp/EPERM | Same automatic fallback and live offline screen |

The FUSE image was mounted by its own runtime on the normal non-root WSL
host, then exposed read-only to the Debian test root before restrictions
were applied (like the catalog's outer mount). Mountinfo identifies the
read-only `fuse.Mirlo_0.1.12_amd64.AppImage` filesystem. Direct mounting inside
the minimal Debian root first failed because it has no fusermount; this is
a fixture prerequisite, not the AppImage fallback failure.

Screenshots reviewed: actual "Connect Mirlo to the internet"/"Try again"
content, not a blank main window. Logs identify Mirlo 0.1.12, `ready`, MPRIS
registration and the expected DNS failure. Process maps show bundled WebKit,
JavaScriptCore and GStreamer from AppDir. In restricted runs, Seccomp 2 is
the inherited **outer test filter**, not evidence of an inner WebKit sandbox.

### Windows

Exact downloaded portable ZIP: required files/empty marker, executable
version 0.1.12 and GUI subsystem verified. Fresh portable profile under its
own `data` folder; update checks, Discord, notifications and shell hotkeys
disabled only in that test profile. Bridge loaded on the official player.
CDP offline navigation showed local recovery without the player bridge;
manual retry stayed local while offline, then restored the real player and
bridge when network emulation was lifted. Precise volume sequence passed
40 -> 41 through the hotkey method -> 42 through captured slider wheel.
Graceful shutdown succeeded; version/ready/profile checked after closing
(the first log read while the logger held the file was sharing-locked).

## Published endpoint

Anonymous latest updater endpoint HTTP 200 returns 0.1.12 with all six
entries identical to the verified draft. Anonymous HEAD requests using
`Accept: application/octet-stream` to all four binary API URLs return 200
and the correct asset lengths. This verifies access, not an installed
auto-update end-to-end.

## Evidence and remaining limits

Temporary evidence, kept outside the repository:

- `$env:TEMP\opencode\mirlo-ci-verify-0112\`: downloaded assets.
- `$env:TEMP\opencode\appimage-clean-test\catalog-ci-0112-{extract,fuse}-{normal,restricted}\`:
  screenshots, logs, namespace/filter snapshots and loaded library paths.
- `ci-0112-fuse-mountinfo.txt` and `ci-0112-debian-packages-{before,after}.txt`
  in that same results directory.
- `$env:TEMP\opencode\windows-smoke-0112\smoke.json` and its `data\logs`.

The catalog's exact Firejail/kernel has **not** retested this release. No new
signed-in playback, Linux login/persistence, native GPU/PipeWire, H.264,
private-canary sandbox audit, installer installation or installed updater
E2E was performed. Earlier checks do not establish those for these exact
binaries. No comment or retest request was made, as instructed.
