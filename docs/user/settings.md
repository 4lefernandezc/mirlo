# Settings and sleep timer

Version 0.1.13 includes system-language Settings, categories, search, the
shortcut editor, per-field save handling and the sleep timer.

Open Settings with the sliders button in the player, from the tray menu or
with `mirlo.exe --settings`.

## General preferences

Settings includes ad blocking, playback hotkeys, Windows notifications/Discord
presence, startup update checks, resume playback and close/minimize-to-tray.
Ad blocking and minimize-to-tray default off; the other switches default on.
Linux does not implement native notifications or Discord presence.
Tray **Quit** exits the application even when close-to-tray is enabled.

## Shortcut editor

In **General → Playback shortcuts**, edit play/pause, next and previous.
Enter a Tauri accelerator such as `Ctrl+Alt+K`, or leave a field empty to
disable that action. Existing configurations retain these defaults:

| Action | Default |
| --- | --- |
| Play/pause | `Ctrl+Alt+Space` |
| Next | `Ctrl+Alt+ArrowRight` |
| Previous | `Ctrl+Alt+ArrowLeft` |

The **Global media hotkeys** switch controls these three playback actions.
Optional volume bindings are separate, under **Sound → Precise volume**, and
require that extension to be enabled.

Saving rejects invalid syntax, duplicate enabled combinations (including
aliases such as `Ctrl`/`Control`) and combinations the OS cannot register.
On failure the field returns to its saved value. The check temporarily probes
new combinations without replacing the running bindings.
**Restart Mirlo to apply changes**; Reload player is not sufficient.

Availability can change after the check if another application claims the
combination. Startup registration failures are logged. Global app shortcuts
on Linux require X11; desktop media keys use MPRIS independently.

## Extensions

| Extension | Default | Function |
| --- | --- | --- |
| Blur nav bar | Off | Blurred navigation background |
| Compact sidebar | On | Icon-only sidebar |
| Album color theme | Off | Colors from the current artwork |
| Video toggle | On | Native audio/video switch; audio preferred when available |
| Unobtrusive player | Off | Hide the player view while browsing |
| Disable autoplay | On | Pause automatic track loads while respecting manual selection |
| Exponential volume | Off | Finer low-volume curve |
| Playback speed | Off | Speed control in the song menu |
| Skip silences | Off | Skip detected silent sections |
| Equalizer | Off | Configured audio filters and bass-booster preset |
| Precise volume | On | Volume HUD, wheel/arrows and optional global shortcuts |
| Skip disliked songs | Off | Skip tracks marked disliked |
| Captions selector | On | Select captions and optionally remember their language |
| Quality changer | On | Select an available playback quality |
| Navigation buttons | Off | Back/forward in the top bar |
| SponsorBlock | Off | Skip matching segments from the configured service |
| Album actions | Off | Bulk like/dislike actions in compatible lists |
| Synced lyrics | On | LRCLib timed lyrics, highlighting and click-to-seek |
| Custom theme | Native/no-op | Preset palettes and custom CSS; no enable toggle |
| Settings button | On | Open Settings from the player |

User overrides take precedence. Silence skipping and SponsorBlock can remove
natural gaps, intros or outros. Equalizer filter arrays are configured through
JSON; Settings has a bass-booster option, not band sliders.

## Language

Settings follow the **system UI language**: Spanish variants use Spanish;
other languages currently use English. This does not change YouTube Music's
own language or your regional number/date format. Windows uses the OS user's
UI language, not the WebView's browser-language preference. Linux uses the
inherited `LC_ALL`, `LANGUAGE`, `LC_MESSAGES`, then `LANG` preference.

## Find and save preferences

- Categories: General, Playback, Sound, Appearance and Integrations.
- Search by extension name, identifier, description or option label. Spanish
  search does not require typing accents.
- Filter to enabled items when you only want to see what is active.
- Changes save individually. The footer confirms success or explains a
  failure; on failure, the control returns to its previous saved value.
- General options marked immediate take effect without reloading. Extension
  changes need **Reload player**. Global shortcut changes need an app restart.
- The appearance palette and custom CSS still use the original stored values;
  translating their labels does not rename configuration keys.

## Sleep timer

In **Playback → Sleep timer**, choose:

- **15, 30 or 60 minutes**: pause when the wall-clock deadline is reached.
  Time while the computer is suspended counts; if the deadline passes while
  asleep, Mirlo pauses on resume when the native worker runs again. Manual
  clock changes also affect this deadline.
- **At the end of this track**: pause after the current loaded track finishes.
  You cannot arm this mode while an identified advertisement is playing or
  before a track is loaded. Changing to another track cancels this mode.

Press **Start timer** to arm or replace it. The countdown/current mode is
visible in Settings. **Cancel timer** stops it without pausing the song.
The timer runs in the native shell, so closing Settings or hiding the player
does not cancel it. It is not written to config and resets when Mirlo exits.
It pauses playback; it does not shut down the app or the computer.

After a timer pause, the renderer blocks late automatic playback for four
seconds. Real pointer/keyboard input or a shell media control releases that
short guard, so you can resume manually.
