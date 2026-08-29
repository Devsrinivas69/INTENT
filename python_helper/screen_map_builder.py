"""
Screen Map Builder v4.3
Orchestrates Windows UI Automation + Windows Native OCR + OpenCV to build a structured ScreenMap.
All coordinates are ABSOLUTE WINDOWS DESKTOP COORDINATES.
"""

import time
from uia_detector import get_hwnd_accessible_elements, EXCEL_SEMANTIC_ALIASES, ALL_APP_ALIASES
from ocr_detector import ocr_full_image, text_similarity, normalize_text


def iou(a: dict, b: dict) -> float:
    """Intersection over Union for two bounding box dicts."""
    ax1, ay1 = a['x'], a['y']
    ax2, ay2 = ax1 + a['width'], ay1 + a['height']
    bx1, by1 = b['x'], b['y']
    bx2, by2 = bx1 + b['width'], by1 + b['height']
    inter_w = max(0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0, min(ay2, by2) - max(ay1, by1))
    inter = inter_w * inter_h
    if inter == 0:
        return 0.0
    union = a['width'] * a['height'] + b['width'] * b['height'] - inter
    return inter / union if union > 0 else 0.0


def deduplicate_elements(elements: list, iou_threshold: float = 0.4) -> list:
    """
    Merge overlapping detections. When two elements overlap significantly,
    keep the one with the higher confidence (UIA > OCR > OpenCV).
    """
    source_priority = {'uia': 3, 'uia_worksheet_grid': 3, 'uia_document_body': 3, 'ocr': 2, 'winrt_ocr': 2, 'opencv': 1}
    sorted_els = sorted(
        elements,
        key=lambda e: (source_priority.get(e.get('source', 'ocr'), 1), e.get('confidence', 0)),
        reverse=True
    )

    accepted = []
    for el in sorted_els:
        dominated = False
        for acc in accepted:
            if iou(el, acc) > iou_threshold:
                dominated = True
                break
        if not dominated:
            accepted.append(el)

    return accepted


def classify_element_type(ctrl_type: str, text: str) -> str:
    """Classify an element into a semantic type."""
    ct_lower = ctrl_type.lower()
    t_lower = text.lower()

    if 'button' in ct_lower:
        return 'button'
    if 'tabitem' in ct_lower or 'tab' in ct_lower:
        return 'tab'
    if 'menu' in ct_lower:
        return 'menu'
    if 'panel' in ct_lower or 'pane' in ct_lower:
        return 'panel'
    if 'image' in ct_lower:
        return 'image'
    if 'edit' in ct_lower or 'text' in ct_lower:
        return 'text'

    if any(kw in t_lower for kw in ['edit', 'remover', 'remove', 'animate', 'insert', 'chart', 'crop', 'filter', 'whiteboard', 'doc', 'sheet', 'website']):
        return 'button'

    return 'unknown'


def build_screen_map(hwnd: int, app_name: str, window_title: str,
                     win_x: int, win_y: int, win_w: int, win_h: int,
                     scale_factor: float = 1.0,
                     screenshot_b64: str = None) -> dict:
    """
    Full screen analysis pipeline:
    1. Run UIA on window hwnd
    2. Run Windows Native OCR on provided screenshot
    3. Merge + deduplicate
    4. Return ScreenMap
    """
    timestamp = int(time.time() * 1000)
    all_elements = []

    # 1. Windows UI Automation
    if hwnd:
        try:
            uia_els = get_hwnd_accessible_elements(hwnd, max_depth=10)
            all_elements.extend(uia_els)
        except Exception:
            pass

    # 2. Windows Native OCR
    if screenshot_b64:
        try:
            ocr_els = ocr_full_image(
                screenshot_b64,
                win_x=win_x,
                win_y=win_y,
                scale_factor=scale_factor
            )
            all_elements.extend(ocr_els)
        except Exception:
            pass

    # 3. Deduplicate
    unique = deduplicate_elements(all_elements, iou_threshold=0.40)

    # 4. Format
    screen_elements = []
    for i, el in enumerate(unique):
        ctrl_type = el.get('control_type', '')
        text = el.get('text', '')
        el_type = classify_element_type(ctrl_type, text)

        screen_elements.append({
            'id': f'el_{i:03d}',
            'text': text,
            'type': el_type,
            'control_type': ctrl_type,
            'x': el.get('x', 0),
            'y': el.get('y', 0),
            'width': el.get('width', 0),
            'height': el.get('height', 0),
            'confidence': el.get('confidence', 0.7),
            'source': el.get('source', 'ocr'),
            'enabled': el.get('enabled', True),
        })

    return {
        'capturedAt': timestamp,
        'application': app_name,
        'windowTitle': window_title,
        'windowBounds': {'x': win_x, 'y': win_y, 'width': win_w, 'height': win_h},
        'scaleFactor': scale_factor,
        'elements': screen_elements,
    }


def find_candidates_in_map(screen_map: dict, target_text: str, min_similarity: float = 0.50) -> list:
    """
    Search a ScreenMap for elements matching target_text with semantic aliases.
    """
    app_name = screen_map.get('application', 'excel').lower()
    win_bounds = screen_map.get('windowBounds', {'x': 0, 'y': 0, 'width': 1920, 'height': 1080})
    win_y = win_bounds.get('y', 0)
    win_h = win_bounds.get('height', 1080)

    target_norm = normalize_text(target_text)
    aliases = [target_norm]

    # Pull app-specific aliases
    app_table = ALL_APP_ALIASES.get(app_name, EXCEL_SEMANTIC_ALIASES)
    for canon, alias_list in app_table.items():
        if target_norm == canon or any(a in target_norm for a in alias_list) or any(target_norm in a for a in alias_list):
            aliases.extend([normalize_text(a) for a in alias_list])

    # Also search global aliases
    for other_table in ALL_APP_ALIASES.values():
        for canon, alias_list in other_table.items():
            if target_norm == canon or any(a in target_norm for a in alias_list):
                aliases.extend([normalize_text(a) for a in alias_list])

    candidates = []
    for el in screen_map.get('elements', []):
        w = el.get('width', 0)
        h = el.get('height', 0)
        y = el.get('y', 0)
        el_text = normalize_text(el.get('text', ''))

        # Skip giant containers / whole windows
        if w > 800 and h > 500:
            continue

        best_sim = 0.0
        for alias in aliases:
            sim = text_similarity(el_text, alias)
            if sim > best_sim:
                best_sim = sim

        if best_sim >= min_similarity:
            # Canva toolbar spatial preference: items in top 18% of window get a score bonus
            score = el.get('confidence', 0.7) * best_sim
            if app_name == 'canva' and (y < win_y + win_h * 0.18 or y < 160):
                score = min(0.99, score + 0.10)

            candidate = {**el, 'similarity': best_sim, 'score': round(score, 3)}
            candidates.append(candidate)

    candidates.sort(key=lambda c: c['score'], reverse=True)
    return candidates
