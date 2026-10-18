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
//! Gating: enabled by default and works out of the box with the project's
//! own Discord application ([`DEFAULT_CLIENT_ID`] — a public id, no secret;
//! Rich Presence uses the local pipe, not OAuth). Users can override it with
//! their own application id in Settings → General, or turn the whole feature
//! off with its checkbox.

use serde_json::Value;

/// The project's Discord application (name "Mirlo"). Client ids are public:
/// Rich Presence only needs the id for the local IPC handshake — no OAuth,
/// no tokens, nothing tied to any user account. An empty configured id falls
/// back to this one, so the feature works without any setup.
pub const DEFAULT_CLIENT_ID: &str = "1560828287050195045";

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
/// Position and duration are converted to **milliseconds** (the IPC
/// timestamp unit); start+end render the track-length progress bar while
/// playing. The artwork uses the modern client-side external URL support
/// (`large_image` as an https URL resolves against Discord's external-assets
/// API; the ack reply shows the resolved `mp:external/...` path).
fn activity_args(data: &Value, now_secs: i64) -> Option<Value> {
    let title = data.get("title").and_then(Value::as_str)?;
    if title.is_empty() {
        return None;
    }
    let paused = data.get("paused").and_then(Value::as_bool).unwrap_or(false);
    let position = data.get("time").and_then(Value::as_f64).unwrap_or(0.0);
    let duration = data.get("duration").and_then(Value::as_f64).unwrap_or(0.0);

    let mut activity = serde_json::json!({
        // 2 = Listening (music-style presence).
        "type": 2,
        "details": title,
        "instance": false,
    });
    let byline = data.get("artist").and_then(Value::as_str).unwrap_or("");
    let (artist, album) = crate::media_controls::split_byline(byline);
    if !artist.is_empty() {
        activity["state"] = Value::String(artist);
    }
    if !paused {
        let start_ms = (now_secs - position.max(0.0) as i64) * 1000;
        let timestamps = if duration > 1.0 {
            serde_json::json!({ "start": start_ms, "end": start_ms + duration as i64 * 1000 })
        } else {
            serde_json::json!({ "start": start_ms })
        };
        activity["timestamps"] = timestamps;
    }
    if let Some(id) = crate::media_controls::artwork_id(data) {
        activity["assets"] = serde_json::json!({
            "large_image": format!("https://i.ytimg.com/vi/{id}/mqdefault.jpg"),
            "large_text": album.unwrap_or_else(|| "YouTube Music".to_string()),
        });
    }
    Some(activity)
}

