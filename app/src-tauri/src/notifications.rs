//! Windows toast notifications on track change — Phase C.
//!
//! Shows a toast with the track title + artist (and the artwork when a video
//! id is available) when `video-src-changed` reports a **new** track. The
//! shell calls this only while the `notifications` config flag is on and the
//! player window is **not focused** (no toast noise while the user is looking
//! at the app — the SMTC flyout already covers that case).
//!
//! Deduplication: the bridge re-emits `video-src-changed` for the same track
//! (emptied/loadedmetadata/rescan), so toasts are keyed by video id (or
//! title) and only fire on an actual change. The first track observed after
//! launch never toasts (the previous session's queue usually reports before
//! the user did anything — a startup toast would be noise).
//!
//! Mechanism: native WinRT toasts through the `windows` crate (no new
//! dependencies). Unpackaged Win32 apps need an AppUserModelID registered for
//! toasts to work, so on first use `HKCU\Software\Classes\AppUserModelId\
//! Mirlo` is created with `DisplayName` + `IconUri` (the well-known registry
//! registration for unpackaged apps; a Start Menu shortcut is not required).
//!
//! Note (environment): `Show()` succeeds even when the user disabled Windows
//! notifications — the OS drops the toast silently (no banner, no history).
//! `ToastNotifier.Setting()` reports that state (`DisabledForUser = 2`) and
//! this module logs it once per run so the situation is diagnosable.
//!
//! Windows-only; the renderer never calls this directly.

/// Notifies about the track reported by a `video-src-changed` payload.
///
/// The track bookkeeping (dedup) always runs so a focused change still
/// advances "last track"; `allow_toast` is the shell's policy decision
/// (flag enabled and the player window not focused).
pub fn on_track_change(data: &serde_json::Value, allow_toast: bool) {
    platform::on_track_change(data, allow_toast);
}

/// XML-escapes a string for toast text/attributes.
fn xml_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            other => out.push(other),
        }
    }
    out
}

