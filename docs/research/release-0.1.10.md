# Release 0.1.10

Date: 2026-11-01. Scope: renderer/settings release on top of 0.1.9.

## Contents

- Custom themes (four dark palettes + Custom CSS, album-gradient suppression)
  and the in-app settings button.
- Album/playlist bulk like/dislike fixes: Mirlo styling, actions follow the
  pending work, immediate refresh, observer-loop freeze fixed, per-track
  snackbars suppressed.
- "Reload player" no longer asks Chromium's reload confirmation.
- Settings defaults: video toggle native + "Prefer audio", disable-autoplay
  and synced lyrics on, navigation off; custom-theme toggle removed; Discord
  client-id field removed.
- Dev-only `MIRLO_DEV_SRC` renderer loader (no product behavior).

## CI

Tag `v0.1.10` -> workflow `41353189275` green: Windows 5m10s, Linux 16m23s,
checksums 15s. Version bump commit `ad96438`.

## Draft verification (before publishing)

12 assets. All four updater signatures verify against the embedded public key
with trusted comment version 0.1.10 and reject a flipped byte (NSIS, MSI,
AppImage, deb). `SHA256SUMS.txt` matches the nine binary/portable assets and
the Linux sources archive. The sources archive extracts and passes its 17,083
inner checksums. `latest.json` reports 0.1.10 with `windows-x86_64`,
`windows-x86_64-nsis`, `windows-x86_64-msi`, `linux-x86_64`,
`linux-x86_64-appimage` and `linux-x86_64-deb`.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| NSIS setup | 4,008,716 | `3486a64f13121be168287b25851d9638c9660ba00efae18c85460b8f45770bb1` |
| MSI | 4,956,160 | `20934d607f63f9f1dafbff9ed8c8a728d6d2efe0dbcb7c4dee2f30db1203daaf` |
| portable ZIP | 2,842,127 | `eae466c8aeb2c629d7ca45466a2270c9f84a1ae4cd5054c638f0e05284033909` |
| AppImage | 81,562,104 | `167b29374d720507f9c305862eb9506247d2a0e2a901a28215ba6281bcffa324` |
| deb | 3,528,440 | `1fb020b417776b24c87256b4c2b287ca4451e500a3367021e8711399726c1404` |
| Linux sources | 526,520,516 | `e13ff4e0bbab63d4affc50885ab1a163e5b00e1c25b7ec6885c4dad6a36787c7` |

## Published

`v0.1.10` published as latest on 2026-11-01T22:00:46Z; anonymous updater
endpoint returns HTTP 200 with version 0.1.10.

## Limits

- No fresh device smoke of these exact binaries: the changes are renderer
  and settings only, and the Linux packaging pipeline/pins are unchanged from
  0.1.9 (whose published AppImage passed sandbox/bridge/MPRIS checks).
- Auto-update E2E from an installed 0.1.9 is owner-side.
- Linux sign-in/persistence, native GPU/PipeWire, H.264 under forced sandbox
  and namespace-restricted policies remain unverified (carried over).
- The native "prefer audio" path sets `playback-mode=ATV_PREFERRED` once in
  video-toggle's native mode; not exercised with a real music video here.
