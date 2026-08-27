"""
INTENT System Diagnostic — npm run diagnose
Tests every system component and reports health status.
Run this before starting INTENT to verify all dependencies are operational.
"""

import sys
import os
import json
import subprocess
import time

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def ok(msg): print(f"  \u2705 {msg}")
def fail(msg): print(f"  \u274c FAIL: {msg}")
def warn(msg): print(f"  \u26a0\ufe0f  WARN: {msg}")
def section(title): print(f"\n{'='*60}\n  {title}\n{'='*60}")


def check_python():
    section("1. PYTHON RUNTIME")
    version = sys.version_info
    if version.major == 3 and version.minor >= 9:
        ok(f"Python {version.major}.{version.minor}.{version.micro}")
    else:
        fail(f"Python 3.9+ required, found {version.major}.{version.minor}")


def check_uia():
    section("2. WINDOWS UI AUTOMATION (uiautomation)")
    try:
        import uiautomation as auto
        ok(f"uiautomation available (version: {getattr(auto, '__version__', 'unknown')})")
    except ImportError as e:
        fail(f"uiautomation not found: {e}")
        warn("Run: pip install uiautomation")


def check_winrt_ocr():
    section("3. WINDOWS NATIVE OCR (winrt)")
    try:
        import winrt.windows.media.ocr as ocr
        engine = None
        try:
            import asyncio
            async def _test():
                return ocr.OcrEngine.try_create_from_user_profile_languages()
            loop = asyncio.new_event_loop()
            engine = loop.run_until_complete(_test())
            loop.close()
        except Exception:
            pass
        if engine is not None:
            ok("WinRT OCR engine available and functional")
        else:
            warn("WinRT OCR module present but engine creation failed (language pack may be missing)")
    except ImportError as e:
        fail(f"winrt not found: {e}")
        warn("Run: pip install winrt-Windows.Media.Ocr winrt-Windows.Graphics.Imaging winrt-Windows.Storage.Streams")


def check_opencv():
    section("4. OPENCV + NUMPY")
    try:
        import cv2
        import numpy as np
        ok(f"OpenCV {cv2.__version__}, NumPy {np.__version__}")
        # Quick functional test
        test_img = np.zeros((100, 100, 3), dtype=np.uint8)
        gray = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
        ok("OpenCV functional (BGR→Gray test passed)")
    except ImportError as e:
        fail(f"OpenCV/NumPy not found: {e}")
        warn("Run: pip install opencv-python numpy")
    except Exception as e:
        fail(f"OpenCV functional test error: {e}")


def check_win32():
    section("5. PYWIN32 (win32gui, win32process)")
    try:
        import win32gui
        import win32process
        import win32api
        import win32con
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        ok(f"win32gui functional (foreground window: '{title[:50]}')")
    except ImportError as e:
        fail(f"pywin32 not found: {e}")
        warn("Run: pip install pywin32")
    except Exception as e:
        fail(f"win32gui functional test error: {e}")


def check_mss_pillow():
    section("6. SCREEN CAPTURE (mss + Pillow)")
    try:
        import mss
        import PIL.Image
        with mss.mss() as sct:
            monitors = sct.monitors
        ok(f"mss available, {len(monitors)-1} monitor(s) detected")
        ok(f"Pillow available")
    except ImportError as e:
        fail(f"mss or Pillow not found: {e}")
        warn("Run: pip install mss Pillow")
    except Exception as e:
        fail(f"Screen capture test error: {e}")


