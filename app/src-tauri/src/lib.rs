//! Mirlo application shell (Phase A).
//!
//! Owns the main window (which loads the official YouTube Music player), the
//! injected bridge, the settings store, global hotkeys, single-instance
//! behavior and the tray icon. See `docs/architecture.md` and
//! `docs/research/ipc-contract.md` for the design context.

mod adblock;
mod config;
mod data_root;
#[cfg(target_os = "windows")]
mod dialog;
mod discord;
mod logging;
mod media_controls;
mod mpris;
mod notifications;
mod playback;
mod plugins;
mod updates;
mod window_state;

use std::path::Path;
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};

use config::Config;
use logging::{log_error, log_info};
use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

const MAIN_WINDOW: &str = "main";
const SETTINGS_WINDOW: &str = "settings";
const PLAYER_URL: &str = "https://music.youtube.com/";
const BRIDGE_JS: &str = include_str!("bridge.js");

/// Shared shell state managed by Tauri.
struct AppState {
    config: Mutex<Config>,
    last_player_state: Mutex<Option<Value>>,
    /// Saved playback to apply once after launch (taken on the first
    /// `player-api-loaded` of this run).
    resume_target: Mutex<Option<playback::PlaybackState>>,
    /// When the latest `bridge-ready` arrived (the resume waits for the
    /// page to settle: YouTube Music can reload it during boot).
    bridge_ready_at: Mutex<Option<std::time::Instant>>,
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

pub(crate) fn eval_in_player(app: &AppHandle, js: &str) {
    if let Some(window) = main_window(app) {
        let _ = window.eval(js);
    }
}

/// Whether the player window is the foreground window. tao's `is_focused()`
/// tracks `WM_SETFOCUS` on the top-level window, but the WebView2 child never
/// forwards that message, so the flag stays false; the Win32 check is the
/// truth (GetForegroundWindow returns the top-level root).
fn player_is_focused(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Some(window) = main_window(app) {
            if let Ok(hwnd) = window.hwnd() {
                return hwnd
                    == unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        main_window(app)
            .and_then(|window| window.is_focused().ok())
            .unwrap_or(false)
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
        log_info!("hotkey: {action}");
        eval_in_player(
            app,
            &format!("window.__mirlo && window.__mirlo.player.{action}()"),
        );
        return;
    }

    // Plugin-registered global shortcuts (e.g. precise-volume's volume steps).
    let plugin_js = plugin_hotkey_table().lock().ok().and_then(|table| {
        table
            .iter()
            .find(|(registered, _)| registered == shortcut)
            .map(|(_, js)| js.clone())
    });
    if let Some(js) = plugin_js {
        log_info!("hotkey: plugin ({js})");
        eval_in_player(app, &js);
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
            log_error!("could not register hotkey {name}: {err}");
        }
    }
}

/// Global shortcuts configured by plugins (currently `precise-volume`).
/// The config stores tauri accelerator strings (e.g. "Ctrl+Alt+ArrowUp");
/// they are registered at startup, so changing them needs an app restart
/// (upstream registers them in its backend at start too).
fn register_plugin_hotkeys(app: &AppHandle, config: &Config) {
    let Some(plugin) = config.plugins.get("precise-volume") else {
        return;
    };
    if !plugin
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return;
    }
    let shortcuts = plugin.get("globalShortcuts");
    for (key, increase) in [("volumeUp", true), ("volumeDown", false)] {
        let accelerator = shortcuts
            .and_then(|value| value.get(key))
            .and_then(Value::as_str)
            .unwrap_or("");
        if accelerator.is_empty() {
            continue;
        }
        match Shortcut::from_str(accelerator) {
            Ok(shortcut) => {
                let js = format!(
                    "window.__mirlo.plugins.get('precise-volume')?.changeVolume({increase})"
                );
                if let Ok(mut table) = plugin_hotkey_table().lock() {
                    table.push((shortcut, js));
                }
                if let Err(err) = app.global_shortcut().register(shortcut) {
                    log_error!("could not register plugin hotkey {key} ({accelerator}): {err}");
                }
            }
            Err(err) => {
                log_error!("invalid accelerator for {key}: {accelerator} ({err})");
            }
        }
    }
}

