"""
Screen Capture
Uses mss for reliable multi-monitor DPI-aware desktop capture.
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
    Returns:
        {
            'base64': '<png base64>',
            'width': <pixels>,
            'height': <pixels>,
            'left': <desktop x>,
            'top': <desktop y>
        }
    """
    with mss.mss() as sct:
        monitors = sct.monitors  # monitors[0] = all monitors combined, [1..n] = individual
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


def capture_window_region(x: int, y: int, width: int, height: int) -> dict:
    """
    Capture a specific region of the desktop by absolute desktop coordinates.
    Useful for capturing just the Canva or Excel window.
    """
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


def get_monitor_info() -> list:
    """Return metadata for all connected monitors."""
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
        return result
