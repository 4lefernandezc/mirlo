//! MPRIS (Linux) — desktop media controls over D-Bus.
//!
//! Mirrors the Windows SMTC module (`media_controls.rs`): the bridge's
//! `report_player_state` payloads drive `PlaybackStatus`, `Metadata` and
//! `Position`, and media controls (media keys, GNOME/KDE media widgets)
//! are forwarded to the page through `window.__mirlo.player`.
//!
//! A `mpris-server` player runs on a dedicated thread (the crate needs an
//! async executor; `async-std` provides one). Everything is a no-op on
//! Windows.

#[cfg(target_os = "windows")]
pub fn init(_app: tauri::AppHandle) {}

#[cfg(target_os = "windows")]
pub fn on_player_state(_kind: &str, _data: &serde_json::Value) {}

#[cfg(not(target_os = "windows"))]
mod platform {
    use std::sync::OnceLock;

    use async_channel::{Receiver, Sender};
    use mpris_server::{Metadata, PlaybackStatus, Player, Time, TrackId};
    use serde_json::Value;
    use tauri::AppHandle;

    use crate::logging::{log_error, log_info};
    use crate::media_controls::{artwork_id, split_byline};

    const APP_ID: &str = "mirlo";

    enum Msg {
        State(String, Value),
    }

    static SENDER: OnceLock<Sender<Msg>> = OnceLock::new();

    pub fn init(app: AppHandle) {
        let (tx, rx) = async_channel::unbounded();
        if SENDER.set(tx).is_err() {
            return;
        }
        std::thread::Builder::new()
            .name("mpris".into())
            .spawn(move || {
                if let Err(err) = run(app, rx) {
                    log_error!("mpris: {err}");
                }
            })
            .expect("spawn mpris thread");
    }

    pub fn on_player_state(kind: &str, data: &Value) {
        if !matches!(
            kind,
            "video-src-changed" | "play-or-paused" | "seeked" | "time-changed"
        ) {
            return;
        }
        if let Some(sender) = SENDER.get() {
            let _ = sender.try_send(Msg::State(kind.to_string(), data.clone()));
        }
    }

    fn run(app: AppHandle, rx: Receiver<Msg>) -> Result<(), String> {
        async_std::task::block_on(async move {
            let player = Player::builder(APP_ID)
                .identity("Mirlo")
                .desktop_entry(APP_ID)
                .can_play(true)
                .can_pause(true)
                .can_go_next(true)
                .can_go_previous(true)
                .can_seek(true)
                .build()
                .await
                .map_err(|err| err.to_string())?;
            log_info!("mpris: registered org.mpris.MediaPlayer2.{APP_ID}");

            // Method calls from the desktop environment: forward to the page.
            let control = |js: &'static str| {
                let app = app.clone();
                move |_player: &Player| crate::eval_in_player(&app, js)
            };
            player.connect_play(control("window.__mirlo && window.__mirlo.player.play()"));
            player.connect_pause(control("window.__mirlo && window.__mirlo.player.pause()"));
            player.connect_play_pause(control(
                "window.__mirlo && window.__mirlo.player.playPause()",
            ));
            player.connect_next(control("window.__mirlo && window.__mirlo.player.next()"));
            player.connect_previous(control(
                "window.__mirlo && window.__mirlo.player.previous()",
            ));
            // There is no "stop" in the player: pause, like SMTC does.
            player.connect_stop(control("window.__mirlo && window.__mirlo.player.pause()"));
            {
                let app = app.clone();
                player.connect_set_position(move |_player, _track, position| {
                    let seconds = position.as_micros() as f64 / 1_000_000.0;
                    let js = format!("window.__mirlo && window.__mirlo.player.seek({seconds:.3})");
                    crate::eval_in_player(&app, &js);
                });
            }

            let updates = async {
                while let Ok(Msg::State(kind, data)) = rx.recv().await {
                    apply_state(&player, &kind, &data).await;
                }
            };

            // The player's server task and our updates run together; when
            // either ends the thread finishes.
            let runner = player.run();
            futures::pin_mut!(runner);
            futures::pin_mut!(updates);
            futures::future::select(runner, updates).await;
            Ok(())
        })
    }

    async fn apply_state(player: &Player, kind: &str, data: &Value) {
        if let Some(paused) = data.get("paused").and_then(Value::as_bool) {
            let status = if paused {
                PlaybackStatus::Paused
            } else {
                PlaybackStatus::Playing
            };
            if status != player.playback_status() {
                let _ = player.set_playback_status(status).await;
            }
        }
        if kind == "video-src-changed" {
            if let Some(metadata) = build_metadata(data) {
                if *player.metadata() != metadata {
                    let _ = player.set_metadata(metadata).await;
                    player.set_position(Time::ZERO);
                }
            }
        }
        if let Some(time) = data.get("time").and_then(Value::as_f64) {
            let position = Time::from_millis((time.max(0.0) * 1000.0) as i64);
            player.set_position(position);
            if kind == "seeked" {
                let _ = player.seeked(position).await;
            }
        }
    }

    fn build_metadata(data: &Value) -> Option<Metadata> {
        let title = data.get("title").and_then(Value::as_str)?.trim();
        if title.is_empty() {
            return None;
        }
        let byline = data.get("artist").and_then(Value::as_str).unwrap_or("");
        let (artist, album) = split_byline(byline);

        let mut builder = Metadata::builder().title(title);
        if !artist.is_empty() {
            builder = builder.artist([artist]);
        }
        if let Some(album) = album {
            builder = builder.album(album);
        }
        if let Some(video_id) = artwork_id(data) {
            builder = builder.art_url(format!("https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"));
            let path = format!("/org/mpris/MediaPlayer2/Track/{video_id}");
            if let Ok(track) = TrackId::try_from(path.as_str()) {
                builder = builder.trackid(track);
            }
        }
        Some(builder.build())
    }
}

#[cfg(not(target_os = "windows"))]
pub use platform::{init, on_player_state};
