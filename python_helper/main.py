"""
INTENT Python Helper — Main Process v4.4
Deterministic multi-tier target detection & state transition verification for Windows Desktop apps:
Microsoft Excel, Word, PowerPoint, Notepad, Windows Calculator, and Canva.
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
    get_hwnd_accessible_elements, find_element_in_hwnd,
    verify_excel_state, verify_word_state, verify_powerpoint_state,
    verify_notepad_state, verify_calculator_state
)
from ocr_detector import ocr_full_image, find_best_text_match, check_ocr_available, WINRT_OCR_AVAILABLE
from opencv_detector import (
    detect_canvas_image_object, detect_canva_selection_state,
    detect_edit_photo_panel, detect_animation_panel,
    verify_canvas_background_removed, compute_screen_diff
)
from screen_map_builder import (
    build_screen_map, find_candidates_in_map
)


def generate_startup_report() -> dict:
    """Generate comprehensive startup health report."""
    uia_ok = False
    try:
        import uiautomation
        uia_ok = True
    except Exception:
        pass

    ocr_ok = check_ocr_available()

    cv_ok = False
    try:
        import cv2
        cv_ok = True
    except Exception:
        pass

    mss_ok = False
    try:
        import mss
        mss_ok = True
    except Exception:
        pass

    try:
        all_windows = find_all_windows()
        detectable = {
            'excel': any(w.get('app') == 'excel' for w in all_windows),
            'word': any(w.get('app') == 'word' for w in all_windows),
            'powerpoint': any(w.get('app') == 'powerpoint' for w in all_windows),
            'notepad': any(w.get('app') == 'notepad' for w in all_windows),
            'calculator': any(w.get('app') == 'calculator' for w in all_windows),
            'canva': any(w.get('app') == 'canva' for w in all_windows),
        }
    except Exception:
        detectable = {'excel': False, 'word': False, 'powerpoint': False, 'notepad': False, 'calculator': False, 'canva': False}

    return {
        'type': 'startup_report',
        'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        'uia_available': uia_ok,
        'ocr_available': ocr_ok,
        'opencv_available': cv_ok,
        'mss_available': mss_ok,
        'winrt_available': WINRT_OCR_AVAILABLE,
        'supported_apps_detectable': detectable,
    }


def process(cmd: dict) -> dict:
    action = cmd.get('action', '')

    # ── ping ──────────────────────────────────────────────────────────────────
    if action == 'ping':
        return {'status': 'ok', 'version': '4.4.0'}

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
        target_type = cmd.get('target_type', '')
        level_number = cmd.get('level_number', 1)
        screenshot = cmd.get('screenshot')

        # ── NATIVE APPS & CHROME: TIER 1 DIRECT UIA ACCESSIBILITY TREE ────────
        if app_name in ('excel', 'word', 'powerpoint', 'notepad', 'calculator', 'chrome', 'chrome_gmail', 'chrome_youtube', 'chrome_docs', 'chrome_sheets') and hwnd:
            uia_match = find_element_in_hwnd(hwnd, target_text, app_name=app_name)
            if uia_match and uia_match.get('confidence', 0) >= 0.55:
                return {
                    'found': True,
                    'stable': True,
                    'target': uia_match,
                    'candidates': [uia_match],
                    'method': 'uia',
                }

        # ── CANVA: TIER 0 / 1 CANVAS IMAGE OBJECT (Level 1) ───────────────────
        if app_name == 'canva' and (level_number == 1 or target_type == 'CANVAS_OBJECT' or 'image' in target_text.lower() or 'canvas' in target_text.lower()):
            if screenshot:
                canvas_obj = detect_canvas_image_object(screenshot, win_x=win_x, win_y=win_y, scale_factor=scale_factor)
                if canvas_obj:
                    return {
                        'found': True,
                        'stable': True,
                        'target': canvas_obj,
                        'candidates': [canvas_obj],
                        'method': 'opencv_canvas',
                    }

        # ── TIER 3: HYBRID SCREEN MAP (UIA + WINRT OCR + SCREENSHOT) ──────────
        if screenshot or hwnd:
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

            valid_candidates = []
            for c in candidates:
                w = c.get('width', 0)
                h = c.get('height', 0)
                x = c.get('x', 0)
                y = c.get('y', 0)
                txt = c.get('text', '').strip()

                if len(txt) < 2:
                    continue
                if w > win_w * 0.85 and h > win_h * 0.85:
                    continue

                # In Canva: reject Chrome tabs/navigation bar (y < win_y + 65)
                if app_name == 'canva' and y < win_y + 65:
                    continue

                valid_candidates.append(c)

            if valid_candidates:
                best = valid_candidates[0]
                if best.get('score', 0) >= 0.45:
                    return {
                        'found': True,
                        'stable': True,
                        'target': {
                            'text': best['text'],
                            'type': best.get('type', 'BUTTON'),
                            'x': best['x'],
                            'y': best['y'],
                            'width': best['width'],
                            'height': best['height'],
                            'confidence': best.get('score', 0.90),
                            'source': best.get('source', 'winrt_ocr'),
                        },
                        'candidates': valid_candidates[:5],
                        'method': best.get('source', 'winrt_ocr'),
                    }

        return {
            'found': False,
            'stable': False,
            'reason': f'No target control matched for "{target_text}" within {app_name.upper()} bounds',
            'candidates': [],
        }

    # ── verify_level ─────────────────────────────────────────────────────────
    elif action == 'verify_level':
        hwnd = cmd.get('hwnd')
        app_name = cmd.get('application', '')
        win_x = cmd.get('x', 0)
        win_y = cmd.get('y', 0)
        level_number = cmd.get('level_number', 1)
        condition = cmd.get('condition', '')
        target_bounds = cmd.get('target_bounds')
        screenshot_before_b64 = cmd.get('screenshot_before')
        screenshot_after_b64 = cmd.get('screenshot_after')

        # ── EXCEL UIA & STATE VERIFICATION ────────────────────────────────────
        if app_name == 'excel' and hwnd:
            uia_result = verify_excel_state(hwnd, condition)
            if uia_result.get('completed') and uia_result.get('confidence', 0) >= 0.70:
                return {**uia_result, 'method': 'uia'}

        # ── WORD UIA & STATE VERIFICATION ─────────────────────────────────────
        if app_name == 'word' and hwnd:
            word_result = verify_word_state(hwnd, condition)
            if word_result.get('completed') and word_result.get('confidence', 0) >= 0.70:
                return {**word_result, 'method': 'uia'}

        # ── POWERPOINT UIA & STATE VERIFICATION ───────────────────────────────
        if app_name == 'powerpoint' and hwnd:
            ppt_result = verify_powerpoint_state(hwnd, condition)
            if ppt_result.get('completed') and ppt_result.get('confidence', 0) >= 0.70:
                return {**ppt_result, 'method': 'uia'}

        # ── NOTEPAD UIA & STATE VERIFICATION ──────────────────────────────────
        if app_name == 'notepad' and hwnd:
            np_result = verify_notepad_state(hwnd, condition)
            if np_result.get('completed') and np_result.get('confidence', 0) >= 0.70:
                return {**np_result, 'method': 'uia'}

        # ── CALCULATOR UIA & STATE VERIFICATION ───────────────────────────────
        if app_name == 'calculator' and hwnd:
            calc_result = verify_calculator_state(hwnd, condition)
            if calc_result.get('completed') and calc_result.get('confidence', 0) >= 0.70:
                return {**calc_result, 'method': 'uia'}

        # ── CHROME & WEB APPS (Gmail, YouTube, Docs, Sheets) ──────────────────
        if app_name in ('chrome', 'chrome_gmail', 'chrome_youtube', 'chrome_docs', 'chrome_sheets'):
            if screenshot_before_b64 and screenshot_after_b64:
                diff = compute_screen_diff(screenshot_before_b64, screenshot_after_b64)
                if diff.get('changed') and diff.get('diff_score', 0) > 0.03:
                    return {
                        'completed': True,
                        'confidence': min(0.90, 0.60 + diff['diff_score'] * 5),
                        'evidence': f'Chrome web content change detected (diff={diff["diff_score"]:.3f})',
                        'method': 'screen_diff',
                    }

        # ── LEVEL 1 CANVA: PURPLE SELECTION OUTLINE MATCHING TARGET ───────────
        if app_name == 'canva' and level_number == 1:
            if screenshot_after_b64:
                sel = detect_canva_selection_state(screenshot_after_b64, target_bounds=target_bounds, win_x=win_x, win_y=win_y)
                if sel.get('selected'):
                    return {
                        'completed': True,
                        'confidence': sel.get('confidence', 0.96),
                        'evidence': f'Canva purple selection outline confirmed on image target (IoU={sel.get("iou", 1.0)})',
                        'method': 'visual_selection_border',
                        'bounds': sel.get('bounds'),
                    }

        # ── LEVEL 2 CANVA: EDIT PHOTO / ANIMATION SIDE PANEL APPEARANCE ───────
        if app_name == 'canva' and level_number == 2:
            if screenshot_after_b64:
                ocr_items = ocr_full_image(screenshot_after_b64, win_x=win_x, win_y=win_y)
                edit_panel = detect_edit_photo_panel(screenshot_after_b64, ocr_items, win_x=win_x, win_y=win_y)
                if edit_panel.get('panel_open'):
                    return {
                        'completed': True,
                        'confidence': 0.95,
                        'evidence': f'Edit photo tools panel confirmed open ({", ".join(edit_panel.get("matches", []))})',
                        'method': 'edit_photo_panel_ocr',
                    }

        # ── LEVEL 3 CANVA: BACKGROUND REMOVAL ACTION CONFIRMATION ─────────────
        if app_name == 'canva' and level_number == 3:
            if screenshot_before_b64 and screenshot_after_b64:
                canvas_diff = verify_canvas_background_removed(
                    screenshot_before_b64, screenshot_after_b64, target_bounds=target_bounds
                )
                if canvas_diff.get('completed'):
                    return {
                        'completed': True,
                        'confidence': canvas_diff['confidence'],
                        'evidence': canvas_diff['evidence'],
                        'method': canvas_diff['method'],
                    }

        # ── LEVEL 4 CANVA: VERIFY FINAL ISOLATED IMAGE ────────────────────────
        if app_name == 'canva' and level_number == 4:
            if screenshot_before_b64 and screenshot_after_b64:
                canvas_result = verify_canvas_background_removed(
                    screenshot_before_b64, screenshot_after_b64, target_bounds=target_bounds
                )
                if canvas_result.get('completed') and canvas_result.get('confidence', 0) >= 0.80:
                    return {
                        'completed': True,
                        'confidence': canvas_result['confidence'],
                        'evidence': f'Subject background removal verified: {canvas_result["evidence"]}',
                        'method': canvas_result['method'],
                    }

        # ── SCREEN DIFF FALLBACK (High threshold to avoid noise) ──────────────
        if screenshot_before_b64 and screenshot_after_b64:
            diff = compute_screen_diff(screenshot_before_b64, screenshot_after_b64)
            if diff.get('changed') and diff.get('diff_score', 0) > 0.05:
                return {
                    'completed': True,
                    'confidence': min(0.85, 0.50 + diff['diff_score'] * 4),
                    'evidence': f'Significant screen state transition detected (diff={diff["diff_score"]:.3f})',
                    'method': 'screen_diff',
                }

        return {'completed': False, 'confidence': 0.1, 'evidence': 'Waiting for user action'}

    return {'error': f'Unknown action: {action}'}


def main():
    sys.stdout.reconfigure(line_buffering=True)
    report = generate_startup_report()
    print(json.dumps(report))
    print(json.dumps({'status': 'ready', 'version': '4.4.0'}))

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
