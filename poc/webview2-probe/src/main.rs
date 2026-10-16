use std::path::PathBuf;
use std::time::{Duration, Instant};

use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const INIT_SCRIPT: &str = r#"
(function () {
  if (window.__ytmPoc) return;
  var AD_RE = /(doubleclick\.net|googlesyndication|googleadservices|\/pagead\/|\/api\/stats\/ads|activeview)/i;
  function post(obj) { try { window.ipc.postMessage(JSON.stringify(obj)); } catch (e) {} }
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (AD_RE.test(url)) {
      post({ kind: 'blocked', via: 'fetch', url: url.slice(0, 160) });
      return Promise.reject(new TypeError('blocked by ytm-poc'));
    }
    return origFetch.apply(this, arguments);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (AD_RE.test(String(url))) {
      this.__ytmPocBlocked = true;
      post({ kind: 'blocked', via: 'xhr', url: String(url).slice(0, 160) });
    }
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__ytmPocBlocked) { try { this.abort(); } catch (e) {} return; }
    return origSend.apply(this, arguments);
  };
  window.__ytmPoc = {
    playPause: function () { var b = document.querySelector('#play-pause-button'); if (b) { b.click(); return true; } return false; },
    next: function () { var b = document.querySelector('.next-button'); if (b) { b.click(); return true; } return false; },
    prev: function () { var b = document.querySelector('.previous-button'); if (b) { b.click(); return true; } return false; },
    state: function () {
      var v = document.querySelector('video');
      var t = document.querySelector('ytmusic-player-bar .title');
      return {
        href: location.href,
        hasVideo: !!v,
        paused: v ? v.paused : null,
        time: v ? Math.round(v.currentTime) : null,
        src: v && v.src ? v.src.slice(0, 100) : null,
        title: t ? t.textContent : null
      };
    },
    report: function () { post({ kind: 'state', data: window.__ytmPoc.state() }); }
  };
  setInterval(function () { window.__ytmPoc.report(); }, 2000);
  post({ kind: 'injected', href: location.href });
})();
"#;

fn profile_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(base).join("ytm-poc").join("webview2-profile");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn main() -> wry::Result<()> {
    let event_loop = EventLoopBuilder::new().build();
    let window = WindowBuilder::new()
        .with_title("YouTube Music - PoC WebView2")
        .with_inner_size(LogicalSize::new(1280.0, 800.0))
        .build(&event_loop)
        .expect("no se pudo crear la ventana");

    let mut web_context = wry::WebContext::new(Some(profile_dir()));

    let webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_url("https://music.youtube.com/")
        .with_initialization_script(INIT_SCRIPT)
        .with_ipc_handler(|req| {
            println!("[js] {}", req.body());
        })
        .build(&window)?;

    let hotkeys = GlobalHotKeyManager::new().expect("no se pudo crear el gestor de atajos");
    let hk_play = HotKey::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let hk_next = HotKey::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowRight);
    let hk_prev = HotKey::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowLeft);
    let (id_play, id_next, id_prev) = (hk_play.id(), hk_next.id(), hk_prev.id());
    let _ = hotkeys.register(hk_play);
    let _ = hotkeys.register(hk_next);
    let _ = hotkeys.register(hk_prev);

    println!("[poc] perfil: {}", profile_dir().display());
    println!("[poc] atajos: Ctrl+Alt+Space play/pausa | Ctrl+Alt+FlechaDer next | Ctrl+Alt+FlechaIzq prev");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(100));

        while let Ok(hk) = GlobalHotKeyEvent::receiver().try_recv() {
            if hk.state == HotKeyState::Pressed {
                let script = if hk.id == id_play {
                    Some("window.__ytmPoc && window.__ytmPoc.playPause()")
                } else if hk.id == id_next {
                    Some("window.__ytmPoc && window.__ytmPoc.next()")
                } else if hk.id == id_prev {
                    Some("window.__ytmPoc && window.__ytmPoc.prev()")
                } else {
                    None
                };
                if let Some(s) = script {
                    let _ = webview.evaluate_script(s);
                }
            }
        }

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }

        let _ = &hotkeys;
    });
}
