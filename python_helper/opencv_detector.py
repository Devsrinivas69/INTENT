"""
OpenCV Detector
Uses OpenCV for:
1. Button/interactive region detection via edge detection + contour analysis
2. Before/after screen diff to detect user-triggered UI state changes
All returned coordinates are ABSOLUTE WINDOWS DESKTOP COORDINATES.
"""

import base64
import io
import cv2
import numpy as np
from PIL import Image


def b64_to_cv2(b64_image: str):
    """Decode base64 PNG to OpenCV BGR image."""
    img_bytes = base64.b64decode(b64_image)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img


def detect_button_regions(b64_image: str, win_x: int = 0, win_y: int = 0, scale_factor: float = 1.0) -> list:
    """
    Detect rectangular button-like regions in a screenshot using contour analysis.
    Returns list of candidate bounding boxes in absolute desktop coordinates.
    """
    try:
        img = b64_to_cv2(b64_image)
        if img is None:
            return []

        h_img, w_img = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Edge detection
        edges = cv2.Canny(gray, 50, 150)
        # Dilate edges slightly to connect nearby edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        regions = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            # Filter by typical button proportions
            aspect = w / max(h, 1)
            area = w * h
            if area < 800 or area > 0.3 * w_img * h_img:
                continue
            if aspect < 1.0 or aspect > 15.0:
                continue
            if h < 18 or h > 80:
                continue

            # Convert to desktop coords
            desk_x = int(x / scale_factor) + win_x
            desk_y = int(y / scale_factor) + win_y
            desk_w = int(w / scale_factor)
            desk_h = int(h / scale_factor)

            regions.append({
                'x': desk_x,
                'y': desk_y,
                'width': desk_w,
                'height': desk_h,
                'source': 'opencv',
                'confidence': 0.70,
            })

        return regions

    except Exception as e:
        return []


def compute_screen_diff(b64_before: str, b64_after: str, threshold: int = 25) -> dict:
    """
    Compare two screenshots and return:
    - changed_regions: list of bounding boxes where the screen changed
    - diff_score: 0-1 overall change magnitude (0 = identical, 1 = completely different)
    - changed: bool (whether a meaningful change occurred)
    All coordinates are in screenshot pixel space (caller applies DPI mapping).
    """
    try:
        img_before = b64_to_cv2(b64_before)
        img_after = b64_to_cv2(b64_after)
        if img_before is None or img_after is None:
            return {'changed': False, 'diff_score': 0.0, 'changed_regions': []}

        # Resize to same dimensions if needed
        if img_before.shape != img_after.shape:
            h, w = img_before.shape[:2]
            img_after = cv2.resize(img_after, (w, h))

        gray_before = cv2.cvtColor(img_before, cv2.COLOR_BGR2GRAY)
        gray_after = cv2.cvtColor(img_after, cv2.COLOR_BGR2GRAY)

        diff = cv2.absdiff(gray_before, gray_after)
        _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)

        # Dilate to merge nearby changed regions
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
        thresh_dilated = cv2.dilate(thresh, kernel, iterations=2)

        contours, _ = cv2.findContours(thresh_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        changed_regions = []
        total_pixels = gray_before.shape[0] * gray_before.shape[1]
        changed_pixels = int(np.sum(thresh > 0))

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w * h < 500:
                continue
            changed_regions.append({'x': x, 'y': y, 'width': w, 'height': h})

        diff_score = changed_pixels / total_pixels

        return {
            'changed': diff_score > 0.005,  # > 0.5% of screen changed
            'diff_score': round(diff_score, 4),
            'changed_regions': changed_regions,
            'changed_pixel_count': changed_pixels,
        }

    except Exception as e:
        return {'changed': False, 'diff_score': 0.0, 'changed_regions': [], 'error': str(e)}


def check_target_still_visible(b64_image: str, desk_x: int, desk_y: int,
                                desk_w: int, desk_h: int,
                                win_x: int = 0, win_y: int = 0,
                                scale_factor: float = 1.0) -> bool:
    """
    Check whether the target region at desktop coords still appears in a new screenshot.
    Converts desktop coords back to screenshot coords and verifies the region is non-empty.
    """
    try:
        img = b64_to_cv2(b64_image)
        if img is None:
            return False

        # Convert desktop coords back to screenshot pixel coords
        ss_x = int((desk_x - win_x) * scale_factor)
        ss_y = int((desk_y - win_y) * scale_factor)
        ss_w = int(desk_w * scale_factor)
        ss_h = int(desk_h * scale_factor)

        h_img, w_img = img.shape[:2]
        ss_x = max(0, min(ss_x, w_img - 1))
        ss_y = max(0, min(ss_y, h_img - 1))
        ss_w = min(ss_w, w_img - ss_x)
        ss_h = min(ss_h, h_img - ss_y)

        if ss_w <= 0 or ss_h <= 0:
            return False

        region = img[ss_y:ss_y + ss_h, ss_x:ss_x + ss_w]
        # If region has meaningful pixel content (not black / transparent) it still exists
        mean_brightness = float(np.mean(region))
        return mean_brightness > 5.0  # non-trivial content

    except Exception:
        return False
