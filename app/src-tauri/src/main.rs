// Keep the console attached for Phase A (development visibility).
// Phase D (packaging) will switch to `windows_subsystem = "windows"` and
// move diagnostics to a log file.
fn main() {
    mirlo_lib::run()
}
