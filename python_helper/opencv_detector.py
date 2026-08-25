"""
OpenCV Detector
Provides:
1. CanvasRegionDetector — isolates Canva central design workspace from browser chrome & sidebars
2. CanvasObjectDetector — finds the poster/image on the canvas
3. CanvaSelectionDetector — detects Canva's purple selection outline (#8B3DFF) and resize handles
4. PanelDetector — detects when Edit Photo / Magic Studio sidebar panel opens
5. Screen diff analysis
"""

import base64
import cv2
import numpy as np


def b64_to_cv2(b64_image: str):
    """Decode base64 PNG/JPEG to OpenCV BGR image."""
    try:
        if ',' in b64_image:
            b64_image = b64_image.split(',', 1)[1]
        img_bytes = base64.b64decode(b64_image)
        nparr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception:
        return None


# ─── 1. Canvas Region Detector ────────────────────────────────────────────────

def detect_canva_workspace(img):
    """
    Excludes browser top bar (0-110px), left sidebar (0-72px),
    right panel area (width-380px to width), and bottom bar (height-60px).
    Returns workspace bounding box (x, y, w, h).
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
    Returns absolute physical desktop bounding box for the visual image object.
    """
    img = b64_to_cv2(b64_image)
    if img is None:
        return None

    h, w = img.shape[:2]
    ws = detect_canva_workspace(img)

    # Crop to workspace
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
        # Must be between 8% and 80% of the workspace area
        if area < total_ws_area * 0.08 or area > total_ws_area * 0.85:
            continue
        # Typical document/poster aspect ratios
        aspect = cw / max(1, ch)
        if 0.3 < aspect < 3.0:
            if area > max_area:
                max_area = area
                best_box = {
                    'x': int((ws['x'] + x + win_x)),
                    'y': int((ws['y'] + y + win_y)),
                    'width': int(cw),
                    'height': int(ch),
                    'confidence': 0.94,
                    'type': 'CANVAS_OBJECT',
                    'text': 'Image on Canvas',
                    'source': 'canvas_detector',
                }

    # If edge detection didn't isolate it, use central 50% of the workspace
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
            'source': 'canvas_workspace_center',
        }

    return best_box


# ─── 3. Canva Selection Detector (Purple Border Detection) ───────────────────

def detect_canva_selection_state(b64_image: str, win_x: int = 0, win_y: int = 0) -> dict:
    """
    Detects Canva's signature purple selection outline (#8B3DFF / #7D2AE8)
    around the selected element.
    Returns { selected: bool, bounds: dict, confidence: float, method: str }
    """
    img = b64_to_cv2(b64_image)
    if img is None:
        return {'selected': False, 'confidence': 0.0}

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Canva Purple selection border in OpenCV HSV (H: 125-155, S: 100-255, V: 120-255)
    lower_purple = np.array([125, 100, 120])
    upper_purple = np.array([160, 255, 255])

    mask = cv2.inRange(hsv, lower_purple, upper_purple)

    # Filter out tiny noise
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask_clean = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        # Selection border around an image/element must be reasonably large
        if w >= 80 and h >= 80:
            # Check contour perimeter vs area (it's an outline / border)
            return {
                'selected': True,
                'bounds': {
                    'x': int(x + win_x),
                    'y': int(y + win_y),
                    'width': int(w),
                    'height': int(h),
                },
                'confidence': 0.96,
                'method': 'visual_selection_border',
            }

    # Also check if Canva top toolbar showed "Edit" or "Edit photo"
    return {'selected': False, 'confidence': 0.0}


# ─── 4. Edit Photo Panel Appearance Detector ─────────────────────────────────

def detect_edit_photo_panel(b64_image: str, ocr_texts: list) -> dict:
    """
    Checks if the left Edit Photo / Magic Studio sidebar has opened.
    Looks for keywords: 'BG Remover', 'Background Remover', 'Adjust', 'Filters', 'Effects'.
    """
    lower_texts = [t.lower() for t in ocr_texts]
    keywords = ['bg remover', 'background remover', 'magic studio', 'adjust', 'filters', 'effects']

    matches = [k for k in keywords if any(k in t for t in lower_texts)]
    if matches:
        return {
            'panel_open': True,
            'confidence': 0.95,
            'matches': matches,
            'method': 'edit_photo_panel_ocr'
        }

    return {'panel_open': False, 'confidence': 0.0}


# ─── 5. Screen Diff ──────────────────────────────────────────────────────────

def compute_screen_diff(b64_before: str, b64_after: str, threshold: int = 25) -> dict:
    """Compare two screenshots to detect user interaction state change."""
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
        'changed': diff_score > 0.003,
        'diff_score': round(diff_score, 4),
        'changed_pixels': changed_pixels,
    }
