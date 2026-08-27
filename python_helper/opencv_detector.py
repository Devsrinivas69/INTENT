"""
OpenCV Detector — Deterministic Vision & State Transition Engine
Provides:
1. detect_canva_workspace — isolates Canva design workspace from browser chrome & sidebars
2. detect_canvas_image_object — isolates central design poster/image on canvas
3. detect_canva_selection_state — detects Canva's signature purple selection outline (#8B3DFF) and verifies IoU with target
4. detect_edit_photo_panel — detects opening of left Magic Studio / Edit Photo panel
5. detect_animation_panel — detects opening of left Animation styles panel
6. verify_canvas_background_removed — compares baseline vs after-action canvas pixels
"""

import base64
import cv2
import numpy as np


def b64_to_cv2(b64_image: str):
    """Decode base64 PNG/JPEG to OpenCV BGR image."""
    try:
        if not b64_image:
            return None
        if ',' in b64_image:
            b64_image = b64_image.split(',', 1)[1]
        img_bytes = base64.b64decode(b64_image)
        nparr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def calculate_iou(boxA: dict, boxB: dict) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes {x, y, width, height}."""
    xA = max(boxA['x'], boxB['x'])
    yA = max(boxA['y'], boxB['y'])
    xB = min(boxA['x'] + boxA['width'], boxB['x'] + boxB['width'])
    yB = min(boxA['y'] + boxA['height'], boxB['y'] + boxB['height'])

    interWidth = max(0, xB - xA)
    interHeight = max(0, yB - yA)
    interArea = interWidth * interHeight

    boxAArea = boxA['width'] * boxA['height']
    boxBArea = boxB['width'] * boxB['height']

    unionArea = boxAArea + boxBArea - interArea
    return interArea / float(unionArea) if unionArea > 0 else 0.0


# ─── 1. Canvas Workspace Isolation ───────────────────────────────────────────

def detect_canva_workspace(img):
    """
    Excludes browser top chrome (0-110px), left sidebar (0-72px),
    right panel area (width-390px to width), and bottom bar (height-60px).
    """
    h, w = img.shape[:2]
    ws_x = 72
    ws_y = 110
    ws_w = max(200, w - ws_x - 390)
    ws_h = max(200, h - ws_y - 60)
    return {'x': ws_x, 'y': ws_y, 'width': ws_w, 'height': ws_h}


# ─── 2. Canvas Object / Poster Detector (Level 1 Target) ─────────────────────

def detect_canvas_image_object(b64_image: str, win_x: int = 0, win_y: int = 0, scale_factor: float = 1.0) -> dict | None:
    """
    Finds the prominent central design canvas/poster in Canva editor.
    Returns physical desktop bounding box for the visual image object.
    """
    img = b64_to_cv2(b64_image)
    if img is None:
        return None

    h, w = img.shape[:2]
    ws = detect_canva_workspace(img)

    # First check if there is an active purple selection box (selected image)
    sel = detect_canva_selection_state(b64_image, win_x=win_x, win_y=win_y)
    if sel.get('selected') and sel.get('bounds'):
        sb = sel['bounds']
        return {
            'x': sb['x'],
            'y': sb['y'],
            'width': sb['width'],
            'height': sb['height'],
            'confidence': 0.98,
            'type': 'CANVAS_OBJECT',
            'text': 'Image on Canvas',
            'source': 'canva_purple_selection',
        }

    # Otherwise detect the image contours on workspace
    ws_crop = img[ws['y']:ws['y']+ws['height'], ws['x']:ws['x']+ws['width']]
    if ws_crop.size == 0:
        return None

    gray = cv2.cvtColor(ws_crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 100)

    # Dilate edges to connect broken contours
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated = cv2.dilate(edges, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_box = None
    max_area = 0
    total_ws_area = ws['width'] * ws['height']

    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        area = cw * ch
        # Must be between 8% and 85% of workspace area
        if area < total_ws_area * 0.08 or area > total_ws_area * 0.85:
            continue
        aspect = cw / max(1, ch)
        if 0.3 < aspect < 3.0:
            if area > max_area:
                max_area = area
                best_box = {
                    'x': int(ws['x'] + x + win_x),
                    'y': int(ws['y'] + y + win_y),
                    'width': int(cw),
                    'height': int(ch),
                    'confidence': 0.94,
                    'type': 'CANVAS_OBJECT',
                    'text': 'Image on Canvas',
                    'source': 'opencv_canvas',
                }

    # Fallback to workspace center if contour was not closed
    if not best_box:
        cw = int(ws['width'] * 0.45)
        ch = int(ws['height'] * 0.65)
        cx = int(ws['x'] + (ws['width'] - cw) / 2 + win_x)
        cy = int(ws['y'] + (ws['height'] - ch) / 2 + win_y)
        best_box = {
            'x': cx,
            'y': cy,
            'width': cw,
            'height': ch,
            'confidence': 0.88,
            'type': 'CANVAS_OBJECT',
            'text': 'Image on Canvas',
            'source': 'opencv_canvas_center',
        }

    return best_box


# ─── 3. Canva Selection Detector (Purple Outline with IoU Check) ─────────────

def detect_canva_selection_state(b64_image: str, target_bounds: dict = None, win_x: int = 0, win_y: int = 0) -> dict:
    """
    Detects Canva's signature purple selection outline (#8B3DFF / #7D2AE8)
    around the selected element.
    If target_bounds is provided, calculates IoU to ensure the selection is for the intended target.
    """
    img = b64_to_cv2(b64_image)
    if img is None:
        return {'selected': False, 'confidence': 0.0}

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Canva Purple selection border in OpenCV HSV (H: 120-160, S: 90-255, V: 100-255)
    lower_purple = np.array([120, 90, 100])
    upper_purple = np.array([160, 255, 255])

    mask = cv2.inRange(hsv, lower_purple, upper_purple)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask_clean = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_match = None
    best_iou = 0.0

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w >= 60 and h >= 60:
            found_box = {
                'x': int(x + win_x),
                'y': int(y + win_y),
                'width': int(w),
                'height': int(h),
            }

            if target_bounds:
                iou = calculate_iou(found_box, target_bounds)
                if iou > best_iou:
                    best_iou = iou
                    best_match = found_box
            else:
                best_match = found_box
                best_iou = 1.0

    if best_match:
        if target_bounds and best_iou < 0.30:
            return {
                'selected': False,
                'confidence': 0.3,
                'reason': f'Purple outline detected but does not match target image (IoU={best_iou:.2f})',
            }

        return {
            'selected': True,
            'bounds': best_match,
            'confidence': 0.96,
            'method': 'visual_selection_border',
            'iou': round(best_iou, 3),
        }

    return {'selected': False, 'confidence': 0.0}


# ─── 4. Edit Photo Panel Appearance Detector ─────────────────────────────────

def detect_edit_photo_panel(b64_image: str, ocr_items: list, win_x: int = 0, win_y: int = 0) -> dict:
    """
    Checks if the left Edit Photo / Magic Studio sidebar panel has opened.
    Crucially: inspects only elements in the LEFT SIDEBAR region (x < win_x + 450, y > win_y + 120).
    Requires matching at least 2 distinct panel tool keywords (or a clear Magic Studio header).
    """
    panel_items = []
    for item in ocr_items:
        text = item.get('text', '') if isinstance(item, dict) else str(item)
        x = item.get('x', 0) if isinstance(item, dict) else 0
        y = item.get('y', 0) if isinstance(item, dict) else 0

        # Filter strictly to left sidebar panel area
        if isinstance(item, dict):
            if x > win_x + 450 or y < win_y + 110:
                continue
        panel_items.append(text.lower())

    keywords = ['magic studio', 'bg remover', 'background remover', 'adjust', 'filters', 'effects', 'magic edit', 'magic expand', 'intensity', 'tools', 'shadows', 'autofocus']
    matches = [k for k in keywords if any(k in t for t in panel_items)]

    # Need at least 2 panel tool indicators or 'magic studio' to confirm the left panel is open
    if 'magic studio' in matches or len(matches) >= 2:
        return {
            'panel_open': True,
            'confidence': 0.95,
            'matches': matches,
            'method': 'edit_photo_panel_ocr',
        }

    return {'panel_open': False, 'confidence': 0.0}


# ─── 5. Animation Panel Appearance Detector ──────────────────────────────────

def detect_animation_panel(ocr_items: list, win_x: int = 0, win_y: int = 0) -> dict:
    """
    Checks if the left Animation styles sidebar has opened.
    Filters to left sidebar panel area.
    """
    panel_items = []
    for item in ocr_items:
        text = item.get('text', '') if isinstance(item, dict) else str(item)
        x = item.get('x', 0) if isinstance(item, dict) else 0
        y = item.get('y', 0) if isinstance(item, dict) else 0

        if isinstance(item, dict):
            if x > win_x + 450 or y < win_y + 110:
                continue
        panel_items.append(text.lower())

    keywords = ['fade', 'pan', 'rise', 'pop', 'wipe', 'breathe', 'page animations', 'photo animations', 'element animations', 'basics', 'scale']
    matches = [k for k in keywords if any(k in t for t in panel_items)]

    if len(matches) >= 2:
        return {
            'panel_open': True,
            'confidence': 0.95,
            'matches': matches,
            'method': 'animation_panel_ocr',
        }

    return {'panel_open': False, 'confidence': 0.0}


# ─── 6. Verify Canvas Background Removal Result ──────────────────────────────

def verify_canvas_background_removed(b64_baseline: str, b64_current: str, target_bounds: dict = None) -> dict:
    """
    Compares the canvas area between baseline and current state to verify background removal.
    """
    img_base = b64_to_cv2(b64_baseline)
    img_curr = b64_to_cv2(b64_current)
    if img_base is None or img_curr is None:
        return {'completed': False, 'confidence': 0.0}

    if img_base.shape != img_curr.shape:
        h, w = img_base.shape[:2]
        img_curr = cv2.resize(img_curr, (w, h))

    # Crop to target region if provided
    if target_bounds:
        tx = max(0, int(target_bounds['x']))
        ty = max(0, int(target_bounds['y']))
        tw = min(img_base.shape[1] - tx, int(target_bounds['width']))
        th = min(img_base.shape[0] - ty, int(target_bounds['height']))
        crop_base = img_base[ty:ty+th, tx:tx+tw]
        crop_curr = img_curr[ty:ty+th, tx:tx+tw]
    else:
        crop_base = img_base
        crop_curr = img_curr

    if crop_base.size == 0 or crop_curr.size == 0:
        return {'completed': False, 'confidence': 0.0}

    gray_base = cv2.cvtColor(crop_base, cv2.COLOR_BGR2GRAY)
    gray_curr = cv2.cvtColor(crop_curr, cv2.COLOR_BGR2GRAY)

    diff = cv2.absdiff(gray_base, gray_curr)
    _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)

    total_pixels = gray_base.shape[0] * gray_base.shape[1]
    changed_pixels = int(np.sum(thresh > 0))
    ratio = changed_pixels / max(1, total_pixels)

    # Significant change in target region (> 8% of pixels changed in canvas region)
    if ratio > 0.08:
        return {
            'completed': True,
            'confidence': 0.94,
            'evidence': f'Canvas visual transformation confirmed ({ratio*100:.1f}% region pixels modified)',
            'method': 'canvas_pixel_diff',
        }

    return {'completed': False, 'confidence': 0.3}


# ─── 7. General Screen Diff ──────────────────────────────────────────────────

def compute_screen_diff(b64_before: str, b64_after: str, threshold: int = 25) -> dict:
    """Compare two screenshots to detect UI state transition."""
    img_before = b64_to_cv2(b64_before)
    img_after = b64_to_cv2(b64_after)
    if img_before is None or img_after is None:
        return {'changed': False, 'diff_score': 0.0}

    if img_before.shape != img_after.shape:
        h, w = img_before.shape[:2]
        img_after = cv2.resize(img_after, (w, h))

    gray_before = cv2.cvtColor(img_before, cv2.COLOR_BGR2GRAY)
    gray_after = cv2.cvtColor(img_after, cv2.COLOR_BGR2GRAY)

    diff = cv2.absdiff(gray_before, gray_after)
    _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

    total_pixels = gray_before.shape[0] * gray_before.shape[1]
    changed_pixels = int(np.sum(thresh > 0))
    diff_score = changed_pixels / total_pixels

    return {
        'changed': diff_score > 0.015,
        'diff_score': round(diff_score, 4),
        'changed_pixels': changed_pixels,
    }
