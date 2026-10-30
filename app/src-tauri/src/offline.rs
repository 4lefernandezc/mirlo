//! A local recovery screen for failed main-frame player connections.

use crate::logging::log_error;
use tauri::WebviewWindow;

fn is_player_url(uri: &str) -> bool {
    tauri::Url::parse(uri)
        .is_ok_and(|url| url.scheme() == "https" && url.host_str() == Some("music.youtube.com"))
}

fn show(window: &WebviewWindow) {
    #[cfg(target_os = "windows")]
    let url = "http://tauri.localhost/index.html";
    #[cfg(not(target_os = "windows"))]
    let url = "tauri://localhost/index.html";
    navigate(window, url);
}

fn navigate(window: &WebviewWindow, url: &'static str) {
    let window = window.clone();
    // Native callbacks can hold the runtime's webview lock; queue from outside it.
    std::thread::spawn(move || {
        if let Err(err) = window.navigate(url.parse().expect("static navigation URL")) {
            log_error!("offline: could not navigate: {err}");
        }
    });
}

/// Attach before the first player navigation, including failures during boot.
pub fn install(window: &WebviewWindow) {
    let target = window.clone();
    if let Err(err) = window.with_webview(move |platform| {
        #[cfg(target_os = "linux")]
        {
            use webkit2gtk::{gio, glib, NetworkError, WebViewExt};
            let target = target.clone();
            platform
                .inner()
                .connect_load_failed(move |_, _, uri, error| {
                    let network_failure = error.matches(NetworkError::Transport)
                        || error.matches(NetworkError::Failed)
                        || error.matches(gio::IOErrorEnum::HostNotFound)
                        || error.matches(gio::IOErrorEnum::NetworkUnreachable)
                        || error.matches(gio::IOErrorEnum::ConnectionRefused)
                        || error.matches(gio::IOErrorEnum::TimedOut)
                        || error.matches(gio::ResolverError::NotFound);
                    if !is_player_url(uri) || !network_failure {
                        return false;
                    }
                    log_error!("offline: player connection failed: {error}");
                    let target = target.clone();
                    // Let the failed navigation unwind before starting the local one.
                    glib::idle_add_local_once(move || show(&target));
                    true
                });
        }
        #[cfg(target_os = "windows")]
        if let Err(err) = register_windows(&platform.controller(), target.clone()) {
            log_error!("offline: could not install navigation handler: {err}");
        }
        navigate(&target, crate::PLAYER_URL);
    }) {
        log_error!("offline: with_webview failed: {err}");
    }
}

#[cfg(target_os = "windows")]
fn register_windows(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    window: WebviewWindow,
) -> windows::core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{take_pwstr, NavigationCompletedEventHandler};
    use windows::core::PWSTR;

    unsafe {
        let core = controller.CoreWebView2()?;
        let mut token = 0;
        core.add_NavigationCompleted(
            &NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
                let (Some(sender), Some(args)) = (sender, args) else {
                    return Ok(());
                };
                let mut success = windows::core::BOOL::default();
                args.IsSuccess(&mut success)?;
                if success.as_bool() {
                    return Ok(());
                }
                let mut status = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
                args.WebErrorStatus(&mut status)?;
                // Keep certificate, HTTP and cancelled-navigation failures native.
                if !matches!(
                    status,
                    COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED
                        | COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT
                        | COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED
                        | COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT
                        | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED
                        | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET
                        | COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE
                ) {
                    return Ok(());
                }
                let mut uri = PWSTR::null();
                sender.Source(&mut uri)?;
                if is_player_url(&take_pwstr(uri)) {
                    log_error!("offline: player connection failed: {status:?}");
                    show(&window);
                }
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_player_url;

    #[test]
    fn only_player_navigations_get_the_recovery_screen() {
        assert!(is_player_url("https://music.youtube.com/"));
        assert!(is_player_url("https://music.youtube.com/watch?v=abc"));
        for uri in [
            "http://music.youtube.com/",
            "https://accounts.google.com/",
            "https://music.youtube.com.example.org/",
            "https://example.org/music.youtube.com",
            "tauri://localhost/index.html",
            "about:blank",
            "invalid",
        ] {
            assert!(!is_player_url(uri), "{uri}");
        }
    }
}
