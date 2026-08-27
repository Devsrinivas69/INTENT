"""
Screen Capture
Uses mss for reliable multi-monitor DPI-aware desktop capture with safe fallbacks.
Returns base64 PNG images in absolute desktop resolution.
"""

import mss
import mss.tools
import base64
import io
from PIL import Image


def capture_full_screen(monitor_index: int = 1) -> dict:
    """
    Capture the entire specified monitor.
    monitor_index=1 is the primary monitor (mss convention).
    """
    try:
        with mss.mss() as sct:
            monitors = sct.monitors
            if monitor_index >= len(monitors):
                monitor_index = 1
            mon = monitors[monitor_index]
            screenshot = sct.grab(mon)
            img = Image.frombytes('RGB', screenshot.size, screenshot.bgra, 'raw', 'BGRX')
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            return {
                'base64': b64,
                'width': screenshot.width,
                'height': screenshot.height,
                'left': mon['left'],
                'top': mon['top'],
                'monitor_index': monitor_index,
            }
    except Exception as e:
        # Fallback dummy image for headless / session 0 environments
        blank = Image.new('RGB', (1920, 1080), color=(240, 240, 240))
        buf = io.BytesIO()
        blank.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        return {
            'base64': b64,
            'width': 1920,
            'height': 1080,
            'left': 0,
            'top': 0,
            'monitor_index': monitor_index,
            'fallback': True,
        }


def capture_window_region(x: int, y: int, width: int, height: int) -> dict:
    """Capture a specific region of the desktop by absolute desktop coordinates."""
    try:
        with mss.mss() as sct:
            region = {'left': x, 'top': y, 'width': width, 'height': height}
            screenshot = sct.grab(region)
            img = Image.frombytes('RGB', screenshot.size, screenshot.bgra, 'raw', 'BGRX')
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
            return {
                'base64': b64,
                'width': width,
                'height': height,
                'left': x,
                'top': y,
            }
    except Exception:
        blank = Image.new('RGB', (max(1, width), max(1, height)), color=(240, 240, 240))
        buf = io.BytesIO()
        blank.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        return {
            'base64': b64,
            'width': width,
            'height': height,
            'left': x,
            'top': y,
            'fallback': True,
        }


def get_monitor_info() -> list:
    """Return metadata for all connected monitors."""
    try:
        with mss.mss() as sct:
            result = []
            for i, mon in enumerate(sct.monitors[1:], start=1):
                result.append({
                    'index': i,
                    'left': mon['left'],
                    'top': mon['top'],
                    'width': mon['width'],
                    'height': mon['height'],
                })
            return result if result else [{'index': 1, 'left': 0, 'top': 0, 'width': 1920, 'height': 1080}]
    except Exception:
        return [{'index': 1, 'left': 0, 'top': 0, 'width': 1920, 'height': 1080}]
