//! Auto-update (Tauri updater + signed GitHub releases).
//!
//! The shell checks the release manifest on startup (silently, honoring the
//! `update_check` config flag) and on demand from the tray. When a newer
//! version is published, the bundle is downloaded, verified against the
//! public key in `tauri.conf.json` and executed (passive NSIS mode) before
//! the app restarts. While the GitHub repository is not public yet the check
//! simply fails with a 404 and is logged.

use std::time::Duration;

use crate::logging::{log_error, log_info};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

/// Lets the first page load settle before competing for bandwidth.
const STARTUP_DELAY: Duration = Duration::from_secs(30);

/// Silent startup check (only prompts when an update is actually available).
pub fn check_on_startup(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_DELAY);
        tauri::async_runtime::spawn(check(app, false));
    });
}

/// Tray-triggered check: always reports the outcome.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(check(app, true));
}

async fn check(app: AppHandle, interactive: bool) {
    if let Err(err) = run(&app, interactive).await {
        log_error!("update check failed: {err}");
        if interactive {
            prompt_info(
                &app,
                &format!("Could not check for updates:\n\n{err}"),
                "Mirlo update",
            );
        }
    }
}

async fn run(
    app: &AppHandle,
    interactive: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let current = app.package_info().version.clone();
    let Some(update) = app.updater()?.check().await? else {
        log_info!("update check: {current} is up to date");
        if interactive {
            prompt_info(
                app,
                &format!("Mirlo {current} is the latest version."),
                "Mirlo update",
            );
        }
        return Ok(());
    };

    log_info!("update available: {} (current {current})", update.version);
    let prompt = format!(
        "Mirlo {} is available (you have {current}).\n\nDownload and install it now? The app will restart.",
        update.version
    );
    if !prompt_confirm(app, &prompt, "Mirlo update") {
        return Ok(());
    }

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await?;
    log_info!("update {} installed; restarting", update.version);
    app.restart();
}

#[cfg(target_os = "windows")]
fn main_hwnd(app: &AppHandle) -> Option<windows::Win32::Foundation::HWND> {
    app.get_webview_window(crate::MAIN_WINDOW)
        .and_then(|window| window.hwnd().ok())
}

#[cfg(target_os = "windows")]
fn prompt_confirm(app: &AppHandle, text: &str, title: &str) -> bool {
    crate::dialog::confirm(main_hwnd(app), text, title)
}

#[cfg(target_os = "windows")]
fn prompt_info(app: &AppHandle, text: &str, title: &str) {
    crate::dialog::info(main_hwnd(app), text, title);
}

#[cfg(not(target_os = "windows"))]
fn prompt_confirm(_app: &AppHandle, text: &str, title: &str) -> bool {
    log_info!("{title}: {text} (declined: no native dialogs on this platform)");
    false
}

#[cfg(not(target_os = "windows"))]
fn prompt_info(_app: &AppHandle, text: &str, title: &str) {
    log_info!("{title}: {text}");
}
