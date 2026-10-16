# AGENTS.md — Mirlo

Handoff file for AI coding agents (opencode). **Read this first when resuming
work in a new session.** Project state must live in this file and `docs/`, not
in chat history.

## What this project is

Mirlo: a lightweight, open-source desktop client for YouTube Music. It wraps
the **official YouTube Music web player** in a WebView2/Tauri shell (no bundled
browser runtime, no Node in the product). Long-term goal: broad feature parity
with pear-desktop's plugin model, at a fraction of its memory/CPU footprint.

## How the user works (important)

- The user speaks **Spanish**; reply in Spanish.
- **Autonomy granted**: proceed without asking, EXCEPT for critical decisions:
  1. Publishing/pushing to public remotes or anything touching the GitHub account.
  2. Spending money or creating accounts/services.
  3. Destructive changes outside the repository.
  4. Legal/marketing/name/license decisions.
- Keep long work product in the repo (this file + `docs/`), so context limits
  never lose state. At the end of every milestone: update "Current state" here,
  update `CHANGELOG.md`, and commit.
- If context runs out mid-task: commit WIP with a clear message and add a
  "Resume notes" bullet here before finishing.

## Current state (2026-10-16)

- **Phase 0 — DONE**: research + validated PoC.
  - `poc/webview2-probe/` builds and runs (Rust + wry + WebView2).
  - Validated: Premium playback on WebView2 (no DRM problem), ad-blocking via
    init-script injection (blocked real doubleclick requests live), global
    hotkeys (Ctrl+Alt+Space/Left/Right) controlling the player.
  - Measured (idle, logged-in home, private working set — Task Manager metric):
    **PoC ≈ 399 MB vs Electron v3.11.0 ≈ 1179 MB**. Details:
    `docs/research/measurements.md`.
- **Phase A — NOT STARTED**: Tauri 2 application scaffold (`app/`).
- Machine facts: Windows 11 x64; Rust 1.99.1 (MSVC) installed; VS 2019 Build
  Tools present; WebView2 runtime 155 present; Node 24 present; npm available.
- Build artifacts must NOT go into OneDrive: always set
  `CARGO_TARGET_DIR=C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target`
  (or any temp dir) before cargo commands.

## Next step — Phase A (Tauri 2 base)

Goal: `app/` with a Tauri 2 (Rust) shell that reaches PoC parity and adds the
settings foundation. Suggested acceptance criteria:

1. Window loads `https://music.youtube.com/` with a persistent WebView2 profile
   (session survives restarts), same as the PoC.
2. Injected bridge script implementing the inherited `ytmd:*` contract subset
   needed for MVP (get/set-config, player state events, reload/restart).
   Contract source: `docs/research/ipc-contract.md`.
3. Ad-block v0: port the PoC injection blocking. v1 (network-level
   `WebResourceRequested`) is a stretch goal for this phase.
4. Global hotkeys and single-instance behavior.
5. Docs updated + `CHANGELOG.md` entry + screenshot of memory usage.
6. Re-measure memory with `tools/measure-memory.ps1` and record in
   `docs/research/measurements.md`.

Notes/traps discovered so far:

- wry 0.53 API: use `WebViewBuilder::new_with_web_context(&mut ctx)`;
  `with_ipc_handler` receives `Request<String>`.
- `WebContext::new(Some(profile_dir))` gives session persistence on Windows.
- Force-killing the host leaves WebView2 trees shutting down slowly; always
  verify with a process-tree walk, and prefer graceful close.
- Google login works in WebView2 (no Electron UA blocking observed), but keep
  the default Edge UA; re-test login after any UA or profile change.

## Critical facts and guardrails

- Remote: `https://github.com/4lefernandezc/mirlo` — **private until the first
  release**; the owner will make it public then. Never change repository
  visibility without explicit owner approval. Push uses the owner's stored git
  credentials (no gh CLI installed).
- Reference app: pear-desktop v3.11.0 (ex th-ch/youtube-music), MIT. We MAY
  reuse its plugin code with attribution (add notices to
  `THIRD_PARTY_NOTICES.md` when porting). The user's local copy of the built
  exe lives at
  `C:\Users\luigi\OneDrive\Documentos\yt music nativo\example project\YouTube Music.exe`
  — **never modify or delete it**.
- Extracted analysis working copies (re-creatable): app sources at
  `%TEMP%\opencode\ytm311\` (app dir with `resources/app.asar`, upstream source
  tag v3.11.0 in `src\pear-desktop-3.11.0`).
- ToS posture (ADR-0003): wrapper of the official player only. NO stream
  extraction / InnerTube playback. Downloader plugin is excluded. Ad-block
  ships OFF by default. No "YouTube" in branding; disclaimers kept.
- Never commit secrets. Never commit build artifacts. `.gitignore` covers the
  basics; target al temp dir.

## Repository layout

```
app/                        Tauri 2 application (Phase A; not yet created)
docs/
  architecture.md           Target architecture
  roadmap.md                Phases and status
  adr/                      Architecture decision records
  research/                 Evidence from Phase 0 (plugin inventory, IPC contract,
                            measurements, PoC validation)
poc/webview2-probe/         Validated Rust + wry spike (seed for Phase A)
tools/measure-memory.ps1    RAM measurement helper (process tree, private WS)
```

## Commands

```powershell
# Build the PoC (from repo root)
$env:CARGO_TARGET_DIR = "C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target"
cargo build --release --manifest-path poc/webview2-probe/Cargo.toml

# Run the PoC
cargo run --release --manifest-path poc/webview2-probe/Cargo.toml

# Measure memory of a running exe's process tree (private working set)
powershell -NoProfile -File tools/measure-memory.ps1 -ExePath "C:\path\to.exe"

# Git
git status
git add -A; git commit -m "type(scope): message"
```

## Guidelines

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`...).
- Rust: `cargo fmt` and `cargo clippy` clean before commit.
- When porting pear-desktop code: keep upstream comments, adjust imports, add
  attribution header, and log it in `THIRD_PARTY_NOTICES.md`.
- Prefer small, reviewable commits; update docs in the same commit as the code
  they describe.
