//! Main-window geometry persistence.
//!
//! The player window reopens in the state it had when the app last closed
//! (size, position and whether it was maximized). Fresh installs start
//! **maximized**. The geometry lives next to the config in
//! `window-state.json` under the app-data root (see `data_root.rs`);
//! updates are throttled during drags/resizes and flushed on
//! close/quit/restart.
//!
//! Sizes/positions are stored in **logical** units (DPI-independent) and the
//! restore verifies the saved placement still intersects a monitor (monitor
//! unplugged, resolution changed) — otherwise the window is centered.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{WebviewWindow, Window};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowGeometry {
    /// Logical inner (client) size.
    pub width: f64,
    pub height: f64,
    /// Logical outer position; `None` until the window was placed.
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub maximized: bool,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self {
            width: 1280.0,
            height: 800.0,
            x: None,
            y: None,
            maximized: true,
        }
    }
}

static CURRENT: Mutex<Option<WindowGeometry>> = Mutex::new(None);
static LAST_SAVE: Mutex<Option<Instant>> = Mutex::new(None);

/// Disk writes during drags/resizes are throttled to this interval.
const SAVE_THROTTLE: Duration = Duration::from_secs(1);
/// Minimum visible window area (px) required for a restored position.
const MIN_VISIBLE: i32 = 80;

fn state_path() -> PathBuf {
    crate::config::app_data_dir().join("window-state.json")
}

/// Reads the saved geometry, if any (invalid/missing files start fresh).
pub fn load() -> Option<WindowGeometry> {
    let text = std::fs::read_to_string(state_path()).ok()?;
    serde_json::from_str(&text).ok()
}

/// Seeds the tracked state from disk before the window is built. Early
/// maximized transitions skip geometry updates, so without the seed the
/// first `track` call would insert the default and clobber the persisted
/// restore bounds.
pub fn seed(geometry: Option<WindowGeometry>) {
    if let Ok(mut current) = CURRENT.lock() {
        if current.is_none() {
            *current = geometry;
        }
    }
}

fn save(geometry: &WindowGeometry) {
    let dir = crate::config::app_data_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(text) = serde_json::to_string_pretty(geometry) else {
        return;
    };
    let path = state_path();
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, &path);
    }
}

/// Whether a restored outer rectangle still has enough visible surface on
/// some monitor (a disconnected monitor must not swallow the window).
pub fn position_is_visible(window: &WebviewWindow) -> bool {
    let (Ok(pos), Ok(size), Ok(monitors)) = (
        window.outer_position(),
        window.outer_size(),
        window.available_monitors(),
    ) else {
        return true; // no information: keep the restored position
    };
    monitors.iter().any(|monitor| {
        let m_pos = monitor.position();
        let m_size = monitor.size();
        let overlap_x =
            (pos.x + size.width as i32).min(m_pos.x + m_size.width as i32) - pos.x.max(m_pos.x);
        let overlap_y =
            (pos.y + size.height as i32).min(m_pos.y + m_size.height as i32) - pos.y.max(m_pos.y);
        overlap_x > MIN_VISIBLE && overlap_y > MIN_VISIBLE
    })
}

/// Whether the window is maximized right now. On Windows this uses
/// `GetWindowPlacement` instead of tao's `is_maximized()`: during the
/// maximize transition the resize events arrive before `IsZoomed` flips,
/// which used to poison the stored restore geometry with the maximized
/// bounds. The placement's `showCmd` flips with the command.
#[cfg(target_os = "windows")]
fn maximized_now(window: &Window) -> Option<bool> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, SW_SHOWMAXIMIZED, SW_SHOWMINIMIZED, WINDOWPLACEMENT,
    };
    let hwnd = window.hwnd().ok()?;
    let mut placement = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    unsafe {
        GetWindowPlacement(hwnd, &mut placement).ok()?;
    }
    if placement.showCmd == SW_SHOWMINIMIZED.0 as u32 {
        return None; // minimized transitions report bogus bounds
    }
    Some(placement.showCmd == SW_SHOWMAXIMIZED.0 as u32)
}

#[cfg(not(target_os = "windows"))]
fn maximized_now(window: &Window) -> Option<bool> {
    window.is_maximized().ok()
}

/// Records the current geometry (call from `Moved`/`Resized` events of the
/// main window). Minimized transitions are ignored; only the normal-state
/// geometry is stored, so restore always reopens a sane window.
pub fn track(window: &Window) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(maximized) = maximized_now(window) else {
        return;
    };
    let Ok(scale) = window.scale_factor() else {
        return;
    };

    let snapshot = {
        let Ok(mut current) = CURRENT.lock() else {
            return;
        };
        let geometry = current.get_or_insert_with(WindowGeometry::default);
        geometry.maximized = maximized;
        if !maximized {
            if let (Ok(size), Ok(pos)) = (window.inner_size(), window.outer_position()) {
                geometry.width = size.width as f64 / scale;
                geometry.height = size.height as f64 / scale;
                geometry.x = Some(pos.x as f64 / scale);
                geometry.y = Some(pos.y as f64 / scale);
            }
        }
        geometry.clone()
    };

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
        save(&snapshot);
    }
}

/// Flushes the tracked geometry immediately (close/quit/restart paths).
pub fn persist() {
    if let Ok(current) = CURRENT.lock() {
        if let Some(geometry) = current.as_ref() {
            save(geometry);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::WindowGeometry;

    #[test]
    fn geometry_roundtrips_through_json() {
        let geometry = WindowGeometry {
            width: 1100.5,
            height: 700.0,
            x: Some(-120.0),
            y: Some(60.0),
            maximized: false,
        };
        let text = serde_json::to_string(&geometry).unwrap();
        let back: WindowGeometry = serde_json::from_str(&text).unwrap();
        assert_eq!(geometry, back);
    }

    #[test]
    fn defaults_start_maximized() {
        assert!(WindowGeometry::default().maximized);
    }
}