fn plugin_hotkey_table() -> &'static Mutex<Vec<(Shortcut, String)>> {
    static TABLE: OnceLock<Mutex<Vec<(Shortcut, String)>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(Vec::new()))
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let check_updates = MenuItem::with_id(
        app,
        "check-updates",
        "Check for updates…",
        true,
        None::<&str>,
    )?;
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &check_updates, &toggle, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Mirlo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => open_settings_window(app),
            "check-updates" => updates::check_now(app),
            "toggle" => toggle_main_window(app),
            "quit" => {
                window_state::persist();
                save_playback(&app.state::<AppState>());
                app.exit(0)
            }
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

fn debug_browser_args() -> Option<String> {
    std::env::var("MIRLO_DEBUG_PORT")
        .ok()
        .filter(|port| port.parse::<u16>().is_ok())
        .map(|port| format!("--remote-debugging-port={port}"))
}

/// Opens (or focuses) the local settings window served from `ui/`.
/// It shares the WebView2 environment with the player window (same
/// `data_directory` + browser args), which WebView2 requires for webviews
/// with identical environment options.
fn open_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let mut builder = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW,
        WebviewUrl::App("settings.html".into()),
    )
    .title("Mirlo - Settings")
    .inner_size(960.0, 700.0)
    .min_inner_size(640.0, 480.0);

    #[cfg(target_os = "windows")]
    {
        builder = builder.data_directory(config::profile_dir());
    }
    if let Some(args) = debug_browser_args() {
        builder = builder.additional_browser_args(&args);
    }

    if let Err(err) = builder.build() {
        log_error!("could not open the settings window: {err}");
    }
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
    // Order: boot config → core bridge (defines the plugin host) → plugin
    // modules (register themselves) → host init (starts enabled plugins).
    let script = format!(
        "window.__MIRLO_BOOT__ = {boot};\n{core}\n{plugins}\nwindow.__MIRLO_PLUGINS__.init();\n",
        core = BRIDGE_JS,
        plugins = plugins::combined_script(),
    );
    let url = WebviewUrl::External(PLAYER_URL.parse()?);

    // Restore the geometry of the last session (fresh installs maximize).
    let saved = window_state::load();
    window_state::seed(saved.clone());
    let mut builder = WebviewWindowBuilder::new(app, MAIN_WINDOW, url)
        .title("Mirlo")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .initialization_script(script);
    if let Some(saved) = &saved {
        builder = builder.inner_size(saved.width.max(900.0), saved.height.max(600.0));
        if let (Some(x), Some(y)) = (saved.x, saved.y) {
            builder = builder.position(x, y);
        }
    }

    // Optional CDP endpoint for local debugging/inspection:
    //   $env:MIRLO_DEBUG_PORT = "9222"
    if let Some(args) = debug_browser_args() {
        builder = builder.additional_browser_args(&args);
    }

    // Persistent WebView2 user-data folder: keeps the Google session across
    // restarts (validated in the Phase 0 PoC).
    #[cfg(target_os = "windows")]
    {
        builder = builder.data_directory(profile_dir.to_path_buf());
    }
    #[cfg(not(target_os = "windows"))]
    let _ = profile_dir;

    let window = builder.build()?;
    // Window state: maximize (the saved/default state) or keep the restored
    // placement when it still lands on a monitor.
    match &saved {
        Some(geometry) if !geometry.maximized => {
            if !window_state::position_is_visible(&window) {
                let _ = window.center();
            }
        }
        _ => {
            let _ = window.maximize();
        }
    }
    // Network-level ad-block v1 on the WebView2 controller (Windows). The
    // handler is always registered and gated by the live `config.adblock`
    // flag so the settings toggle applies without a reload (see adblock.rs).
    adblock::install(&window);
    // Windows media session (taskbar flyout, lock screen, media keys).
    media_controls::init(&window, app.handle().clone());
    // Linux desktop media controls (MPRIS); no-op on Windows.
    mpris::init(app.handle().clone());
    Ok(())
}

// --- Commands exposed to the injected bridge (renderer -> shell) ---

#[tauri::command]
fn get_plugin_manifest() -> Value {
    plugins::manifest()
}

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<Config, String> {
    state
        .config
        .lock()
        .map(|c| c.clone())
        .map_err(|_| "config lock poisoned".to_string())
}

#[tauri::command]
fn set_config(state: tauri::State<'_, AppState>, config: Config) -> Result<Config, String> {
    config::save(&config)?;
    adblock::set_enabled(config.adblock);
    discord::set_config(config.discord_rpc, config.discord_client_id.clone());
    let mut current = state
        .config
        .lock()
        .map_err(|_| "config lock poisoned".to_string())?;
    *current = config.clone();
    Ok(config)
}

