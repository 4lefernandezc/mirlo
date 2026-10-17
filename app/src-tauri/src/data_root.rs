//! Resolution of the app-data root (installed vs portable mode).
//!
//! Every app-owned file (`config.json`, `window-state.json`, `logs\` and the
//! persistent WebView2 profile) lives under one root directory, resolved in
//! this order:
//!
//! 1. `MIRLO_DATA_DIR` (environment variable) when set — explicit override,
//!    also used by tests.
//! 2. `<exe_dir>\data` when an empty marker file `portable.txt` sits next to
//!    the running executable (portable ZIP distribution).
//! 3. `%LOCALAPPDATA%\Mirlo` otherwise (the installed default).
//!
//! `resolve` is a pure function (all inputs passed in) so the precedence is
//! unit-testable; `root` wires it to the live process.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Marker file that switches the app to portable mode (an empty file next to
/// `mirlo.exe`; shipped inside the portable ZIP).
pub const PORTABLE_MARKER: &str = "portable.txt";

/// Pure precedence resolution (see the module docs). Empty environment
/// values are ignored.
pub fn resolve(
    exe_dir: Option<&Path>,
    env_override: Option<&OsStr>,
    local_app_data: Option<&OsStr>,
) -> PathBuf {
    if let Some(dir) = env_override.filter(|value| !value.is_empty()) {
        return PathBuf::from(dir);
    }
    if let Some(dir) = exe_dir.filter(|dir| dir.join(PORTABLE_MARKER).is_file()) {
        return dir.join("data");
    }
    if let Some(base) = local_app_data.filter(|value| !value.is_empty()) {
        return PathBuf::from(base).join("Mirlo");
    }
    PathBuf::from(".")
}

/// The directory holding all app-owned state, resolved against the live
/// process (environment + executable location).
pub fn root() -> PathBuf {
    resolve(
        exe_dir().as_deref(),
        std::env::var_os("MIRLO_DATA_DIR").as_deref(),
        std::env::var_os("LOCALAPPDATA").as_deref(),
    )
}

/// Whether this process is a portable install (marker next to the running
/// executable). `MIRLO_DATA_DIR` does not make the app portable: it is a data
/// override, not a distribution mode.
pub fn is_portable() -> bool {
    exe_dir()
        .map(|dir| dir.join(PORTABLE_MARKER).is_file())
        .unwrap_or(false)
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// Fresh unique temp directory per test (no external dev-dependencies).
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mirlo-data-root-{tag}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn env_override_wins_over_marker_and_local_app_data() {
        let exe = temp_dir("env");
        std::fs::write(exe.join(PORTABLE_MARKER), "").unwrap();
        let resolved = resolve(
            Some(&exe),
            Some(&OsString::from("C:\\mirlo-custom-data")),
            Some(&OsString::from("C:\\Users\\user\\AppData\\Local")),
        );
        assert_eq!(resolved, PathBuf::from("C:\\mirlo-custom-data"));
        let _ = std::fs::remove_dir_all(&exe);
    }

    #[test]
    fn empty_env_override_is_ignored() {
        let resolved = resolve(
            None,
            Some(OsStr::new("")),
            Some(OsStr::new("C:\\Users\\user\\AppData\\Local")),
        );
        assert_eq!(
            resolved,
            PathBuf::from("C:\\Users\\user\\AppData\\Local").join("Mirlo")
        );
    }

    #[test]
    fn marker_next_to_exe_selects_portable_data_dir() {
        let exe = temp_dir("marker");
        std::fs::create_dir_all(exe.join("data")).unwrap();
        std::fs::write(exe.join(PORTABLE_MARKER), "").unwrap();
        let resolved = resolve(
            Some(&exe),
            None,
            Some(OsStr::new("C:\\Users\\user\\AppData\\Local")),
        );
        assert_eq!(resolved, exe.join("data"));
        let _ = std::fs::remove_dir_all(&exe);
    }

    #[test]
    fn without_marker_falls_back_to_local_app_data() {
        let exe = temp_dir("no-marker");
        let resolved = resolve(
            Some(&exe),
            None,
            Some(OsStr::new("C:\\Users\\user\\AppData\\Local")),
        );
        assert_eq!(
            resolved,
            PathBuf::from("C:\\Users\\user\\AppData\\Local").join("Mirlo")
        );
        let _ = std::fs::remove_dir_all(&exe);
    }

    #[test]
    fn without_any_input_falls_back_to_cwd() {
        assert_eq!(resolve(None, None, None), PathBuf::from("."));
        assert_eq!(
            resolve(None, None, Some(OsStr::new(""))),
            PathBuf::from(".")
        );
    }
}
