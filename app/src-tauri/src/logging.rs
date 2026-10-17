//! File logging for the packaged application.
//!
//! Release builds run under `windows_subsystem = "windows"` (no console), so
//! diagnostics go to `<data_root>\logs\mirlo.log` (`%LOCALAPPDATA%\Mirlo` for
//! installed copies, `<exe_dir>\data` for portable ones; see `data_root.rs`)
//! with a simple size-based rotation (a single previous file). Debug builds
//! also echo to the console. Deliberately dependency-free: the surface is
//! tiny.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// Rotate once the log exceeds this size (roughly a month of normal use).
const MAX_LOG_BYTES: u64 = 1_000_000;

static LOG_FILE: OnceLock<Mutex<Option<File>>> = OnceLock::new();

/// Opens (rotating when oversized) the log file. Call once at startup;
/// logging calls made before `init` are dropped.
pub fn init() {
    let path = log_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    rotate(&path);
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();
    let _ = LOG_FILE.set(Mutex::new(file));
    line(
        "INFO",
        &format!("--- Mirlo {} starting ---", env!("CARGO_PKG_VERSION")),
    );
}

fn log_path() -> PathBuf {
    crate::data_root::root().join("logs").join("mirlo.log")
}

fn rotate(path: &Path) {
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    if meta.len() <= MAX_LOG_BYTES {
        return;
    }
    let old = path.with_extension("log.old");
    let _ = std::fs::remove_file(&old);
    let _ = std::fs::rename(path, old);
}

/// Appends one `[timestamp] [LEVEL] message` line. Debug builds echo it to
/// the console as well (release has no console attached).
pub fn line(level: &str, message: &str) {
    let line = format!("[{}] [{level}] {message}\n", timestamp());
    if let Some(mutex) = LOG_FILE.get() {
        if let Ok(mut guard) = mutex.lock() {
            if let Some(file) = guard.as_mut() {
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
    if cfg!(debug_assertions) {
        print!("{line}");
    }
}

/// Best-effort write for the panic hook: opens the file directly instead of
/// taking the shared mutex (the panicking thread may hold it).
pub fn emergency(message: &str) {
    let path = log_path();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{}] [PANIC] {message}", timestamp());
    }
    if cfg!(debug_assertions) {
        eprintln!("{message}");
    }
}

#[cfg(target_os = "windows")]
fn timestamp() -> String {
    let time = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        time.wYear, time.wMonth, time.wDay, time.wHour, time.wMinute, time.wSecond
    )
}

#[cfg(not(target_os = "windows"))]
fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("epoch:{secs}")
}

macro_rules! log_info {
    ($($arg:tt)*) => {
        $crate::logging::line("INFO", &format!($($arg)*))
    };
}

macro_rules! log_error {
    ($($arg:tt)*) => {
        $crate::logging::line("ERROR", &format!($($arg)*))
    };
}

pub(crate) use {log_error, log_info};
