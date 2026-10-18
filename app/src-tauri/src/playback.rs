//! Playback resume state ("continue where you left off").
//!
//! The shell mirrors the latest `report_player_state` payload into
//! `playback.json` (throttled to one write every 30 s plus a final write
//! on close/restart), and applies it once per app launch: after the first
//! `player-api-loaded` of the run the bridge seeks to the saved position,
//! loads the saved video if YouTube Music restored a different one, and
//! restores the play/pause state. Gated by `config.resume_playback`.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::logging::log_error;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// How often the in-playback mirror is written to disk.
const SAVE_THROTTLE: Duration = Duration::from_secs(30);

static LAST_SAVE: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    /// YouTube video id of the track that was playing.
    #[serde(alias = "video_id")]
    pub video_id: String,
    /// Playback position in seconds.
    pub position: f64,
    /// Whether playback was paused when the state was captured.
    pub paused: bool,
    /// Track title (diagnostics only).
    pub title: Option<String>,
}

fn path() -> PathBuf {
    crate::config::app_data_dir().join("playback.json")
}

/// Builds a resume state from a `report_player_state` payload. Returns
/// `None` when the payload has no usable video id (e.g. nothing played).
pub fn from_player_state(data: &Value) -> Option<PlaybackState> {
    let video_id = data.get("videoId")?.as_str()?.to_string();
    if video_id.is_empty() {
        return None;
    }
    Some(PlaybackState {
        video_id,
        position: data.get("time").and_then(Value::as_f64).unwrap_or(0.0),
        paused: data.get("paused").and_then(Value::as_bool).unwrap_or(false),
        title: data
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

/// Writes the state unconditionally (close/restart paths).
pub fn save(state: &PlaybackState) {
    let json = match serde_json::to_string_pretty(state) {
        Ok(json) => json,
        Err(err) => {
            log_error!("playback: could not serialize state: {err}");
            return;
        }
    };
    if let Err(err) = std::fs::write(path(), json) {
        log_error!("playback: could not write state: {err}");
    }
}

/// Writes the state at most once per `SAVE_THROTTLE` (mirror during play).
pub fn save_throttled(state: &PlaybackState) {
    let should_save = LAST_SAVE
        .lock()
        .map(|mut last| {
            let now = Instant::now();
            if last.map_or(true, |previous| {
                now.duration_since(previous) >= SAVE_THROTTLE
            }) {
                *last = Some(now);
                true
            } else {
                false
            }
        })
        .unwrap_or(false);
    if should_save {
        save(state);
    }
}

/// Reads the saved resume state, if any (missing/invalid files return None).
pub fn load() -> Option<PlaybackState> {
    let text = std::fs::read_to_string(path()).ok()?;
    serde_json::from_str(&text).ok()
}

#[cfg(test)]
mod tests {
    use super::{from_player_state, PlaybackState};
    use serde_json::json;

    #[test]
    fn parses_a_full_payload() {
        let state = from_player_state(&json!({
            "videoId": "abc123",
            "time": 42.5,
            "paused": true,
            "title": "A song",
        }))
        .expect("should parse");
        assert_eq!(state.video_id, "abc123");
        assert_eq!(state.position, 42.5);
        assert!(state.paused);
        assert_eq!(state.title.as_deref(), Some("A song"));
    }

    #[test]
    fn rejects_payloads_without_a_video_id() {
        assert!(from_player_state(&json!({ "time": 1.0 })).is_none());
        assert!(from_player_state(&json!({ "videoId": "" })).is_none());
        assert!(from_player_state(&json!({ "videoId": null })).is_none());
    }

    #[test]
    fn defaults_missing_fields() {
        let state = from_player_state(&json!({ "videoId": "x" })).expect("should parse");
        assert_eq!(state.position, 0.0);
        assert!(!state.paused);
        assert!(state.title.is_none());
    }

    #[test]
    fn wire_format_is_camel_case_and_legacy_files_still_load() {
        let state = PlaybackState {
            video_id: "x".to_string(),
            position: 1.5,
            paused: false,
            title: None,
        };
        let json = serde_json::to_string(&state).expect("serializes");
        assert!(
            json.contains("\"videoId\""),
            "camelCase for the bridge: {json}"
        );

        // Files written by older builds used snake_case.
        let legacy: PlaybackState =
            serde_json::from_str(r#"{"video_id":"x","position":1.5,"paused":false,"title":null}"#)
                .expect("legacy file loads");
        assert_eq!(legacy.video_id, "x");
    }
}
