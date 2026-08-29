"""
Window Detector
Detects active and background desktop windows including Canva (in-browser) and Excel.
Uses win32gui for reliable window enumeration without requiring pywinauto.
"""

import ctypes
import ctypes.wintypes
import win32gui
import win32process
import win32api
import win32con
import json

def get_scale_factor_for_monitor(hwnd):
    """Return the DPI scale factor for the monitor containing the given window."""
    try:
        monitor = ctypes.windll.user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
        dpi = ctypes.c_uint()
        ctypes.windll.shcore.GetDpiForMonitor(monitor, 0, ctypes.byref(dpi), ctypes.byref(ctypes.c_uint()))
        return round(dpi.value / 96.0, 2)
    except Exception:
        return 1.0


def enum_windows_callback(hwnd, results):
    """Callback for win32gui.EnumWindows — collects visible, non-minimized windows."""
    if not win32gui.IsWindowVisible(hwnd):
        return True
    if win32gui.IsIconic(hwnd):  # minimized
        return True
    title = win32gui.GetWindowText(hwnd)
    if not title:
        return True
    rect = win32gui.GetWindowRect(hwnd)
    w = rect[2] - rect[0]
    h = rect[3] - rect[1]
    if w < 100 or h < 100:
        return True  # skip tiny windows
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        cls = win32gui.GetClassName(hwnd)
    except Exception:
        return True

    results.append({
        'hwnd': hwnd,
        'title': title,
        'class': cls,
        'pid': pid,
        'x': rect[0],
        'y': rect[1],
        'width': w,
        'height': h,
    })
    return True


def classify_window(win):
    """Classify a window as 'canva', 'excel', 'word', 'powerpoint', 'notepad', 'calculator', 'chrome', etc."""
    title_lower = win.get('title', '').lower()
    cls = win.get('class', '')

    # Reject IDE / terminal / development windows from false positives
    if any(dev in title_lower for dev in ['visual studio code', 'vscode', 'powershell', 'cmd.exe', 'command prompt', 'antigravity']):
        return None

    # Excel: known class name XLMAIN or Excel document title
    if cls == 'XLMAIN' or ('excel' in title_lower and ('.xlsx' in title_lower or '.xls' in title_lower or ' - excel' in title_lower or title_lower == 'excel')):
        return 'excel'

    # Word: known class name OpusApp
    if cls == 'OpusApp' or ('word' in title_lower and ('.docx' in title_lower or '.doc' in title_lower or ' - word' in title_lower or title_lower == 'word')):
        return 'word'

    # PowerPoint: known class name PPTFrameClass
    if cls == 'PPTFrameClass' or ('powerpoint' in title_lower and ('.pptx' in title_lower or '.ppt' in title_lower or ' - powerpoint' in title_lower or title_lower == 'powerpoint')):
        return 'powerpoint'

    # Notepad: known class name Notepad
    if cls == 'Notepad' or (('notepad' in cls.lower() or cls == 'Notepad') and ('.txt' in title_lower or ' - notepad' in title_lower or 'untitled' in title_lower or title_lower == 'notepad')):
        return 'notepad'

    # Calculator: known class name ApplicationFrameWindow with Calculator title
    if ('calculator' in title_lower or title_lower == 'calculator') and cls in ('ApplicationFrameWindow', 'CalcFrame', 'Windows.UI.Core.CoreWindow'):
        return 'calculator'

    # Canva: runs inside Chrome/Edge/Brave — look for 'canva' in title
    if cls in ('Chrome_WidgetWin_1', 'MicrosoftEdgeWin32',
               'Chrome_WidgetWin_0', 'BraveWin'):
        if 'canva' in title_lower:
            return 'canva'
        elif 'gmail' in title_lower or 'mail.google' in title_lower:
            return 'chrome_gmail'
        elif 'youtube' in title_lower or 'youtube.com' in title_lower:
            return 'chrome_youtube'
        elif 'google docs' in title_lower or 'docs.google' in title_lower:
            return 'chrome_docs'
        elif 'google sheets' in title_lower or 'sheets.google' in title_lower:
            return 'chrome_sheets'
        elif 'google slides' in title_lower or 'slides.google' in title_lower:
            return 'chrome_slides'
        else:
            return 'chrome'

    # Canva desktop app (if installed)
    if 'canva' in title_lower and cls not in ('Chrome_WidgetWin_1', 'MicrosoftEdgeWin32'):
        return 'canva'

    return None


def get_foreground_window_info():
    """Return detailed info about the currently active foreground window."""
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None
        title = win32gui.GetWindowText(hwnd)
        cls = win32gui.GetClassName(hwnd)
        rect = win32gui.GetWindowRect(hwnd)
        scale = get_scale_factor_for_monitor(hwnd)
        return {
            'hwnd': hwnd,
            'title': title,
            'class': cls,
            'x': rect[0],
            'y': rect[1],
            'width': rect[2] - rect[0],
            'height': rect[3] - rect[1],
            'scale_factor': scale,
            'app': classify_window({'title': title, 'class': cls}),
        }
    except Exception:
        return None


def get_active_window_info(app_name: str = None):
    """Find the window for app_name, or fallback to current foreground window."""
    try:
        if app_name:
            return find_app_window(app_name)
        return get_foreground_window_info()
    except Exception:
        return None


def find_all_windows():
    """Enumerate all visible desktop windows and classify them."""
    results = []
    try:
        win32gui.EnumWindows(enum_windows_callback, results)
        for w in results:
            w['app'] = classify_window(w)
            w['scale_factor'] = get_scale_factor_for_monitor(w['hwnd'])
    except Exception:
        pass
    return results


def find_app_window(app_name: str):
    """
    Find the best matching window for 'canva' or 'excel'.
    Returns window dict or None.
    """
    all_windows = find_all_windows()
    matches = [w for w in all_windows if w.get('app') == app_name]
    if not matches:
        return None
    # Prefer foreground window if it matches, otherwise first match
    fg = win32gui.GetForegroundWindow()
    for w in matches:
        if w['hwnd'] == fg:
            return {**w, 'is_foreground': True}
    return {**matches[0], 'is_foreground': False}


def bring_window_to_foreground(hwnd: int) -> bool:
    """
    Bring a window to the foreground using AllowSetForegroundWindow + SetForegroundWindow.
    Returns True on success.
    """
    try:
        # Allow this process to set the foreground window
        fg_pid = ctypes.c_ulong(0)
        ctypes.windll.user32.GetWindowThreadProcessId(
            win32gui.GetForegroundWindow(), ctypes.byref(fg_pid)
        )
        ctypes.windll.user32.AttachThreadInput(
            win32api.GetCurrentThreadId(), fg_pid.value, True
        )
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)
        ctypes.windll.user32.AttachThreadInput(
            win32api.GetCurrentThreadId(), fg_pid.value, False
        )
        return True
    except Exception as e:
        # Fallback: just restore + set
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.BringWindowToTop(hwnd)
            return True
        except Exception:
            return False
