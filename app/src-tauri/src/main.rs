// Release builds run without a console window; diagnostics go to
// `%LOCALAPPDATA%\Mirlo\logs\mirlo.log` (see `logging.rs`). Debug builds
// keep the console attached for development visibility.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mirlo_lib::run()
}