def check_python_helper():
    section("7. PYTHON HELPER JSON-RPC HEALTH")
    helper_path = os.path.join(WORKSPACE_ROOT, 'python_helper', 'main.py')
    if not os.path.exists(helper_path):
        fail(f"python_helper/main.py not found at {helper_path}")
        return

    try:
        p = subprocess.Popen(
            [sys.executable, helper_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=os.path.join(WORKSPACE_ROOT, 'python_helper')
        )
        ready = p.stdout.readline().strip()
        ok(f"Helper started: {ready}")

        p.stdin.write(json.dumps({'action': 'ping'}) + '\n')
        p.stdin.flush()
        pong = json.loads(p.stdout.readline())
        p.terminate()

        if pong.get('status') == 'ok':
            ok(f"Python helper ping OK (version={pong.get('version', 'unknown')})")
        else:
            fail(f"Python helper unexpected response: {pong}")
    except Exception as e:
        fail(f"Python helper test error: {e}")


def check_dom_bridge_port():
    section("8. DOM BRIDGE WEBSOCKET PORT (18923)")
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        result = s.connect_ex(('127.0.0.1', 18923))
        s.close()
        if result == 0:
            ok("Port 18923 open — INTENT desktop app DOM bridge is running")
        else:
            warn("Port 18923 closed — INTENT app not running (this is OK before startup)")
    except Exception as e:
        warn(f"Port check error: {e}")


def check_node_modules():
    section("9. NODE.JS DEPENDENCIES")
    node_modules = os.path.join(WORKSPACE_ROOT, 'node_modules')
    if os.path.isdir(node_modules):
        ok("node_modules directory exists")
    else:
        fail("node_modules not found — run: npm install")

    # Check for 'ws' module (WebSocket for DOM bridge)
    ws_path = os.path.join(node_modules, 'ws')
    if os.path.isdir(ws_path):
        ok("'ws' WebSocket library installed")
    else:
        fail("'ws' not found — run: npm install ws @types/ws")


def check_knowledge_base():
    section("10. KNOWLEDGE BASE")
    for app in ['canva', 'excel']:
        path = os.path.join(WORKSPACE_ROOT, 'src', 'knowledge', f'{app}.json')
        if os.path.exists(path):
            try:
                with open(path) as f:
                    data = json.load(f)
                controls = data.get('controls', [])
                ok(f"{app}.json — {len(controls)} controls registered")
            except Exception as e:
                fail(f"{app}.json parse error: {e}")
        else:
            fail(f"Missing knowledge base: {path}")


def check_browser_extension():
    section("11. BROWSER EXTENSION")
    ext_dir = os.path.join(WORKSPACE_ROOT, 'browser_extension')
    if os.path.isdir(ext_dir):
        manifest = os.path.join(ext_dir, 'manifest.json')
        content = os.path.join(ext_dir, 'content.js')
        if os.path.exists(manifest) and os.path.exists(content):
            ok(f"Extension files present at {ext_dir}")
            warn("Manual installation required: Load unpacked in chrome://extensions/")
        else:
            fail(f"Extension files incomplete in {ext_dir}")
    else:
        fail(f"browser_extension/ directory not found at {ext_dir}")


def check_env():
    section("12. ENVIRONMENT VARIABLES")
    env_file = os.path.join(WORKSPACE_ROOT, '.env')
    if os.path.exists(env_file):
        ok(".env file present")
        with open(env_file) as f:
            content = f.read()
        if 'GEMINI_API_KEY' in content and '=' in content:
            # Check if key looks real (not placeholder)
            for line in content.splitlines():
                if line.startswith('GEMINI_API_KEY='):
                    key = line.split('=', 1)[1].strip()
                    if len(key) > 20 and not key.startswith('#'):
                        ok("GEMINI_API_KEY is set")
                    else:
                        warn("GEMINI_API_KEY may be a placeholder")
        else:
            warn("GEMINI_API_KEY not found in .env")
    else:
        warn(".env file missing — create from .env.example")


def main():
    print("\n" + "#"*60)
    print("  INTENT SYSTEM DIAGNOSTIC (npm run diagnose)")
    print("  Full component health check")
    print("#"*60)

    check_python()
    check_uia()
    check_winrt_ocr()
    check_opencv()
    check_win32()
    check_mss_pillow()
    check_python_helper()
    check_dom_bridge_port()
    check_node_modules()
    check_knowledge_base()
    check_browser_extension()
    check_env()

    print("\n" + "="*60)
    print("  DIAGNOSTIC COMPLETE")
    print("  Fix any ❌ FAIL items before running INTENT.")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()
