# Installing Mirlo

Mirlo is a lightweight desktop client for YouTube Music. It wraps the official
web player with your own signed-in session — nothing is downloaded or
extracted from the service (see [terms and scope](terms.md)).

## Requirements

- Windows 10 or Windows 11 (x64).
- Microsoft Edge WebView2 Runtime — preinstalled on current Windows versions.
  If it is missing, the Mirlo installer downloads and installs it
  automatically (the machine needs internet access for that step).

## Download

Installers are published on the GitHub Releases page
(`https://github.com/4lefernandezc/mirlo/releases`):

| File | Use case |
| --- | --- |
| `Mirlo_<version>_x64-setup.exe` (NSIS) | **Recommended.** Per-user install, no administrator rights required. |
| `Mirlo_<version>_x64_en-US.msi` | Managed/enterprise deployments (per-machine, requires an administrator). |
| `SHA256SUMS.txt` | Checksums to verify your download. |

### Verify the download (optional but recommended)

In PowerShell, compare the file hash with the one in `SHA256SUMS.txt`:

```powershell
Get-FileHash .\Mirlo_0.1.0_x64-setup.exe -Algorithm SHA256
```

## Install

1. Run the installer you downloaded. The NSIS installer asks for a language
   (English/Spanish) and shows the MIT license.
2. Windows SmartScreen may warn because the binaries are not code-signed yet:
   choose **More info** → **Run anyway**.
3. The per-user installer places the program in
   `%LOCALAPPDATA%\Programs\Mirlo` and creates Start Menu shortcuts. No
   administrator rights are needed.

## First run

- The player opens on `music.youtube.com`. Sign in with your Google account;
  the session is stored locally in Mirlo's private WebView2 profile and
  survives restarts.
- Open **Settings** from the tray icon menu (right-click → *Settings…*) to
  toggle plugins, ad-block, notifications, hotkeys and automatic updates.
  Changes apply immediately or with the *Reload player* button; a few
  settings (global hotkeys) need an app restart.

## Where Mirlo keeps its data

Everything app-owned lives under `%LOCALAPPDATA%\Mirlo`:

| Path | Content |
| --- | --- |
| `config.json` | Your settings (editable by hand while the app is closed). |
| `webview2-profile\` | The persistent browser profile (Google session, caches). |
| `window-state.json` | Window size/position restored on the next launch. |
| `logs\mirlo.log` | Diagnostic log (rotated; the previous file is kept as `mirlo.log.old`). |

## Updates

Mirlo checks for updates silently at startup (can be disabled in Settings →
*Check for updates on startup*) and on demand from the tray menu
(*Check for updates…*). Updates are downloaded from this repository's
releases, verified against the bundled public key, and installed only after
you confirm a prompt; the app then restarts.

## Uninstall

Use **Settings → Apps → Installed apps → Mirlo → Uninstall** (or run
`uninstall.exe` from the install directory).

Uninstalling removes the program; **your data and session are kept** in
`%LOCALAPPDATA%\Mirlo`. To wipe everything, delete that folder after
uninstalling.
