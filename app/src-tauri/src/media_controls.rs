//! Windows System Media Transport Controls (SMTC) integration — Phase C.
//!
//! Creates a Windows media session for the player window so the taskbar media
//! flyout, the lock screen and the hardware media keys control YouTube Music:
//!
//! - The session is created for the main window HWND (`GetForWindow`) right
//!   after the window is built; play/pause/next/previous are enabled.
//! - Button presses (media keys) and flyout seeks are forwarded to the page
//!   through `window.__mirlo.player` — the same API the global hotkeys use.
//! - `report_player_state` events drive the session: playback status,
//!   metadata (title/artist/album + thumbnail from the videoId) and the
//!   timeline position.
//!
//! Windows-only; the non-Windows stubs keep the shell platform-neutral.

/// Called once, after the player window is built.
pub fn init(window: &tauri::WebviewWindow, app: tauri::AppHandle) {
    platform::init(window, app);
}

/// Drives the media session from the renderer-reported player state.
pub fn on_player_state(kind: &str, data: &serde_json::Value) {
    platform::on_player_state(kind, data);
}

/// Splits the player bar byline (`"Artist • Album • Year"`) into artist and
/// album. The tooltip has three segments when the track has an album; with
/// two segments (`"Artist • Year"`) the second is not an album.
pub(crate) fn split_byline(byline: &str) -> (String, Option<String>) {
    let parts: Vec<&str> = byline.split(" • ").map(str::trim).collect();
    let artist = parts.first().copied().unwrap_or("").to_string();
    let album = if parts.len() >= 3 && !parts[1].is_empty() {
        Some(parts[1].to_string())
    } else {
        None
    };
    (artist, album)
}

