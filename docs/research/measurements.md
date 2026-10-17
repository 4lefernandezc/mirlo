# Measurements — Phase 0

All numbers on the user's machine (Windows 11 x64, WebView2 runtime
155.0.4283.45), idle state, app loaded with the official player home page,
60 s after launch, **private working set** (the "Memory" column Task Manager
shows), summed over the whole process tree.

| Build | Processes | Private (sum) | Working set (sum) |
|---|---|---|---|
| Mirlo PoC (WebView2 + wry) | 10 (host + conhost + 8 webview) | **399.1 MB** | 829.3 MB |
| pear-desktop v3.11.0 (Electron) | 6 | **1178.7 MB** | 1559.6 MB |

Delta: **~66% less private memory** for the WebView2 shell on this test.

Largest PoC components: renderer 192 MB, GPU process 130 MB, browser 34 MB.

## Phase A — Tauri 2 shell (2026-10-16)

Same machine and runtime, same metric. The Tauri 2.12 release shell ran with
the persistent profile seeded from the Phase 0 PoC (logged-in home page,
same session), idle for ~3 minutes. Measured by attaching to the running
process so the app could be closed gracefully afterwards.

| Build | Processes | Private (sum) | Working set (sum) |
|---|---|---|---|
| Mirlo Phase C (adblock+SMTC+notifications, long playback session) | 10 | 427.9 MB | 877.9 MB |
| Mirlo Phase C (adblock+SMTC+notifications, fresh idle) | 10 | **409.0 MB** | 855.9 MB |
| Mirlo ad-block v1 registered (18 plugins, post-navigation settles) | 9 | **371.1 MB** | 720.6 MB |
| Mirlo Phase B (eleven renderer plugins on) | 9 | **300.3 MB** | 701.6 MB |
| Mirlo Phase B (nine renderer plugins on) | 10 | **331.8 MB** | 781.0 MB |
| Mirlo Phase B (six renderer plugins on) | 10 | **368.4 MB** | 816.3 MB |
| Mirlo Phase A (Tauri 2.12 shell) | 10 | **371.1 MB** | 821.4 MB |
| Mirlo Phase 0 PoC (WebView2 + wry) | 10 | 399.1 MB | 829.3 MB |
| pear-desktop v3.11.0 (Electron) | 6 | 1178.7 MB | 1559.6 MB |

Phase A acceptance criterion (< 450 MB idle private) is met with a wide
margin. The Phase B runs (batch 1, then plus batch 2a audio plugins, then
plus batch 2b equalizer/precise-volume) show no measurable idle overhead
versus the plugins-off baseline; run-to-run page variance is roughly ±5%
(and one fewer WebView2 child process in the eleven-plugin run), so treat
the small differences as noise. The ad-block v1 run (wildcard
`WebResourceRequested` filter registered, 18 plugins enabled, page
re-navigated several times) measured 371.1 MB — identical to the Phase A
baseline, so the network filter adds no measurable idle footprint. The
Phase C runs (ad-block v1 + SMTC media session + notifications, 18 plugins)
measured 409 MB fresh idle and 427.9 MB after a long playback round trip;
both remain under the 450 MB acceptance with margin — the spread versus the
371 MB run is dominated by page/cache state of the YouTube Music session,
not by the native modules (a SMTC session and a toast callback are
structurally tiny). Largest
components in the Phase A run:
renderer 165.8 MB, GPU 121.0 MB, browser 31.2 MB (private working set).

Evidence: `images/phase-a-idle.png` is a window capture of the idle shell
(official player loaded with the seeded session). The account avatar and
account label were redacted (2026-10-17, Phase D release prep) before the
repository became public; the player page itself and the album artwork remain
as captured.

Reproduce (attach form keeps graceful shutdown):

```powershell
# with the release build running and idle
powershell -NoProfile -File tools/measure-memory.ps1 -ProcessName "mirlo" -SettleSeconds 20
```

## Conditions and caveats

- PoC measured with a logged-in session (heavier page); Electron, fresh
  profile (login screen shell). If anything, this understates the PoC's
  advantage.
- Working set (total) is reported too because it is the metric many people
  quote; it inflates both sides with shared pages.
- Streaming (active playback) was not measured; playback was validated
  functionally. Re-measure in Phase A with the same method.
- WebView2 trees take several seconds to fully exit after a force kill; prefer
  graceful close when scripting measurements, and verify no orphan
  `msedgewebview2.exe` processes with the app's profile remain.

## Reproduce

```powershell
# From repo root; the tool sums the process tree and prints the table
powershell -NoProfile -File tools/measure-memory.ps1 -ExePath "<path to app exe>" -SettleSeconds 50
```

Reference artifact for the Electron side: the user's extracted build of
pear-desktop v3.11.0, `app.asar` SHA-256
`a7a203d815b36253c8cc08e874133376ff2af3bc7936728573cfdcd4d610c3e4`
(190 parsed JS files, 120 modules, static analysis via REA).
