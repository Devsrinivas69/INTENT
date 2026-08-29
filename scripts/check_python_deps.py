"""
Checks all required Python dependencies for INTENT.
Run before packaging or on first startup.
"""

import importlib
import subprocess
import sys

REQUIRED = [
    ('uiautomation', 'uiautomation'),
    ('win32gui', 'pywin32'),
    ('cv2', 'opencv-python'),
    ('mss', 'mss'),
    ('PIL', 'Pillow'),
    ('websockets', 'websockets'),
    ('numpy', 'numpy'),
]

WINRT_MODULES = [
    ('winrt.windows.media.ocr', 'winrt-Windows.Media.Ocr'),
    ('winrt.windows.globalization', 'winrt-Windows.Globalization'),
    ('winrt.windows.graphics.imaging', 'winrt-Windows.Graphics.Imaging'),
]


def check_and_install(module_name, pip_name):
    try:
        importlib.import_module(module_name)
        print(f"  [OK]   {pip_name}")
        return True
    except ImportError:
        print(f"  [MISS] {pip_name} — installing...")
        try:
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install', pip_name, '--quiet'
            ])
            print(f"  [OK]   {pip_name} installed.")
            return True
        except subprocess.CalledProcessError:
            print(f"  [FAIL] Could not install {pip_name}")
            return False


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    print("\n[INTENT] Checking Python dependencies...\n")
    all_ok = True

    print("Core dependencies:")
    for module, pip in REQUIRED:
        if not check_and_install(module, pip):
            all_ok = False

    print("\nWinRT dependencies:")
    for module, pip in WINRT_MODULES:
        if not check_and_install(module, pip):
            all_ok = False

    if all_ok:
        print("\n[INTENT] All dependencies satisfied. [OK]")
    else:
        print("\n[INTENT] Some dependencies failed. Check output above.")
        sys.exit(1)


if __name__ == '__main__':
    main()
