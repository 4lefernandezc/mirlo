# Contributing to Mirlo

Thanks for your interest in making Mirlo better. This guide covers everything
you need to build the project, run checks and submit changes.

## Requirements

- Windows 10/11 (current development target; other platforms are planned).
- Rust stable with the MSVC toolchain ([rustup](https://rustup.rs)).
- MSVC Build Tools (Desktop development with C++).
- WebView2 runtime — preinstalled on modern Windows; otherwise install the
  Evergreen runtime from Microsoft.
- Node.js 22+ (only needed once the Tauri frontend tooling lands in `app/`).

## Getting started

```powershell
git clone https://github.com/<owner>/mirlo
cd mirlo

# Keep build artifacts out of synced folders (recommended)
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"

# Build and run the WebView2 spike
cd poc/webview2-probe
cargo run --release
```

## Checks before you commit

```powershell
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo build --release
```

Run these inside the crate you touched (`poc/webview2-probe`, later `app/src-tauri`).

## Commit conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`.
- One logical change per commit. Update `CHANGELOG.md` under `[Unreleased]`
  for user-visible changes.
- Reference issues when applicable (`fix: ... (#12)`).

## Pull requests

1. Fork the repository and create a topic branch
   (`feat/tray-icon`, `fix/session-persistence`...).
2. Keep PRs focused; large features should land behind disabled-by-default
   flags or in incremental steps.
3. Fill in the PR template, including how you tested the change (steps and,
   when relevant, memory measurements with `tools/measure-memory.ps1`).
4. CI must pass (fmt, clippy, build).

## Porting plugins from pear-desktop

Mirlo ports plugins from [pear-desktop](https://github.com/pear-devs/pear-desktop)
(MIT). When porting:

- Keep the upstream MIT license notice and add a short attribution header to
  the ported file (upstream file path + commit/tag).
- Record the port in `THIRD_PARTY_NOTICES.md`.
- Do not port features that conflict with
  [ADR-0003](docs/adr/0003-tos-posture-and-defaults.md) (stream extraction,
  media downloading, DRM bypass).

## Language

Code, commits and documentation are written in English. Issues and PR
discussions are welcome in English or Spanish.
