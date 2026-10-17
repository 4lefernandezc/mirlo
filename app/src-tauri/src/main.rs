// Release builds run without a console window; diagnostics go to
// `<data root>\logs\mirlo.log` under the app-data root (see `data_root.rs`
// and `logging.rs`). Debug builds keep the console attached for development
// visibility.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mirlo_lib::run()
}
