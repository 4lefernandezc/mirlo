# Contributing to Mirlo

## Build and test

Build prerequisites, debug commands and the fast renderer development loop:
[app/README.md](app/README.md).

From the repository root:

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
node --test tools/tests/*.test.mjs
```

Keep build outputs outside synced/source folders. Use a separate
`MIRLO_DATA_DIR` for runtime tests rather than changing a personal player profile.

## Changes

- Follow the existing Rust/JavaScript structure and formatting.
- Add a focused regression test for nontrivial behavior.
- Update user documentation and `[Unreleased]` for user-visible changes.
- Use Conventional Commit messages, such as `fix(settings): preserve edits`.
- Check documentation, logs and captures for credentials, personal information
  and local paths before submitting.
- Report vulnerabilities through [private reporting](SECURITY.md).

## Extensions

An extension registers in `app/src-tauri/plugins/`, with source and Settings
metadata in `src/plugins.rs`. Keep manifest defaults consistent with runtime
defaults. Build UI using DOM APIs, not string HTML; the player enforces Trusted
Types. Use the existing host helpers for configuration, menus and audio access.

New native commands require the invoke handler, `build.rs` registration and
the appropriate capability. Do not grant a remote page a command intended
only for local Settings. See [architecture](docs/architecture.md).

## Attribution and scope

Keep upstream copyright/license headers and list adapted code in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Mirlo uses the official player:
no stream extraction, media downloading or DRM bypass. See
[terms and scope](docs/user/terms.md).
