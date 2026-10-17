; NSIS installer hooks (Tauri `bundle.windows.nsis.installerHooks`).
;
; The default per-user install directory is `$LOCALAPPDATA\<productName>`
; (`%LOCALAPPDATA%\Mirlo`), which is also Mirlo's application-data directory
; (config.json, window-state.json, the persistent WebView2 profile and logs).
; Installing the program there would mix application files with user data, so
; when the user keeps the default location it is relocated to
; `%LOCALAPPDATA%\Programs\Mirlo` (the convention used by other per-user
; installers). A custom directory chosen in the installer UI is respected.

!macro NSIS_HOOK_PREINSTALL
  ${If} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
    SetOutPath $INSTDIR
  ${EndIf}
!macroend
