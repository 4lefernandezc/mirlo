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
| `Mirlo_<version>_portable_x64.zip` | Portable: no installation; extract and run (see below). |
| `SHA256SUMS.txt` | Checksums to verify your download. |

### Verify the download (optional but recommended)

In PowerShell, compare the file hash with the one in `SHA256SUMS.txt`:

```powershell
Get-FileHash .\Mirlo_0.1.1_x64-setup.exe -Algorithm SHA256
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

## Portable (no installation)

The portable ZIP (`Mirlo_<version>_portable_x64.zip`) needs no installer:

1. Extract the ZIP into any writable folder (a local folder, a USB drive…).
2. Run `mirlo.exe` from that folder.

Everything app-owned is stored inside a `data\` folder created next to the
executable (config, logs, window state and the browser profile with your
Google session) — nothing is written to `%LOCALAPPDATA%`. Moving or deleting
the extracted folder moves or deletes the whole copy, including your session.

- Windows SmartScreen may warn because the binaries are not code-signed yet:
  choose **More info** → **Run anyway** (same as the installer).
- Updates are **manual** for portable copies: Mirlo still checks for new
  versions and tells you when one exists, but it does not run the installer.
  Download the new ZIP from the releases page and replace `mirlo.exe`,
  keeping your `data\` folder.
- Verify the ZIP the same way as the installers:
  `Get-FileHash .\Mirlo_0.1.1_portable_x64.zip -Algorithm SHA256` and compare
  with `SHA256SUMS.txt`.

## Where Mirlo keeps its data

For installed copies everything app-owned lives under `%LOCALAPPDATA%\Mirlo`
(portable copies keep the same layout under `data\` next to `mirlo.exe`):

| Path | Content |
| --- | --- |
| `config.json` | Your settings (editable by hand while the app is closed). |
| `webview2-profile\` | The persistent browser profile (Google session, caches). |
| `window-state.json` | Window size/position restored on the next launch. |
| `logs\mirlo.log` | Diagnostic log (rotated; the previous file is kept as `mirlo.log.old`). |

## Updates

Mirlo checks for updates silently at startup (can be disabled in Settings →
*Check for updates on startup*) and on demand from the tray menu
(*Check for updates…*). Installed copies download the signed installer from
this repository's releases, verify it against the bundled public key, and
install it only after you confirm a prompt; the app then restarts. Portable
copies are updated by hand (see *Portable* above).

## Uninstall

Use **Settings → Apps → Installed apps → Mirlo → Uninstall** (or run
`uninstall.exe` from the install directory).

Uninstalling removes the program; **your data and session are kept** in
`%LOCALAPPDATA%\Mirlo`. To wipe everything, delete that folder after
uninstalling. (Portable copies have no uninstaller: just delete the extracted
folder.)
