# Release packaging

The packaging workflow is `.github/workflows/release.yml`. A `v*` tag builds
Windows and Linux artifacts and creates a draft release.

## Version and checks

The version must match in `app/src-tauri/tauri.conf.json`, `Cargo.toml` and
the root package entry in `Cargo.lock`. Released changes have a dated
`CHANGELOG.md` heading; source-only changes remain under `[Unreleased]`.

Build/test commands and prerequisites are in [app/README.md](../app/README.md).
Packaging uses release builds with `MIRLO_DEV_SRC` unset.

## Signing

The updater public key is embedded at `plugins.updater.pubkey` in
`tauri.conf.json`. The build environment supplies the matching private key as
`TAURI_SIGNING_PRIVATE_KEY` and, if applicable, its password as
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never include private keys in the
repository, source archives, logs or release assets.

Updater signatures are distinct from Windows executable code signing.
Existing installations trust only their embedded public key. Replacing the
key without a compatible transition requires users to reinstall manually.

## Artifacts

| Artifact | Contents/use |
| --- | --- |
| `Mirlo_<version>_x64-setup.exe` + `.sig` | NSIS per-user installer |
| `Mirlo_<version>_x64_en-US.msi` + `.sig` | WiX per-machine installer |
| `Mirlo_<version>_portable_x64.zip` | Executable, portable marker, instructions and licenses |
| `Mirlo_<version>_amd64.AppImage` + `.sig` | Bundled Linux runtime, codecs and sandbox helpers |
| `Mirlo_<version>_amd64.deb` + `.sig` | Linux package using distribution dependencies |
| `Mirlo_<version>_linux-sources.tar.zst` | Corresponding sources, notices and inventory |
| `latest.json` | Updater versions, URLs and signatures |
| `SHA256SUMS.txt` | Download checksums |

The portable ZIP and `.deb` require manual updates even though update checks
are available. The updater endpoint is:

`https://github.com/4lefernandezc/mirlo/releases/latest/download/latest.json`

## Linux assembly

Linux packaging uses Ubuntu 22.04 and the pinned Tauri CLI/dependencies in
the workflow. The scripts build unsigned stock bundles, add multimedia and
non-setuid sandbox helpers, collect notices/corresponding sources and repack
the AppImage. **Only final bytes are signed.** Never modify a signed bundle.

From the repository root, with prerequisites and signing environment set:

```sh
python3 tools/tests/test_linux_packaging.py
python3 tools/tests/appimage-candidate/test_wrapper.py
bash tools/linux/build-codecs.sh /tmp/mirlo-linux
cd app
bash ../tools/linux/release.sh build --bundles appimage,deb
```

Keep the matching source archive available with each AppImage.
See [Linux sources and rebuilding](linux-sources.md).

## Artifact validation

- Match the reported executable/package version to the release.
- Check every published checksum and the source archive's inner checksums.
- Verify updater signatures against the embedded public key; a modified
  artifact must fail verification.
- Run the final Windows installer and portable ZIP using isolated data.
  Check per-user paths, profile persistence and graceful exit.
- Run the final AppImage with FUSE and extracted launch, without host
  WebKit/GStreamer. Check playback, seek, next, offline recovery and normal
  renderer isolation. Check restricted-host startup selects the documented
  fallback and warns that isolation is unavailable.
- Check `.deb` dependencies separately.
- Test updating from an installed previous version; download verification alone
  does not establish installation/restart behavior.

These checks describe artifact validation, not a claim that every release has
been exercised on every platform. Current limits are in
[architecture](architecture.md#current-limits).
