//! Ad-block v1 — network-level request blocking on the WebView2 controller.
//!
//! Replaces the renderer-side v0 wrappers as the primary layer on Windows:
//! a `WebResourceRequested` handler is installed on the player webview and
//! matching requests get a synthesized `403 Blocked` response. WebView2 has
//! no "cancel" API, so refusing the request means answering it (the approach
//! used by the official WebView2 samples): `CreateWebResourceResponse` with
//! an empty in-memory stream. The v0 injection wrappers in `bridge.js` stay
//! as the non-Windows / fallback path.
//!
//! Gating: the handler is registered unconditionally at window creation and
//! consults a live `AtomicBool` mirroring `config.adblock` on every request,
//! so toggling the setting in the settings UI applies immediately — a page
//! reload is not even needed (deviation from the original plan, which
//! registered only when enabled at startup; the filter matching is a
//! negligible per-request cost and this avoids window recreation). The flag
//! starts `false`; ad-block ships OFF by default (ADR-0003).
//!
//! Patterns: the conservative host/substring set validated in the Phase 0 PoC
//! (doubleclick.net, googlesyndication, googleadservices, /pagead/,
//! /api/stats/ads, activeview). No allowlist is needed because every pattern
//! targets pure ad/telemetry endpoints, never playback or session traffic.

use std::sync::atomic::{AtomicBool, Ordering};

/// Live mirror of `config.adblock` (updated by `setup` and `set_config`).
static ENABLED: AtomicBool = AtomicBool::new(false);

/// Enables/disables blocking at runtime.
pub fn set_enabled(enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
}

/// Conservative ad-endpoint matcher (case-insensitive substrings, v0 parity).
pub fn is_blocked(url: &str) -> bool {
    let url = url.to_ascii_lowercase();
    const PATTERNS: [&str; 6] = [
        "doubleclick.net",
        "googlesyndication",
        "googleadservices",
        "/pagead/",
        "/api/stats/ads",
        "activeview",
    ];
    PATTERNS.iter().any(|pattern| url.contains(pattern))
}

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::{is_blocked, ENABLED};
    use crate::logging::{log_error, log_info};
    use tauri::WebviewWindow;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Controller, ICoreWebView2Environment,
        ICoreWebView2WebResourceRequestedEventArgs, ICoreWebView2_2,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
    };
    use webview2_com::{take_pwstr, WebResourceRequestedEventHandler};
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::UI::Shell::SHCreateMemStream;

    /// Bounded debug logging: the first few events, then a coarse heartbeat.
    const LOG_FIRST: u64 = 10;
    const LOG_EVERY: u64 = 500;

    static BLOCKED: AtomicU64 = AtomicU64::new(0);
    static ERRORS: AtomicU64 = AtomicU64::new(0);

    /// Registers the network-level handler on a webview. Must be called once,
    /// after the window was built; the closure runs on the UI thread when the
    /// event loop starts.
    pub fn install(window: &WebviewWindow) {
        if let Err(err) = window.with_webview(|platform| {
            if let Err(err) = register(&platform.controller()) {
                log_error!("adblock: could not install v1: {err}");
            }
        }) {
            log_error!("adblock: with_webview failed: {err}");
        }
    }

    fn register(controller: &ICoreWebView2Controller) -> windows::core::Result<()> {
        unsafe {
            let core = controller.CoreWebView2()?;
            let env = core.cast::<ICoreWebView2_2>()?.Environment()?;

            // Intercept every request (all origins, all resource contexts).
            let filter: Vec<u16> = "*\0".encode_utf16().collect();
            core.AddWebResourceRequestedFilter(
                PCWSTR(filter.as_ptr()),
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            )?;

            let mut token = 0i64;
            let handler = WebResourceRequestedEventHandler::create(Box::new(
                move |_sender: Option<ICoreWebView2>,
                      args: Option<ICoreWebView2WebResourceRequestedEventArgs>|
                      -> windows::core::Result<()> {
                    if ENABLED.load(Ordering::Relaxed) {
                        if let Some(args) = args {
                            if let Err(err) = block_if_ad(&env, &args) {
                                log_bounded(&ERRORS, &format!("handler error: {err}"));
                            }
                        }
                    }
                    Ok(())
                },
            ));
            core.add_WebResourceRequested(&handler, &mut token)?;
            Ok(())
        }
    }

    /// Answers matching requests with `403 Blocked` + empty body.
    ///
    /// # Safety
    /// The WebView2 callback context: called on the UI thread from the
    /// `WebResourceRequested` event while the webview is alive.
    unsafe fn block_if_ad(
        env: &ICoreWebView2Environment,
        args: &ICoreWebView2WebResourceRequestedEventArgs,
    ) -> windows::core::Result<()> {
        let request = args.Request()?;
        let mut uri = windows::core::PWSTR::null();
        request.Uri(&mut uri)?;
        let url = take_pwstr(uri);
        if !is_blocked(&url) {
            return Ok(());
        }

        let reason: Vec<u16> = "Blocked\0".encode_utf16().collect();
        let stream = SHCreateMemStream(None);
        let response = env.CreateWebResourceResponse(
            stream.as_ref(),
            403,
            PCWSTR(reason.as_ptr()),
            PCWSTR::null(),
        )?;
        args.SetResponse(&response)?;
        log_bounded(&BLOCKED, &format!("blocked: {}", truncate(&url, 160)));
        Ok(())
    }

    fn truncate(text: &str, max_chars: usize) -> String {
        if text.chars().count() <= max_chars {
            text.to_string()
        } else {
            let mut out: String = text.chars().take(max_chars).collect();
            out.push('…');
            out
        }
    }

    fn log_bounded(counter: &AtomicU64, message: &str) {
        let count = counter.fetch_add(1, Ordering::Relaxed) + 1;
        if count <= LOG_FIRST || count % LOG_EVERY == 0 {
            log_info!("adblock: {message} (n={count})");
        }
    }
}

#[cfg(target_os = "windows")]
pub use platform::install;

#[cfg(not(target_os = "windows"))]
pub fn install(_window: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::is_blocked;

    #[test]
    fn blocks_known_ad_endpoints() {
        assert!(is_blocked(
            "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
        ));
        assert!(is_blocked("https://googleads.g.doubleclick.net/pagead/id"));
        assert!(is_blocked(
            "https://www.googleadservices.com/pagead/conversion/123/?x=1"
        ));
        assert!(is_blocked("https://music.youtube.com/api/stats/ads"));
        assert!(is_blocked("https://example.com/activeview?x=1"));
        assert!(is_blocked("HTTPS://PAGEAD2.GOOGLESYNDICATION.COM/x"));
    }

    #[test]
    fn allows_player_and_session_traffic() {
        assert!(!is_blocked(
            "https://music.youtube.com/youtubei/v1/player?key=x"
        ));
        assert!(!is_blocked(
            "https://rr4---sn-abc.googlevideo.com/videoplayback?expire=1"
        ));
        assert!(!is_blocked("https://www.youtube.com/generate_204"));
        assert!(!is_blocked("https://i.ytimg.com/vi/abc/hqdefault.jpg"));
        assert!(!is_blocked(
            "https://music.youtube.com/active-viewer-report"
        ));
    }
}
