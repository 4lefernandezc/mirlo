# Release guide (maintainers)

How a Mirlo release is produced. The pipeline lives in
`.github/workflows/release.yml`; this document covers the one-time setup, the
release steps and the post-release verification.

## One-time setup

1. **Make the repository public** (owner decision). The updater endpoint
   `https://github.com/4lefernandezc/mirlo/releases/latest/download/latest.json`
   requires anonymous access; while the repo is private, update checks fail
   with a 404 (logged, harmless).
2. **Signing keys.** The updater signing keypair was generated with:

   ```powershell
   npx @tauri-apps/cli@^2 signer generate -w "$env:USERPROFILE\.tauri\mirlo.key" --ci
   ```

   - Private key: `%USERPROFILE%\.tauri\mirlo.key` — **never commit it, never
     lose it** (without it no future version can be signed).
   - Public key: embedded in `app/src-tauri/tauri.conf.json`
     (`plugins.updater.pubkey`). Built apps verify update signatures against
     it.
   - The current key has **no password**; rotate deliberately (see below).
3. **GitHub secrets** (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: the *contents* of `mirlo.key` (or its
     base64 body; the file content as-is works).
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: set only if the key has a password
     (leave the secret unset for the current passphraseless key — an unset
     secret expands to an empty string, which is correct).

## Version bump

Keep these in sync:

- `app/src-tauri/tauri.conf.json` → `"version"` (drives the bundles and the
  updater comparison).
- `app/src-tauri/Cargo.toml` → `version`.
- `CHANGELOG.md`: move the `Unreleased` entries under the new version heading
  with the release date.

## Pre-flight

```powershell
$env:CARGO_TARGET_DIR = "C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target"
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```

Optional local bundle check (produces the same artifacts as CI; requires the
private key because `createUpdaterArtifacts` is enabled):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\mirlo.key"
npx @tauri-apps/cli@^2 build --bundles nsis,msi
# from app/: outputs under <CARGO_TARGET_DIR>\release\bundle\{nsis,msi}
```

## Cut the release

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds the Windows bundles and creates a **draft** release with:

- `Mirlo_0.1.0_x64-setup.exe` (+ `.sig`) — NSIS, per-user (recommended).
- `Mirlo_0.1.0_x64_en-US.msi` (+ `.sig`) — WiX, per-machine.
- `latest.json` — updater manifest (points at the NSIS bundle).
- `SHA256SUMS.txt` — checksums of the installers.

## Verify and publish

1. Download the `.exe` from the draft and install it on a clean-ish machine
   (or the current one after uninstalling): the version, license page,
   language selector, per-user install location
   (`%LOCALAPPDATA%\Programs\Mirlo`) and Start Menu shortcuts should be
   correct.
2. Check the log at `%LOCALAPPDATA%\Mirlo\logs\mirlo.log` contains
   `--- Mirlo <version> starting ---` and `ready:`.
3. Confirm `SHA256SUMS.txt` matches the uploaded installers
   (`Get-FileHash -Algorithm SHA256`).
4. Publish the draft release (this is what makes the updater endpoint live).

## Post-release verification (auto-update)

1. On a machine with the **previous** version installed, wait ~30 s after
   launch (or use tray → *Check for updates…*): the update prompt must appear.
2. Confirm: the installer runs (passive mode), the app restarts and the
   version in the log/settings matches the new release.

## Key rotation (only if compromised or lost)

1. Generate a new keypair; update `plugins.updater.pubkey` in
   `tauri.conf.json`; update the GitHub secret.
2. Note that **existing installations will reject the new signatures** (the
   old versions trust the old public key only). Until they update by hand
   once, ship a transitional release signed with the *old* key if it is still
   available; if it is lost, document a manual re-download for users.

## Security notes

- The private key is a release credential: it lives outside the repository
  (`%USERPROFILE%\.tauri\`) and in GitHub Actions secrets only.
- `docs/research/images/phase-a-idle.png` was redacted (avatar and account
  label) before going public. 2026-10-17: `phase-b-batch1.png` (account
  label + avatar) and `phase-b-lyrics.png` (profile avatar) redacted; all
  five research screenshots passed the privacy pass. Review any new
  screenshot for personal data before attaching it to docs or releases.