#[tauri::command]
fn set_plugin_config(
    state: tauri::State<'_, AppState>,
    plugin_id: String,
    config: Value,
) -> Result<Config, String> {
    let mut current = state
        .config
        .lock()
        .map_err(|_| "config lock poisoned".to_string())?;
    current.plugins.insert(plugin_id, config);
    config::save(&current)?;
    Ok(current.clone())
}

#[tauri::command]
fn get_path(kind: String) -> Result<String, String> {
    let path = match kind.as_str() {
        "config" => config::config_path(),
        "profile" => config::profile_dir(),
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
        "bridge-ready" => {
            // Surface the media capabilities: on Linux, WebKitGTK's MSE
            // codecs depend on the system GStreamer plugin packages.
            if let Some(caps) = data.get("caps") {
                let flag = |key: &str| caps.get(key).and_then(Value::as_bool).unwrap_or(false);
                let (ms, aac, opus) = (flag("ms"), flag("aac"), flag("opus"));
                if ms && (!aac || !opus) {
                    log_error!(
                        "playback: media codecs missing (aac={aac}, opus={opus}) — \
                         install the GStreamer plugin packages (see docs/user/install.md) \
                         or playback will fail"
                    );
                } else {
                    log_info!("state: bridge-ready (ms={ms} aac={aac} opus={opus})");
                }
            } else {
                log_info!("state: bridge-ready");
            }
        }
        other => log_info!("state: {other}"),
    }
    media_controls::on_player_state(&kind, &data);
    mpris::on_player_state(&kind, &data);
    discord::on_player_state(&kind, &data);

    // Track-change toast, only while enabled and the player is in the
    // background (the media flyout covers the focused case). The dedup
    // bookkeeping in the notifications module runs regardless so focused
    // changes still advance the "last track".
    if kind == "video-src-changed" {
        let enabled = state
            .config
            .lock()
            .map(|c| c.notifications)
            .unwrap_or(false);
        notifications::on_track_change(&data, enabled && !player_is_focused(&app));
    }

    if let Ok(mut last) = state.last_player_state.lock() {
        *last = Some(data.clone());
    }

    // Mirror the playback state to disk (throttled) so "continue where you
    // left off" survives even a hard kill; the close path writes the final
    // state.
    let resume_enabled = state
        .config
        .lock()
        .map(|c| c.resume_playback)
        .unwrap_or(false);
    if resume_enabled {
        if let Some(playback_state) = playback::from_player_state(&data) {
            playback::save_throttled(&playback_state);
        }
    }

    // Apply the saved playback once the page has settled: YouTube Music can
    // reload the SPA during boot, and a resume started on a dying document
    // is lost (observed live as "the restored track won"). Each
    // `bridge-ready` schedules a check 8 s later that only fires if no
    // newer bridge-ready arrived in the meantime.
    if kind == "bridge-ready" {
        let ready_at = std::time::Instant::now();
        if let Ok(mut last) = state.bridge_ready_at.lock() {
            *last = Some(ready_at);
        }
        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(8));
            let app_state = app_handle.state::<AppState>();
            let still_latest = app_state
                .bridge_ready_at
                .lock()
                .map(|last| last.is_some_and(|instant| instant == ready_at))
                .unwrap_or(false);
            if !still_latest {
                return;
            }
            let target = app_state
                .resume_target
                .lock()
                .ok()
                .and_then(|mut target| target.take());
            let Some(target) = target else {
                return;
            };
            log_info!(
                "playback: resuming {} at {:.0}s (paused={})",
                target.title.as_deref().unwrap_or("track"),
                target.position,
                target.paused
            );
            if let Ok(json) = serde_json::to_string(&target) {
                eval_in_player(
                    &app_handle,
                    &format!("window.__mirlo && window.__mirlo.resumePlayback({json})"),
                );
            }
        });
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
    save_playback(&app.state::<AppState>());
    window_state::persist();
    app.restart();
}

