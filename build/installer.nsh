!macro customInstall
  ; Register native messaging host only (fast, safe)
  ; Python deps are installed at first-run by the app itself
  nsExec::ExecToStack 'python "$INSTDIR\resources\scripts\install_native_host.py"'
  Pop $0
  Pop $1
!macroend

!macro customUnInstall
  ; Remove native messaging host registry entry
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.intent.native_host"
!macroend
