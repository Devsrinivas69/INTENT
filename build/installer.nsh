!macro customInstall
  ; Check Python installation
  nsExec::ExecToLog 'python --version'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK "Python is required but not found. Please install Python 3.9+ from python.org"
  ${EndIf}

  ; Install Python dependencies
  nsExec::ExecToLog 'python -m pip install uiautomation pywin32 winrt-Windows.Media.Ocr winrt-Windows.Globalization opencv-python mss Pillow websockets'
  
  ; Register native messaging host
  nsExec::ExecToLog 'python "$INSTDIR\resources\scripts\install_native_host.py"'
  
  DetailPrint "INTENT native components installed successfully."
!macroend

!macro customUnInstall
  ; Remove native messaging host registry entry
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.intent.native_host"
!macroend