/// Writes the final playback state (close/restart paths) when the
/// "resume playback" option is enabled.
fn save_playback(app_state: &AppState) {
    let enabled = app_state
        .config
        .lock()
        .map(|c| c.resume_playback)
        .unwrap_or(false);
    if !enabled {
        return;
    }
    let last = app_state
        .last_player_state
        .lock()
        .ok()
        .and_then(|last| last.clone());
    if let Some(playback_state) = last.as_ref().and_then(playback::from_player_state) {
        playback::save(&playback_state);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();
    // Resolved log path (installed vs portable), for the fatal-error boxes.
    let log_file = data_root::root().join("logs").join("mirlo.log");
    // Under `windows_subsystem = "windows"` a panic would close the app
    // without any trace: write it to the log and surface a native box.
    let default_hook = std::panic::take_hook();
    let log_file_for_panic = log_file.clone();
    std::panic::set_hook(Box::new(move |info| {
        logging::emergency(&format!("panic: {info}"));
        #[cfg(target_os = "windows")]
        crate::dialog::fatal(&format!(
            "Mirlo hit an unexpected error and has to close.\n\n{info}\n\nDetails: {}",
            log_file_for_panic.display()
        ));
        if cfg!(debug_assertions) {
            default_hook(info);
        }
    }));

    let result = tauri::Builder::default()
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let handle = app.handle().clone();
            let config = config::load();
            adblock::set_enabled(config.adblock);
            discord::set_config(config.discord_rpc, config.discord_client_id.clone());

            std::fs::create_dir_all(config::profile_dir())?;
            if let Err(err) = config::ensure_stored(&config) {
                log_error!("could not write initial config: {err}");
            }
            // "Continue where you left off": seed the resume target before the
            // window loads (applied on the first player-api-loaded of this run).
            let resume_target = if config.resume_playback {
                playback::load()
            } else {
                None
            };
            app.manage(AppState {
                config: Mutex::new(config.clone()),
                last_player_state: Mutex::new(None),
                resume_target: Mutex::new(resume_target),
                bridge_ready_at: Mutex::new(None),
            });

            create_main_window(app, &config, &config::profile_dir())?;

            if config.hotkeys_enabled {
                register_hotkeys(&handle);
            }
            register_plugin_hotkeys(&handle, &config);
            create_tray(app)?;

            // `mirlo.exe --settings` opens the settings window directly
            // (handy for testing and for shortcuts).
            if std::env::args().any(|arg| arg == "--settings") {
                open_settings_window(&handle);
            }

            // Signed-release auto-update: silent check, prompts only when a
            // new version exists.
            if config.update_check {
                updates::check_on_startup(&handle);
            }

            log_info!(
                "ready: profile={} config={}",
                config::profile_dir().display(),
                config::config_path().display()
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            set_plugin_config,
            get_path,
            get_plugin_manifest,
            report_player_state,
            reload_player,
            restart_app
        ])
        .on_window_event(|window, event| {
            match event {
                // Track the player window's geometry so the next launch can
                // reopen with the same size/position/maximized state.
                tauri::WindowEvent::Moved(_) if window.label() == MAIN_WINDOW => {
                    window_state::track(window);
                }
                tauri::WindowEvent::Resized(_) if window.label() == MAIN_WINDOW => {
                    window_state::track(window);
                    // Minimize-to-tray: hide the window instead of leaving
                    // it in the taskbar (`focus_main_window` restores it
                    // from the tray / single-instance paths).
                    if window_state::minimized_now(window).unwrap_or(false)
                        && window
                            .app_handle()
                            .state::<AppState>()
                            .config
                            .lock()
                            .map(|config| config.minimize_to_tray)
                            .unwrap_or(false)
                    {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
            // Graceful shutdown when the *player* window closes (Phase 0
            // note: WebView2 trees tear down slowly after force kills). The
            // settings window just closes/destroys itself.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN_WINDOW {
                    let app_state = window.app_handle().state::<AppState>();
                    let close_to_tray = app_state
                        .config
                        .lock()
                        .map(|c| c.close_to_tray)
                        .unwrap_or(false);
                    if close_to_tray {
                        // Closing hides to the tray; quitting goes through
                        // the tray menu (or `restart_app`), which persist
                        // everything explicitly.
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        window_state::persist();
                        save_playback(&app_state);
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .run(tauri::generate_context!());

    if let Err(err) = result {
        log_error!("fatal: {err}");
        #[cfg(target_os = "windows")]
        crate::dialog::fatal(&format!(
            "Mirlo could not start.\n\n{err}\n\nDetails: {}",
            log_file.display()
        ));
        std::process::exit(1);
    }
}
