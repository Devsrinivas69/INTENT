"""
INTENT Python Helper — Main Process
Newline-delimited JSON protocol over stdin/stdout.
Handles: window detection, screen analysis, target finding, state verification.
"""

import sys
import json
import time
import traceback

from window_detector import (
    get_foreground_window_info, find_app_window, find_all_windows,
    bring_window_to_foreground, get_scale_factor_for_monitor
)
from screen_capture import get_monitor_info
from uia_detector import (
    get_hwnd_accessible_elements, find_element_in_hwnd, verify_excel_state
)
from ocr_detector import ocr_full_image, find_best_text_match
from opencv_detector import compute_screen_diff, detect_button_regions
from screen_map_builder import (
    build_screen_map, find_candidates_in_map
)


# ─── Request Handler ──────────────────────────────────────────────────────────

def process(cmd: dict) -> dict:
    action = cmd.get('action', '')

    # ── ping ──────────────────────────────────────────────────────────────────
    if action == 'ping':
        return {'status': 'ok', 'version': '3.1.0'}

    # ── get_window_info ───────────────────────────────────────────────────────
    elif action == 'get_window_info':
        app_name = cmd.get('application', '')
        win = find_app_window(app_name) if app_name else get_foreground_window_info()
        if win:
            return {
                'found': True,
                'app': win.get('app'),
                'title': win.get('title'),
                'hwnd': win.get('hwnd'),
                'x': win.get('x'), 'y': win.get('y'),
                'width': win.get('width'), 'height': win.get('height'),
                'scale_factor': win.get('scale_factor', 1.0),
                'is_foreground': win.get('is_foreground', True),
            }
        monitors = get_monitor_info()
        primary = monitors[0] if monitors else {'left': 0, 'top': 0, 'width': 1920, 'height': 1080}
        return {
            'found': False,
            'reason': f'No window found for app={app_name}',
            'fallback': {
                'x': primary['left'], 'y': primary['top'],
                'width': primary['width'], 'height': primary['height'],
                'scale_factor': 1.0,
            }
        }

    # ── bring_to_foreground ───────────────────────────────────────────────────
    elif action == 'bring_to_foreground':
        hwnd = cmd.get('hwnd')
        if not hwnd:
            return {'success': False, 'reason': 'No hwnd provided'}
        result = bring_window_to_foreground(hwnd)
        time.sleep(0.6)
        return {'success': result}

    # ── analyze_screen_full ───────────────────────────────────────────────────
    elif action == 'analyze_screen_full':
        hwnd = cmd.get('hwnd')
        app_name = cmd.get('application', '')
        window_title = cmd.get('window_title', '')
        win_x = cmd.get('x', 0)
        win_y = cmd.get('y', 0)
        win_w = cmd.get('width', 1920)
        win_h = cmd.get('height', 1080)
        scale_factor = cmd.get('scale_factor', 1.0)
        screenshot = cmd.get('screenshot')

        screen_map = build_screen_map(
            hwnd=hwnd,
            app_name=app_name,
            window_title=window_title,
            win_x=win_x, win_y=win_y,
            win_w=win_w, win_h=win_h,
            scale_factor=scale_factor,
            screenshot_b64=screenshot,
        )

        response = {k: v for k, v in screen_map.items()}
        response['element_count'] = len(screen_map.get('elements', []))
        return response

    # ── find_target ───────────────────────────────────────────────────────────
    elif action == 'find_target':
        hwnd = cmd.get('hwnd')
        app_name = cmd.get('application', '')
        window_title = cmd.get('window_title', '')
        win_x = cmd.get('x', 0)
        win_y = cmd.get('y', 0)
        win_w = cmd.get('width', 1920)
        win_h = cmd.get('height', 1080)
        scale_factor = cmd.get('scale_factor', 1.0)
        target_text = cmd.get('target_text', '')
        screenshot = cmd.get('screenshot')

        # 1. First priority: UI Automation for Excel
        if app_name == 'excel' and hwnd:
            uia_match = find_element_in_hwnd(hwnd, target_text)
            if uia_match and uia_match.get('confidence', 0) >= 0.75:
                return {
                    'found': True,
                    'stable': True,
                    'target': uia_match,
                    'candidates': [uia_match],
                }

        # 2. Second priority: Build ScreenMap using Windows Native OCR
        screen_map = build_screen_map(
            hwnd=hwnd,
            app_name=app_name,
            window_title=window_title,
            win_x=win_x, win_y=win_y,
            win_w=win_w, win_h=win_h,
            scale_factor=scale_factor,
            screenshot_b64=screenshot,
        )

        candidates = find_candidates_in_map(screen_map, target_text, min_similarity=0.45)

        if candidates:
            best = candidates[0]
            if best.get('score', 0) >= 0.60:
                return {
                    'found': True,
                    'stable': True,
                    'target': {
                        'text': best['text'],
                        'type': best.get('type', 'button'),
                        'x': best['x'],
                        'y': best['y'],
                        'width': best['width'],
                        'height': best['height'],
                        'confidence': best.get('score', best.get('confidence', 0.85)),
                        'source': best.get('source', 'ocr'),
                    },
                    'candidates': candidates[:5],
                    'element_count': len(screen_map.get('elements', [])),
                }

        return {
            'found': False,
            'stable': False,
            'reason': f'No local text match for "{target_text}" in {len(screen_map.get("elements", []))} detected elements',
            'candidates': candidates[:5],
            'element_count': len(screen_map.get('elements', [])),
        }

    # ── verify_level ─────────────────────────────────────────────────────────
    elif action == 'verify_level':
        hwnd = cmd.get('hwnd')
        app_name = cmd.get('application', '')
        condition = cmd.get('condition', '')
        screenshot_before_b64 = cmd.get('screenshot_before')
        screenshot_after_b64 = cmd.get('screenshot_after')

        # Excel UIA check
        if app_name == 'excel' and hwnd:
            uia_result = verify_excel_state(hwnd, condition)
            if uia_result.get('completed') and uia_result.get('confidence', 0) >= 0.75:
                return {**uia_result, 'method': 'uia'}

        # Screen diff check
        if screenshot_before_b64 and screenshot_after_b64:
            diff = compute_screen_diff(screenshot_before_b64, screenshot_after_b64)
            if diff.get('changed'):
                return {
                    'completed': True,
                    'confidence': min(0.88, 0.55 + diff['diff_score'] * 10),
                    'evidence': f'Screen state change observed (diff={diff["diff_score"]:.3f})',
                    'method': 'screen_diff',
                }

        return {'completed': False, 'confidence': 0.3, 'evidence': 'Checking state'}

    return {'error': f'Unknown action: {action}'}


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(line_buffering=True)
    print(json.dumps({'status': 'ready', 'version': '3.1.0'}))

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            result = process(cmd)
            if 'id' in cmd:
                result['id'] = cmd['id']
            print(json.dumps(result))
        except Exception as e:
            err = {'error': str(e), 'traceback': traceback.format_exc()}
            if 'id' in (json.loads(line) if line else {}):
                try:
                    err['id'] = json.loads(line).get('id')
                except Exception:
                    pass
            print(json.dumps(err))


if __name__ == '__main__':
    main()
