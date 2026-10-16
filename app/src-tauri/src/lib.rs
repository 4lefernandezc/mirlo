//! Mirlo application shell (Phase A).
//!
//! Owns the main window (which loads the official YouTube Music player), the
//! injected bridge, the settings store, global hotkeys, single-instance
//! behavior and the tray icon. See `docs/architecture.md` and
//! `docs/research/ipc-contract.md` for the design context.

mod config;

use std::path::Path;
use std::sync::Mutex;

use config::Config;
use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

const MAIN_WINDOW: &str = "main";
const PLAYER_URL: &str = "https://music.youtube.com/";
const BRIDGE_JS: &str = include_str!("bridge.js");

/// Shared shell state managed by Tauri.
struct AppState {
    config: Mutex<Config>,
    last_player_state: Mutex<Option<Value>>,
}

/// The MVP hotkey set (matches the validated PoC).
fn hotkey_set() -> (Shortcut, Shortcut, Shortcut) {
    let play_pause = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let next = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowRight);
    let previous = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowLeft);
    (play_pause, next, previous)
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW)
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            focus_main_window(app);
        }
    }
}

fn eval_in_player(app: &AppHandle, js: &str) {
    if let Some(window) = main_window(app) {
        let _ = window.eval(js);
    }
}

fn hotkey_handler(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let (play_pause, next, previous) = hotkey_set();
    let action = if shortcut == &play_pause {
        Some("playPause")
    } else if shortcut == &next {
        Some("next")
    } else if shortcut == &previous {
        Some("previous")
    } else {
        None
    };
    if let Some(action) = action {
        println!("[mirlo] hotkey: {action}");
        eval_in_player(
            app,
            &format!("window.__mirlo && window.__mirlo.player.{action}()"),
        );
    }
}

fn register_hotkeys(app: &AppHandle) {
    let (play_pause, next, previous) = hotkey_set();
    for (name, shortcut) in [
        ("play/pause", play_pause),
        ("next", next),
        ("previous", previous),
    ] {
        if let Err(err) = app.global_shortcut().register(shortcut) {
            eprintln!("[mirlo] could not register hotkey {name}: {err}");
        }
    }
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Mirlo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn create_main_window(
    app: &tauri::App,
    config: &Config,
    profile_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let boot = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "config": config,
    });
    let script = format!("window.__MIRLO_BOOT__ = {boot};\n{BRIDGE_JS}");
    let url = WebviewUrl::External(PLAYER_URL.parse()?);

    let mut builder = WebviewWindowBuilder::new(app, MAIN_WINDOW, url)
        .title("Mirlo")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .initialization_script(script);

    // Optional CDP endpoint for local debugging/inspection:
    //   $env:MIRLO_DEBUG_PORT = "9222"
    if let Ok(port) = std::env::var("MIRLO_DEBUG_PORT") {
        if port.parse::<u16>().is_ok() {
            builder = builder.additional_browser_args(&format!("--remote-debugging-port={port}"));
        }
    }

    // Persistent WebView2 user-data folder: keeps the Google session across
    // restarts (validated in the Phase 0 PoC).
    #[cfg(target_os = "windows")]
    {
        builder = builder.data_directory(profile_dir.to_path_buf());
    }
    #[cfg(not(target_os = "windows"))]
    let _ = profile_dir;

    builder.build()?;
    Ok(())
}

// --- Commands exposed to the injected bridge (renderer -> shell) ---

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<Config, String> {
    state
        .config
        .lock()
        .map(|c| c.clone())
        .map_err(|_| "config lock poisoned".to_string())
}

#[tauri::command]
fn set_config(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    config: Config,
) -> Result<Config, String> {
    config::save(&app, &config)?;
    let mut current = state
        .config
        .lock()
        .map_err(|_| "config lock poisoned".to_string())?;
    *current = config.clone();
    Ok(config)
}

#[tauri::command]
fn get_path(app: AppHandle, kind: String) -> Result<String, String> {
    let path = match kind.as_str() {
        "config" => config::config_path(&app),
        "profile" => config::profile_dir(&app),
        other => return Err(format!("unknown path kind: {other}")),
    };
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn report_player_state(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    kind: String,
    data: Value,
) {
    match kind.as_str() {
        "time-changed" => {}
        other => println!("[mirlo] state: {other}"),
    }
    if let Ok(mut last) = state.last_player_state.lock() {
        *last = Some(data.clone());
    }
    let _ = app.emit(
        "player-state",
        serde_json::json!({ "kind": kind, "data": data }),
    );
}

#[tauri::command]
fn reload_player(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app).ok_or_else(|| "main window not available".to_string())?;
    window
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The single-instance plugin must be registered first: a second
        // launch focuses the existing window and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    hotkey_handler(app, shortcut, event);
                })
                .build(),
        )
        .setup(move |app| {
            let handle = app.handle().clone();
            let config = config::load(&handle);

            std::fs::create_dir_all(config::profile_dir(&handle))?;
            if let Err(err) = config::ensure_stored(&handle, &config) {
                eprintln!("[mirlo] could not write initial config: {err}");
            }
            app.manage(AppState {
                config: Mutex::new(config.clone()),
                last_player_state: Mutex::new(None),
            });

            create_main_window(app, &config, &config::profile_dir(&handle))?;

            if config.hotkeys_enabled {
                register_hotkeys(&handle);
            }
            create_tray(app)?;

            println!(
                "[mirlo] ready: profile={} config={}",
                config::profile_dir(&handle).display(),
                config::config_path(&handle).display()
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_path,
            report_player_state,
            reload_player,
            restart_app
        ])
        .on_window_event(|window, event| {
            // Graceful shutdown on window close (Phase 0 note: WebView2 trees
            // tear down slowly after force kills).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Mirlo");
}
