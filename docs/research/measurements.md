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
