//! Session-only sleep timer. Wall-clock deadlines include time spent suspended.

use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
enum Mode {
    Deadline(u64),
    Track(String),
}

#[derive(Debug, Default)]
pub struct SleepTimer {
    id: u32,
    mode: Option<Mode>,
    pause_pending: bool,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl SleepTimer {
    pub fn snapshot(&self) -> Value {
        let (mode, ends_at, video_id) = match &self.mode {
            Some(Mode::Deadline(at)) => ("minutes", Some(*at), None),
            Some(Mode::Track(id)) => ("track", None, Some(id)),
            None if self.pause_pending => ("expired", None, None),
            None => ("off", None, None),
        };
        json!({"id": self.id, "mode": mode, "endsAt": ends_at, "videoId": video_id})
    }

    pub fn set(&mut self, preset: &str, player: Option<&Value>, now: u64) -> Result<Value, String> {
        let mode = match preset {
            "off" => None,
            "15" | "30" | "60" => {
                let minutes: u64 = preset.parse().map_err(|_| "Invalid timer duration.")?;
                Some(Mode::Deadline(
                    now.checked_add(minutes * 60_000)
                        .ok_or("Invalid timer deadline.")?,
                ))
            }
            "track" => {
                let player = player.ok_or("Choose a loaded track first.")?;
                let id = player["videoId"].as_str().filter(|id| !id.is_empty());
                let duration = player["duration"].as_f64().unwrap_or(0.0);
                if id.is_none()
                    || duration <= 0.0
                    || player["isAd"] == true
                    || player["ended"] == true
                {
                    return Err("Choose a loaded track first.".into());
                }
                Some(Mode::Track(id.unwrap().to_string()))
            }
            _ => return Err("Invalid timer duration.".into()),
        };
        self.id = self
            .id
            .checked_add(1)
            .ok_or("Timer identifier exhausted.")?;
        self.mode = mode;
        self.pause_pending = false;
        Ok(self.snapshot())
    }

    fn finish(&mut self) {
        self.mode = None;
        self.pause_pending = true;
    }

    /// Retry an expired pause until the renderer acknowledges it (also after reconnect).
    pub fn tick(&mut self, now: u64) -> bool {
        if matches!(self.mode, Some(Mode::Deadline(at)) if now >= at) {
            self.finish();
        }
        self.pause_pending
    }

    pub fn on_state(&mut self, kind: &str, data: &Value) -> bool {
        if kind == "sleep-timer-ended" {
            if data["timerId"].as_u64() == Some(self.id as u64)
                && matches!(self.mode, Some(Mode::Track(_)))
            {
                self.finish();
                return true;
            }
        } else if kind == "sleep-timer-paused" {
            if data["timerId"].as_u64() == Some(self.id as u64) {
                self.pause_pending = false;
            }
        } else if matches!(
            kind,
            "time-changed" | "video-src-changed" | "player-api-loaded"
        ) && data["isAd"] != true
        {
            if let (Some(Mode::Track(target)), Some(current)) =
                (&self.mode, data["videoId"].as_str())
            {
                if !current.is_empty() && target != current {
                    // A manual track change cancels "this track"; never pause the user's new choice.
                    let _ = self.set("off", None, 0);
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track() -> Value {
        json!({"videoId": "song", "duration": 180, "isAd": false})
    }

    #[test]
    fn deadline_expires_once_acknowledged_and_includes_suspension() {
        let mut timer = SleepTimer::default();
        assert!(!timer.tick(1_000));
        let state = timer.set("15", None, 1_000).unwrap();
        assert_eq!(state["endsAt"], 901_000);
        assert!(!timer.tick(900_999));
        assert!(timer.tick(2_000_000));
        assert_eq!(timer.snapshot()["mode"], "expired");
        assert!(
            timer.tick(2_000_001),
            "keep retrying while the page is unavailable"
        );
        timer.on_state("sleep-timer-paused", &json!({"timerId": state["id"]}));
        assert!(!timer.tick(2_000_002));
        assert_eq!(timer.snapshot()["mode"], "off");
    }

    #[test]
    fn cancel_and_replace_invalidate_old_callbacks() {
        let mut timer = SleepTimer::default();
        let old = timer.set("track", Some(&track()), 0).unwrap();
        timer.set("off", None, 0).unwrap();
        assert!(!timer.on_state("sleep-timer-ended", &json!({"timerId": old["id"]})));
        timer.set("30", None, 0).unwrap();
        assert!(timer.tick(1_800_000));
        timer.on_state("sleep-timer-paused", &json!({"timerId": old["id"]}));
        assert!(timer.tick(1_800_001));
    }

    #[test]
    fn track_timer_ignores_ads_and_cancels_on_another_song() {
        for kind in ["time-changed", "video-src-changed", "player-api-loaded"] {
            let mut timer = SleepTimer::default();
            timer.set("track", Some(&track()), 0).unwrap();
            assert!(!timer.on_state(kind, &json!({"videoId": "ad", "isAd": true})));
            assert_eq!(timer.snapshot()["mode"], "track");
            assert!(timer.on_state(
                kind,
                &json!({"videoId": "new-song", "isAd": false, "paused": true})
            ));
            assert_eq!(timer.snapshot()["mode"], "off");
        }
    }

    #[test]
    fn end_of_track_finishes_only_the_matching_timer() {
        let mut timer = SleepTimer::default();
        let state = timer.set("track", Some(&track()), 0).unwrap();
        assert!(timer.on_state("sleep-timer-ended", &json!({"timerId": state["id"]})));
        assert!(timer.tick(0));
        assert!(!timer.on_state("sleep-timer-ended", &json!({"timerId": state["id"]})));
    }

    #[test]
    fn invalid_requests_leave_the_active_timer_unchanged() {
        let mut timer = SleepTimer::default();
        let original = timer.set("60", None, 0).unwrap();
        for (preset, player) in [
            ("-1", None),
            ("0", None),
            ("99999999999", None),
            ("track", None),
            (
                "track",
                Some(json!({"videoId": "ad", "duration": 30, "isAd": true})),
            ),
            ("track", Some(json!({"videoId": "song", "duration": 0}))),
        ] {
            assert!(timer.set(preset, player.as_ref(), 0).is_err());
            assert_eq!(timer.snapshot(), original);
        }
    }
}