/// Builds the ToastGeneric XML for a track.
fn toast_xml(title: &str, artist: &str, artwork: Option<&str>) -> String {
    let mut xml = String::from("<toast><visual><binding template=\"ToastGeneric\">");
    xml.push_str(&format!(
        "<text>{}</text><text>{}</text>",
        xml_escape(title),
        xml_escape(artist)
    ));
    if let Some(artwork) = artwork {
        xml.push_str(&format!(
            "<image placement=\"appLogoOverride\" hint-crop=\"circle\" src=\"{}\"/>",
            xml_escape(artwork)
        ));
    }
    xml.push_str("</binding></visual></toast>");
    xml
}

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    use serde_json::Value;
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows::UI::Notifications::{
        NotificationSetting, ToastNotification, ToastNotificationManager,
    };

    use super::toast_xml;
    use crate::logging::{log_error, log_info};
    use crate::media_controls::{artwork_id, split_byline};

    /// AppUserModelID used for toasts (also the registry subkey name).
    const AUMID: &str = "Mirlo";
    const REG_SUBKEY: &str = "Software\\Classes\\AppUserModelId\\Mirlo";

    const LOG_FIRST: u64 = 10;
    const LOG_EVERY: u64 = 500;
    static ERRORS: AtomicU64 = AtomicU64::new(0);
    static SHOWN: AtomicU64 = AtomicU64::new(0);

    static REGISTERED: AtomicBool = AtomicBool::new(false);
    static SETTING_LOGGED: AtomicBool = AtomicBool::new(false);

    /// Title of the last observed track: `None` until the first report of
    /// this run, which is remembered but not toasted. The title is the dedup
    /// key because the same track's reports can differ in URL shape (watch
    /// URL with `v=`, home URL without) and would otherwise read as changes.
    static LAST_TRACK: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

    pub fn on_track_change(data: &Value, allow_toast: bool) {
        let title = data.get("title").and_then(Value::as_str).unwrap_or("");
        if title.is_empty() {
            return;
        }
        match LAST_TRACK.lock() {
            Ok(mut last) => {
                if last.as_deref() == Some(title) {
                    return; // same track re-reported (emptied/loadedmetadata)
                }
                let first_of_run = last.is_none();
                *last = Some(title.to_string());
                if first_of_run {
                    return; // still the queue from the previous session
                }
            }
            Err(_) => return,
        }
        if !allow_toast {
            return;
        }

        let byline = data.get("artist").and_then(Value::as_str).unwrap_or("");
        let artist = split_byline(byline).0;
        let artwork =
            artwork_id(data).map(|id| format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"));
        match show(title, &artist, artwork.as_deref()) {
            Ok(()) => {
                let count = SHOWN.fetch_add(1, Ordering::Relaxed) + 1;
                if count <= LOG_FIRST || count % LOG_EVERY == 0 {
                    log_info!("notifications: toast: {title} (n={count})");
                }
            }
            Err(err) => {
                let count = ERRORS.fetch_add(1, Ordering::Relaxed) + 1;
                if count <= LOG_FIRST || count % LOG_EVERY == 0 {
                    log_error!("notifications: could not show toast: {err} (n={count})");
                }
            }
        }
    }

    fn show(title: &str, artist: &str, artwork: Option<&str>) -> windows::core::Result<()> {
        if !ensure_registered() {
            return Ok(()); // registration failed once; logged there
        }
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };

        let doc = XmlDocument::new()?;
        doc.LoadXml(&HSTRING::from(toast_xml(title, artist, artwork)))?;
        let toast = ToastNotification::CreateToastNotification(&doc)?;
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID))?;
        if !SETTING_LOGGED.swap(true, Ordering::Relaxed) {
            if let Ok(setting) = notifier.Setting() {
                if setting != NotificationSetting::Enabled {
                    log_info!(
                        "notifications: Windows notifications are disabled for \
                         this user (setting={}); toasts will not be visible",
                        setting.0
                    );
                }
            }
        }
        notifier.Show(&toast)
    }

    /// Registers the AUMID in HKCU once per run (idempotent).
    fn ensure_registered() -> bool {
        if REGISTERED.load(Ordering::Relaxed) {
            return true;
        }
        let exe = std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ok = register(&exe);
        if ok {
            REGISTERED.store(true, Ordering::Relaxed);
        }
        ok
    }

    fn register(exe: &str) -> bool {
        let subkey: Vec<u16> = REG_SUBKEY
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut key = HKEY::default();
        let err = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                windows::core::PCWSTR(subkey.as_ptr()),
                None,
                windows::core::PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                None,
                &mut key,
                None,
            )
        };
        if err != ERROR_SUCCESS {
            log_error!("notifications: could not create the AUMID key: {err:?}");
            return false;
        }
        let ok = set_sz(key, "DisplayName", "Mirlo") && set_sz(key, "IconUri", exe);
        unsafe {
            let _ = RegCloseKey(key);
        }
        ok
    }

    fn set_sz(key: HKEY, name: &str, value: &str) -> bool {
        let name_w: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let data_w: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes =
            unsafe { std::slice::from_raw_parts(data_w.as_ptr().cast::<u8>(), data_w.len() * 2) };
        let err = unsafe {
            RegSetValueExW(
                key,
                windows::core::PCWSTR(name_w.as_ptr()),
                None,
                REG_SZ,
                Some(bytes),
            )
        };
        if err != ERROR_SUCCESS {
            log_error!("notifications: could not write {name}: {err:?}");
            return false;
        }
        true
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn on_track_change(_data: &serde_json::Value, _allow_toast: bool) {}
}

#[cfg(test)]
mod tests {
    use super::{toast_xml, xml_escape};

    #[test]
    fn escapes_xml_specials() {
        assert_eq!(
            xml_escape("AC/DC & <friends> \"quoted\" 'x'"),
            "AC/DC &amp; &lt;friends&gt; &quot;quoted&quot; &apos;x&apos;"
        );
    }

    #[test]
    fn builds_generic_toast() {
        let xml = toast_xml(
            "Title",
            "Artist",
            Some("https://i.ytimg.com/vi/x/mqdefault.jpg"),
        );
        assert!(xml.contains("<text>Title</text>"));
        assert!(xml.contains("<text>Artist</text>"));
        assert!(xml.contains("appLogoOverride"));
        assert!(xml.contains("mqdefault.jpg"));
        let xml = toast_xml("T", "A", None);
        assert!(!xml.contains("<image"));
    }
}