#[cfg(target_os = "windows")]
mod platform {
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};
    use std::os::windows::io::AsRawHandle;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::Duration;

    use serde_json::Value;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Pipes::PeekNamedPipe;

    use super::{activity_args, encode_frame};
    use crate::logging::log_info;

    const OP_HANDSHAKE: u32 = 0;
    const OP_FRAME: u32 = 1;
    const OP_CLOSE: u32 = 2;
    const OP_PING: u32 = 3;
    const OP_PONG: u32 = 4;

    /// Bounded logging for the high-frequency per-activity lines; lifecycle
    /// events (connect/disconnect/errors) are always logged — they are rare
    /// and critical for diagnosing Discord-side stalls.
    const LOG_FIRST: u64 = 10;
    const LOG_EVERY: u64 = 50;
    static EVENTS: AtomicU64 = AtomicU64::new(0);
    static LOGS: AtomicU64 = AtomicU64::new(0);

    /// Deadline for a single pipe write (Discord's IPC can stall its pipe
    /// transiently while it resolves external artwork).
    const SEND_TIMEOUT: Duration = Duration::from_secs(3);
    /// Deadline for a partially-received frame before resetting the pipe.
    const FRAME_TIMEOUT: Duration = Duration::from_secs(5);

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
        // An empty configured id means "use the project's built-in
        // application" — the worker treats an empty id as not configured.
        let client_id = if client_id.trim().is_empty() {
            super::DEFAULT_CLIENT_ID.to_string()
        } else {
            client_id
        };
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
                        } else if let Some(dead) = conn.take() {
                            // A timed-out write blocks a helper thread on the
                            // old connection: dropping it and reconnecting
                            // keeps the presence alive.
                            close(dead, "send timed out");
                            conn = connect(&client_id);
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
        log_event(&format!("connected to {pipe}, handshake sent"));

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

    /// Bytes readable from the pipe without blocking, or `None` when the
    /// pipe is gone.
    fn available(file: &File) -> Option<u32> {
        let mut avail = 0u32;
        let ok = unsafe {
            PeekNamedPipe(
                HANDLE(file.as_raw_handle()),
                None,
                0,
                None,
                Some(&mut avail),
                None,
            )
        };
        ok.ok().map(|_| avail)
    }

    /// Reads Discord frames. The reads are **peek-gated**: a pending
    /// (blocking) `ReadFile` on a Windows named-pipe connection serializes
    /// writes on the same connection — even from a duplicated handle — and
    /// the next `SET_ACTIVITY` would hang forever. So we only call `read`
    /// once a full frame is known to be available.
    fn read_loop(mut file: File, alive: Arc<AtomicBool>) {
        loop {
            if !alive.load(Ordering::Relaxed) {
                return;
            }
            let Some(avail) = available(&file) else {
                log_event("reader: peek failed (pipe closed)");
                alive.store(false, Ordering::Relaxed);
                return;
            };
            if avail < 8 {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            let mut header = [0u8; 8];
            if let Err(err) = file.read_exact(&mut header) {
                log_event(&format!("reader: header read failed: {err}"));
                alive.store(false, Ordering::Relaxed);
                return;
            }
            let op = u32::from_le_bytes(header[0..4].try_into().unwrap());
            let len = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
            if len > (1 << 20) {
                log_event(&format!("reader: oversized frame ({len} bytes), resetting"));
                alive.store(false, Ordering::Relaxed);
                return;
            }
            // Wait for the full payload before touching the pipe again.
            let started = std::time::Instant::now();
            loop {
                match available(&file) {
                    Some(ready) if ready >= len as u32 => break,
                    Some(_) => {
                        if started.elapsed() > FRAME_TIMEOUT {
                            log_event("reader: partial frame timed out, resetting");
                            alive.store(false, Ordering::Relaxed);
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    None => {
                        log_event("reader: pipe closed during a frame");
                        alive.store(false, Ordering::Relaxed);
                        return;
                    }
                }
            }
            let mut payload = vec![0u8; len.min(1 << 20)];
            if let Err(err) = file.read_exact(&mut payload) {
                log_event(&format!("reader: payload read failed: {err}"));
                alive.store(false, Ordering::Relaxed);
                return;
            }
            let text = String::from_utf8_lossy(&payload);
            match op {
                OP_FRAME => {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        let evt = json.get("evt").and_then(Value::as_str).unwrap_or("");
                        if evt == "READY" {
                            log_event("handshake accepted (READY)");
                        } else if let Some(cmd) = json.get("cmd").and_then(Value::as_str) {
                            match cmd {
                                // The reply mirrors what Discord registered,
                                // including resolved external assets.
                                "SET_ACTIVITY" => log_bounded(&format!(
                                    "activity acked: {}",
                                    json.get("data").map(Value::to_string).unwrap_or_default()
                                )),
                                "ERROR" => log_event(&format!("Discord error reply: {text}")),
                                _ => {}
                            }
                        }
                    }
                }
                OP_CLOSE => {
                    log_event(&format!("Discord closed the pipe: {text}"));
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
                other => log_event(&format!("unexpected op {other}: {text}")),
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
        // The write runs on a helper thread with a deadline: Discord's IPC
        // can stop draining transiently (observed while it resolves external
        // artwork), and a blocked synchronous write must not wedge the
        // worker. A timed-out write abandons the frame; the caller drops the
        // connection so the next activity starts a fresh pipe.
        let writer = conn.writer.clone();
        let (tx, rx) = mpsc::channel();
        if std::thread::Builder::new()
            .name("mirlo-discord-send".into())
            .spawn(move || {
                let sent = match writer.lock() {
                    Ok(mut file) => file.write_all(&frame).and_then(|_| file.flush()).is_ok(),
                    Err(_) => false,
                };
                let _ = tx.send(sent);
            })
            .is_err()
        {
            return false;
        }
        let sent = rx.recv_timeout(SEND_TIMEOUT).unwrap_or(false);
        if sent {
            let details = activity
                .get("details")
                .and_then(Value::as_str)
                .unwrap_or("<none>");
            log_bounded(&format!("activity sent: {details}"));
        }
        sent
    }

    fn close(conn: Connection, reason: &str) {
        log_event(&format!("disconnected from {} ({reason})", conn.pipe));
    }

    fn log_bounded(message: &str) {
        let count = LOGS.fetch_add(1, Ordering::Relaxed) + 1;
        if count < LOG_FIRST || count % LOG_EVERY == 0 {
            log_info!("discord: {message}");
        }
    }

    /// Lifecycle/error logging (rare, always visible).
    fn log_event(message: &str) {
        log_info!("discord: {message}");
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
            "artist": "Apartment • The Dreamer Evasive • 2007",
            "paused": false,
            "time": 42.5,
            "duration": 204,
            "videoId": "abc123",
            "url": "https://music.youtube.com/",
        });
        let activity = activity_args(&data, 1_000_000).unwrap();
        assert_eq!(activity["details"], "Unglued");
        assert_eq!(activity["state"], "Apartment");
        assert_eq!(activity["type"], 2);
        // Milliseconds (the IPC timestamp unit), start+end for the bar.
        assert_eq!(activity["timestamps"]["start"], (1_000_000 - 42) * 1000);
        assert_eq!(activity["timestamps"]["end"], (1_000_000 - 42 + 204) * 1000);
        assert_eq!(
            activity["assets"]["large_image"],
            "https://i.ytimg.com/vi/abc123/mqdefault.jpg"
        );
        assert_eq!(activity["assets"]["large_text"], "The Dreamer Evasive");
    }

    #[test]
    fn paused_activity_has_no_timer_and_empty_titles_are_skipped() {
        let data = json!({ "title": "T", "artist": "A", "paused": true, "time": 10 });
        let activity = activity_args(&data, 1_000_000).unwrap();
        assert!(activity.get("timestamps").is_none());
        assert!(activity.get("assets").is_none());
        assert!(activity_args(&json!({ "title": "" }), 0).is_none());
        assert!(activity_args(&json!({}), 0).is_none());
    }
}