/// Extracts the `v=` video id from a YouTube Music URL.
pub(crate) fn video_id(url: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        pair.strip_prefix("v=")
            .filter(|id| !id.is_empty())
            .map(str::to_string)
    })
}

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::OnceLock;

    use serde_json::Value;
    use tauri::AppHandle;
    use windows::core::{factory, HSTRING};
    use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsDisplayUpdater, SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Storage::Streams::RandomAccessStreamReference;
    use windows::Win32::System::WinRT::{
        ISystemMediaTransportControlsInterop, RoInitialize, RO_INIT_MULTITHREADED,
    };

    use super::{split_byline, video_id};

    /// Bounded debug logging for update errors (they should be rare).
    const LOG_FIRST: u64 = 10;
    const LOG_EVERY: u64 = 500;
    static ERRORS: AtomicU64 = AtomicU64::new(0);

    struct Session {
        controls: SystemMediaTransportControls,
        updater: SystemMediaTransportControlsDisplayUpdater,
        timeline: SystemMediaTransportControlsTimelineProperties,
    }

    static SESSION: OnceLock<Session> = OnceLock::new();

    pub fn init(window: &tauri::WebviewWindow, app: AppHandle) {
        let hwnd = match window.hwnd() {
            Ok(hwnd) => hwnd,
            Err(err) => {
                eprintln!("[mirlo] smtc: no window handle: {err}");
                return;
            }
        };
        if let Err(err) = create(hwnd, app) {
            eprintln!("[mirlo] smtc: could not create the media session: {err}");
        }
    }

    fn create(hwnd: windows::Win32::Foundation::HWND, app: AppHandle) -> windows::core::Result<()> {
        // WinRT activation needs an initialized apartment on this thread;
        // "already initialized" outcomes (S_FALSE / RPC_E_CHANGED_MODE) are
        // fine — tao already initializes OLE on the main thread.
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };

        let interop: ISystemMediaTransportControlsInterop =
            factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };

        controls.SetIsEnabled(true)?;
        controls.SetIsPlayEnabled(true)?;
        controls.SetIsPauseEnabled(true)?;
        controls.SetIsNextEnabled(true)?;
        controls.SetIsPreviousEnabled(true)?;

        let updater = controls.DisplayUpdater()?;
        updater.SetType(MediaPlaybackType::Music)?;

        // Hardware media keys and flyout buttons -> page.
        let button_app = app.clone();
        let button_handler = TypedEventHandler::<
            SystemMediaTransportControls,
            SystemMediaTransportControlsButtonPressedEventArgs,
        >::new(move |_sender, args| {
            if let Some(args) = args.as_ref() {
                let button = args.Button()?;
                let call = if button == SystemMediaTransportControlsButton::Play {
                    Some("play()")
                } else if button == SystemMediaTransportControlsButton::Pause {
                    Some("pause()")
                } else if button == SystemMediaTransportControlsButton::Next {
                    Some("next()")
                } else if button == SystemMediaTransportControlsButton::Previous {
                    Some("previous()")
                } else {
                    None
                };
                if let Some(call) = call {
                    crate::eval_in_player(
                        &button_app,
                        &format!("window.__mirlo && window.__mirlo.player.{call}"),
                    );
                }
            }
            Ok(())
        });
        controls.ButtonPressed(&button_handler)?;

        // Flyout seek bar -> page (the YT player API clamps and seeks ahead).
        let seek_app = app.clone();
        let seek_handler = TypedEventHandler::<
            SystemMediaTransportControls,
            PlaybackPositionChangeRequestedEventArgs,
        >::new(move |_sender, args| {
            if let Some(args) = args.as_ref() {
                let seconds = args.RequestedPlaybackPosition()?.Duration as f64 / 10_000_000.0;
                crate::eval_in_player(
                    &seek_app,
                    &format!("window.__mirlo && window.__mirlo.player.seek({seconds:.1})"),
                );
            }
            Ok(())
        });
        controls.PlaybackPositionChangeRequested(&seek_handler)?;

        let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
        let _ = SESSION.set(Session {
            controls,
            updater,
            timeline,
        });
        println!("[mirlo] smtc: media session created");
        Ok(())
    }

    pub fn on_player_state(kind: &str, data: &Value) {
        let Some(session) = SESSION.get() else {
            return;
        };
        if let Err(err) = update(session, kind, data) {
            let count = ERRORS.fetch_add(1, Ordering::Relaxed) + 1;
            if count <= LOG_FIRST || count % LOG_EVERY == 0 {
                eprintln!("[mirlo] smtc: update failed: {err} (n={count})");
            }
        }
    }

    fn update(session: &Session, kind: &str, data: &Value) -> windows::core::Result<()> {
        match kind {
            "play-or-paused" | "video-src-changed" => {
                if let Some(paused) = data.get("paused").and_then(Value::as_bool) {
                    session.controls.SetPlaybackStatus(if paused {
                        MediaPlaybackStatus::Paused
                    } else {
                        MediaPlaybackStatus::Playing
                    })?;
                }
                if kind == "video-src-changed" {
                    update_metadata(session, data)?;
                }
                update_timeline(session, data)?;
            }
            "time-changed" | "seeked" => update_timeline(session, data)?,
            _ => {}
        }
        Ok(())
    }

    fn update_metadata(session: &Session, data: &Value) -> windows::core::Result<()> {
        let props = session.updater.MusicProperties()?;
        let title = data.get("title").and_then(Value::as_str).unwrap_or("");
        props.SetTitle(&HSTRING::from(title))?;
        let byline = data.get("artist").and_then(Value::as_str).unwrap_or("");
        let (artist, album) = split_byline(byline);
        props.SetArtist(&HSTRING::from(artist))?;
        if let Some(album) = album {
            props.SetAlbumTitle(&HSTRING::from(album))?;
        }

        if let Some(id) = data.get("url").and_then(Value::as_str).and_then(video_id) {
            let art = HSTRING::from(format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"));
            let uri = Uri::CreateUri(&art)?;
            let thumbnail = RandomAccessStreamReference::CreateFromUri(&uri)?;
            session.updater.SetThumbnail(&thumbnail)?;
        }
        session.updater.Update()
    }

    fn update_timeline(session: &Session, data: &Value) -> windows::core::Result<()> {
        let position = data.get("time").and_then(Value::as_f64).unwrap_or(0.0);
        let duration = data.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
        let timeline = &session.timeline;
        timeline.SetStartTime(TimeSpan { Duration: 0 })?;
        timeline.SetMinSeekTime(TimeSpan { Duration: 0 })?;
        timeline.SetPosition(to_timespan(position))?;
        if duration > 0.0 {
            timeline.SetEndTime(to_timespan(duration))?;
            timeline.SetMaxSeekTime(to_timespan(duration))?;
        }
        session.controls.UpdateTimelineProperties(timeline)
    }

    /// Seconds -> `TimeSpan` (100-nanosecond units).
    fn to_timespan(seconds: f64) -> TimeSpan {
        TimeSpan {
            Duration: (seconds * 10_000_000.0) as i64,
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn init(_window: &tauri::WebviewWindow, _app: tauri::AppHandle) {}

    pub fn on_player_state(_kind: &str, _data: &serde_json::Value) {}
}

#[cfg(test)]
mod tests {
    use super::{split_byline, video_id};

    #[test]
    fn splits_artist_album_year() {
        assert_eq!(
            split_byline("Apartment • The Dreamer Evasive • 2007"),
            (
                "Apartment".to_string(),
                Some("The Dreamer Evasive".to_string())
            )
        );
        assert_eq!(split_byline("Radiohead"), ("Radiohead".to_string(), None));
        assert_eq!(
            split_byline("Radiohead • 1997"),
            ("Radiohead".to_string(), None)
        );
    }

    #[test]
    fn extracts_video_id() {
        assert_eq!(
            video_id("https://music.youtube.com/watch?v=abc123&list=RDAMVM"),
            Some("abc123".to_string())
        );
        assert_eq!(video_id("https://music.youtube.com/watch?v=&x=1"), None);
        assert_eq!(video_id("https://music.youtube.com/"), None);
    }
}
