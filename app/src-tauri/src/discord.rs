//! Discord Rich Presence over the local IPC pipe — Phase C.
//!
//! The official Discord client exposes a local named pipe
//! (`\\.\pipe\discord-ipc-0` .. `-9`); this module implements the small IPC
//! protocol directly (no dependencies):
//!
//!   frame: u32-LE opcode | u32-LE length | UTF-8 JSON payload
//!   op 0 HANDSHAKE `{v:1, client_id}` → Discord replies with `READY`
//!   op 1 FRAME with `{cmd:"SET_ACTIVITY", args:{pid, activity}, nonce}`
//!
//! A worker thread owns the connection, retries in the background and sends
//! activity updates only when the rendered activity actually changed.
//!
//! Gating: OFF by default and inert until a Discord **application client id**
//! is configured (Settings → General; the user creates the application in
//! the Discord Developer Portal — Mirlo cannot ship one). The activity uses
//! the app name from that Discord application.

use serde_json::Value;

/// Applies the config (enabled + client id) to the worker.
pub fn set_config(enabled: bool, client_id: String) {
    platform::set_config(enabled, client_id);
}

/// Feeds `report_player_state` events to the presence.
pub fn on_player_state(kind: &str, data: &Value) {
    platform::on_player_state(kind, data);
}

