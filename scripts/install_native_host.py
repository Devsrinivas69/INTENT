import os
import sys
import json
import winreg

HOST_NAME = "com.intent.native_host"
PYTHON_EXEC = sys.executable
HOST_SCRIPT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), 
                 '..', 'python_helper', 'intent_native_host.py')
)
MANIFEST_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__),
                 '..', 'python_helper', 'com.intent.native_host.json')
)

manifest = {
    "name": HOST_NAME,
    "description": "INTENT Native Messaging Host",
    "path": PYTHON_EXEC,
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://INTENT_EXTENSION_PLACEHOLDER/"
    ],
    "args": [HOST_SCRIPT]
}


def install():
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"[INTENT] Manifest written to: {MANIFEST_PATH}")

    reg_path = r"Software\Google\Chrome\NativeMessagingHosts\\" + HOST_NAME
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, MANIFEST_PATH)
        winreg.CloseKey(key)
        print(f"[INTENT] Registry entry created: HKCU\\{reg_path}")
        return True
    except Exception as e:
        print(f"[INTENT] Registry error: {e}")
        return False


def check_installed():
    reg_path = r"Software\Google\Chrome\NativeMessagingHosts\\" + HOST_NAME
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path)
        val, _ = winreg.QueryValueEx(key, "")
        winreg.CloseKey(key)
        return os.path.exists(val)
    except Exception:
        return False


if __name__ == '__main__':
    if check_installed():
        print("[INTENT] Native host already installed.")
    else:
        success = install()
        sys.exit(0 if success else 1)
