//! Native message boxes for shell-level prompts (Windows).
//!
//! Used by the updater (confirm/notify) and the fatal-error path so that,
//! under `windows_subsystem = "windows"` (no console), the user still sees
//! what happened. The module is compiled on Windows only (the shell is
//! Windows-first until Phase E); callers gate their usage with `cfg`.

use windows::core::HSTRING;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MB_YESNO,
    MESSAGEBOX_STYLE,
};

fn message_box(owner: Option<HWND>, text: &str, title: &str, flags: MESSAGEBOX_STYLE) -> bool {
    let result = unsafe { MessageBoxW(owner, &HSTRING::from(text), &HSTRING::from(title), flags) };
    result == IDYES
}

/// Yes/No prompt (No is the safe default). Returns true only on Yes.
pub fn confirm(owner: Option<HWND>, text: &str, title: &str) -> bool {
    message_box(
        owner,
        text,
        title,
        MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON2,
    )
}

/// Informational box (OK).
pub fn info(owner: Option<HWND>, text: &str, title: &str) {
    let _ = message_box(owner, text, title, MB_OK | MB_ICONINFORMATION);
}

/// Fatal-error box (OK, error icon).
pub fn fatal(text: &str) {
    let _ = message_box(None, text, "Mirlo", MB_OK | MB_ICONERROR);
}
