# Release 0.1.11

Date: 2026-11-02. Patch release on top of 0.1.10.

**Post-release correction:** catalog run `41494406860` failed on this exact
release. The probe correctly reports failure, but the fallback does not work:
`lib.rs::run()` unconditionally restores `WEBKIT_FORCE_SANDBOX=1`, and the
launcher does not explicitly set WebKit's disable variable. The earlier
claims below that restricted hosts successfully start were not supported by
a runtime test. See [the follow-up investigation](appimage-catalog-fallback.md).

## Contents

- **Disable autoplay**: no longer pauses a track the user just picked, and no
  longer re-pauses the next play (the upstream one-shot `timeupdate` stayed
  armed while paused). Track changes from shell hotkeys/SMTC/MPRIS count as
  user intent through the bridge's `mirlo:user-intent` event.
- **AppImage sandbox fallback**: the AppRun probes
  `bwrap --unshare-user --unshare-pid --ro-bind / / --proc /proc true`; only
  when it succeeds does it export `WEBKIT_FORCE_SANDBOX=1`. Otherwise it logs
  `WebKit sandbox unavailable here; continuing without it`, but Rust then
  forces the sandbox again, so this release still aborts on restricted hosts.

## AppImage catalog context

`appimage.github.io` PR 10937 retested the 0.1.10 AppImage in a container
without network. There bwrap failed with
`Can't mount proc on /newroot/proc: Operation not permitted`, WebKit aborted
(`readPIDFromPeer`), and the test reported "The application exited within 11
seconds instead of showing a window". 0.1.8 had passed because it did not
force the sandbox. The intended fallback was to keep the sandbox on normal
desktops and drop it where the host blocks the required namespaces. The
published 0.1.11 AppRun was extracted and inspected: the probe is present,
but that inspection did not prove the runtime behavior.

## CI

Tag `v0.1.11` -> workflow `41485837763` green: Windows 8m43s, Linux 16m28s,
checksums 29s. Version bump commit `11c400a`.

## Draft verification (before publishing)

12 assets. Four updater signatures verify against the embedded key with
trusted version 0.1.11 and reject a flipped byte. `SHA256SUMS.txt` matches the
nine binary/portable assets and the sources archive; the sources extract and
pass 17,085 inner checksums. `latest.json` is 0.1.11 with all six platform
entries.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| NSIS setup | 4,008,546 | `566786caa47c28b6bfc13ba08da191a0daddceeea5864b482ca846a842a87ad6` |
| MSI | 4,956,160 | `226d54919f00e828761b4d225640332b6c21bb040b8acf25dd2e4f8f3bc6d274` |
| portable ZIP | 2,842,636 | `4fd988a106ffc80bd10f14115e894d46426057b9302572e4a8e5ecb3e0732eff` |
| AppImage | 81,562,104 | `7dd05652a5b94527f7b2c69bd4c334281440bb2af3d16edb77aef82cc4d4ed79` |
| deb | 3,528,846 | `8d9e1131cab6a7c689c4cf3ef5f8bb8d46082b51603ce01c514693fa4f2c4c98` |
| Linux sources | 526,522,337 | `4f35791b5ac1dd9ad05b17857600135c8fe0cfbb94836bec7f296c4318f0a2ca` |

## Published

`v0.1.11` published as latest on 2026-11-02T17:13:53Z; anonymous updater
returns HTTP 200 with 0.1.11.

## Limits

- No fresh device playback smoke; the autoplay change is covered by five Node
  tests (intent window, late auto-start, `applyOnce`, listener cleanup), not a
  signed-in session.
- The intent heuristic is 1.5 s; a user action routed outside the page and
  the shell event could still be treated as autoplay.
- The intended "sandbox when possible" policy did not take effect on
  restricted hosts. They still fail startup in 0.1.11.
- The owner's catalog `/retest` failed; screenshot review remains pending a
  corrected release.