/// Encodes one Discord IPC frame.
fn encode_frame(op: u32, payload: &Value) -> Vec<u8> {
    let json = payload.to_string();
    let bytes = json.as_bytes();
    let mut frame = Vec::with_capacity(8 + bytes.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    frame.extend_from_slice(bytes);
    frame
}

/// Builds the SET_ACTIVITY payload for a `report_player_state` snapshot.
///
/// `position` is the current playback position in seconds (used for the
/// elapsed-time counter while playing); `now` is a UNIX timestamp.
fn activity_args(data: &Value, now_secs: i64) -> Option<Value> {
    let title = data.get("title").and_then(Value::as_str)?;
    if title.is_empty() {
        return None;
    }
    let paused = data.get("paused").and_then(Value::as_bool).unwrap_or(false);
    let position = data.get("time").and_then(Value::as_f64).unwrap_or(0.0);
    let mut activity = serde_json::json!({
        // 2 = Listening (music-style presence).
        "type": 2,
        "details": title,
        "instance": false,
    });
    if let Some(artist) = data.get("artist").and_then(Value::as_str) {
        if !artist.is_empty() {
            activity["state"] = Value::String(artist.to_string());
        }
    }
    if !paused {
        let started = now_secs - position.max(0.0) as i64;
        activity["timestamps"] = serde_json::json!({ "start": started });
    }
    Some(activity)
}

#[cfg(target_os = "windows")]
mod platform {
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::Duration;

    use serde_json::Value;

    use super::{activity_args, encode_frame};

    const OP_HANDSHAKE: u32 = 0;
    const OP_FRAME: u32 = 1;
    const OP_CLOSE: u32 = 2;
    const OP_PING: u32 = 3;
    const OP_PONG: u32 = 4;

    const LOG_FIRST: u64 = 10;
    const LOG_EVERY: u64 = 100;
    static EVENTS: AtomicU64 = AtomicU64::new(0);
    static LOGS: AtomicU64 = AtomicU64::new(0);

    enum Msg {
        Config {
            enabled: bool,
            client_id: String,
            reply: Option<Sender<Result<String, String>>>,
        },
        Activity(Value),
    }

    static WORKER: OnceLock<Sender<Msg>> = OnceLock::new();

    pub fn set_config(enabled: bool, client_id: String) {
        let worker = worker();
        // Synchronous so a config change is applied before its command returns
        // (also makes tests able to wait for the outcome).
        let (tx, rx) = mpsc::channel();
        let _ = worker.send(Msg::Config {
            enabled,
            client_id,
            reply: Some(tx),
        });
        let _ = rx.recv_timeout(Duration::from_secs(5));
    }

    pub fn on_player_state(kind: &str, data: &Value) {
        if !matches!(kind, "video-src-changed" | "play-or-paused" | "seeked") {
            return;
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if let Some(activity) = activity_args(data, now) {
            let _ = worker().send(Msg::Activity(activity));
        }
    }

    fn worker() -> &'static Sender<Msg> {
        WORKER.get_or_init(|| {
            let (tx, rx) = mpsc::channel::<Msg>();
            std::thread::Builder::new()
                .name("mirlo-discord".into())
                .spawn(move || run(rx))
                .expect("spawn discord worker");
            tx
        })
    }

    struct Connection {
        writer: Arc<Mutex<File>>,
        alive: Arc<AtomicBool>,
        pipe: String,
    }

    fn run(rx: mpsc::Receiver<Msg>) {
        let mut enabled = false;
        let mut client_id = String::new();
        let mut conn: Option<Connection> = None;
        let mut last_sent: Option<Value> = None;

        loop {
            let wait = if enabled && client_id.is_empty() {
                Duration::from_secs(30) // configured but no id: idle-poll
            } else if conn.is_some() {
                Duration::from_secs(5)
            } else if enabled {
                Duration::from_secs(10) // reconnect pacing
            } else {
                Duration::from_secs(30)
            };

            match rx.recv_timeout(wait) {
                Ok(Msg::Config {
                    enabled: new_enabled,
                    client_id: new_id,
                    reply,
                }) => {
                    let changed = new_enabled != enabled || new_id != client_id;
                    enabled = new_enabled;
                    client_id = new_id;
                    if changed {
                        if let Some(conn) = conn.take() {
                            close(conn, "config change");
                        }
                        last_sent = None;
                    }
                    let state = if !enabled {
                        Err("disabled".to_string())
                    } else if client_id.is_empty() {
                        Err("no client id configured".to_string())
                    } else if conn.is_some() {
                        Ok("connected".to_string())
                    } else {
                        Err("not connected".to_string())
                    };
                    if let Some(reply) = reply {
                        let _ = reply.send(state);
                    }
                }
                Ok(Msg::Activity(activity)) => {
                    if !enabled || client_id.is_empty() {
                        continue;
                    }
                    if last_sent.as_ref() == Some(&activity) {
                        continue;
                    }
                    if conn.is_none() {
                        conn = connect(&client_id);
                    }
                    if let Some(active) = conn.as_ref() {
                        if !active.alive.load(Ordering::Relaxed) {
                            if let Some(dead) = conn.take() {
                                close(dead, "pipe closed by Discord");
                            }
                            conn = connect(&client_id);
                        }
                    }
                    if let Some(active) = conn.as_ref() {
                        if send_activity(active, &activity) {
                            last_sent = Some(activity);
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    // Reap dead connections; reconnect lazily.
                    if let Some(active) = conn.as_ref() {
                        if !active.alive.load(Ordering::Relaxed) {
                            if let Some(dead) = conn.take() {
                                close(dead, "pipe closed by Discord");
                            }
                        }
                    }
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    fn connect(client_id: &str) -> Option<Connection> {
        let mut pipe = None;
        let mut file = None;
        for index in 0..10 {
            let name = format!(r"\\.\pipe\discord-ipc-{index}");
            match OpenOptions::new().read(true).write(true).open(&name) {
                Ok(opened) => {
                    pipe = Some(name);
                    file = Some(opened);
                    break;
                }
                Err(_) => continue,
            }
        }
        let (pipe, mut file) = (pipe?, file?);

        let handshake = encode_frame(
            OP_HANDSHAKE,
            &serde_json::json!({ "v": 1, "client_id": client_id }),
        );
        if file.write_all(&handshake).is_err() || file.flush().is_err() {
            return None;
        }
        log_bounded(&format!("connected to {pipe}, handshake sent"));

        let writer = Arc::new(Mutex::new(file.try_clone().ok()?));
        let alive = Arc::new(AtomicBool::new(true));
        {
            let alive = alive.clone();
            let reader_file = file;
            std::thread::Builder::new()
                .name("mirlo-discord-reader".into())
                .spawn(move || read_loop(reader_file, alive))
                .ok()?;
        }
        Some(Connection {
            writer,
            alive,
            pipe,
        })
    }

    fn read_loop(mut file: File, alive: Arc<AtomicBool>) {
        loop {
            let mut header = [0u8; 8];
            if file.read_exact(&mut header).is_err() {
                alive.store(false, Ordering::Relaxed);
                return;
            }
            let op = u32::from_le_bytes(header[0..4].try_into().unwrap());
            let len = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
            let mut payload = vec![0u8; len.min(1 << 20)];
            if file.read_exact(&mut payload).is_err() {
                alive.store(false, Ordering::Relaxed);
                return;
            }
            let text = String::from_utf8_lossy(&payload);
            match op {
                OP_FRAME => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        let evt = json.get("evt").and_then(Value::as_str).unwrap_or("");
                        if evt == "READY" {
                            log_bounded("handshake accepted (READY)");
                        } else if let Some(cmd) = json.get("cmd").and_then(Value::as_str) {
                            if cmd == "ERROR" {
                                log_bounded(&format!("Discord error reply: {text}"));
                            }
                        }
                    }
                }
                OP_CLOSE => {
                    log_bounded(&format!("Discord closed the pipe: {text}"));
                    alive.store(false, Ordering::Relaxed);
                    return;
                }
                OP_PING => {
                    // Reply to keep the pipe healthy.
                    let pong = encode_frame(OP_PONG, &serde_json::Value::Null);
                    if file.write_all(&pong).and_then(|_| file.flush()).is_err() {
                        alive.store(false, Ordering::Relaxed);
                        return;
                    }
                }
                other => log_bounded(&format!("unexpected op {other}: {text}")),
            }
        }
    }

    fn send_activity(conn: &Connection, activity: &Value) -> bool {
        let payload = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": activity,
            },
            "nonce": format!("mirlo-{}", EVENTS.fetch_add(1, Ordering::Relaxed)),
        });
        let frame = encode_frame(OP_FRAME, &payload);
        match conn.writer.lock() {
            Ok(mut writer) => writer
                .write_all(&frame)
                .and_then(|_| writer.flush())
                .is_ok(),
            Err(_) => false,
        }
    }

    fn close(conn: Connection, reason: &str) {
        log_bounded(&format!("disconnected from {} ({reason})", conn.pipe));
    }

    fn log_bounded(message: &str) {
        let count = LOGS.fetch_add(1, Ordering::Relaxed) + 1;
        if count < LOG_FIRST || count % LOG_EVERY == 0 {
            println!("[mirlo] discord: {message}");
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn set_config(_enabled: bool, _client_id: String) {}

    pub fn on_player_state(_kind: &str, _data: &serde_json::Value) {}
}

#[cfg(test)]
mod tests {
    use super::{activity_args, encode_frame};
    use serde_json::json;

    #[test]
    fn frame_layout_is_op_len_payload() {
        let frame = encode_frame(1, &json!({"a":1}));
        assert_eq!(&frame[0..4], &1u32.to_le_bytes());
        let len = u32::from_le_bytes(frame[4..8].try_into().unwrap()) as usize;
        assert_eq!(len, frame.len() - 8);
        assert_eq!(&frame[8..], br#"{"a":1}"#);
    }

    #[test]
    fn activity_maps_track_and_playing() {
        let data = json!({
            "title": "Unglued",
            "artist": "Apartment",
            "paused": false,
            "time": 42.5,
        });
        let activity = activity_args(&data, 1_000_000).unwrap();
        assert_eq!(activity["details"], "Unglued");
        assert_eq!(activity["state"], "Apartment");
        assert_eq!(activity["type"], 2);
        assert_eq!(activity["timestamps"]["start"], 1_000_000 - 42);
    }

    #[test]
    fn paused_activity_has_no_timer_and_empty_titles_are_skipped() {
        let data = json!({ "title": "T", "artist": "A", "paused": true, "time": 10 });
        let activity = activity_args(&data, 1_000_000).unwrap();
        assert!(activity.get("timestamps").is_none());
        assert!(activity_args(&json!({ "title": "" }), 0).is_none());
        assert!(activity_args(&json!({}), 0).is_none());
    }
}
