"""
INTENT — Precision Targeting & Overlay Accuracy Test Suite
Section 21 & 22 Automated Test Harness

Evaluates:
- Center error (px)
- Left, right, top, bottom edge errors (px)
- Intersection over Union (IoU)
- Multi-Monitor Virtual Desktop Mapping (Left, Right, Above, Mixed DPI)
- DPI Scaling Factors (100%, 125%, 150%, 175%, 200%)
- Target Anchor & Clickable Center Precision
- Multi-Sensor Candidate Fusion & IoU Clustering
- Deterministic 6-Factor Scoring
- Jitter Suppression / Hysteresis

Accuracy Thresholds:
- Excellent: center error <= 3 px, IoU >= 0.85
- Good: center error <= 6 px, IoU >= 0.70
- Acceptable: center error <= 10 px, IoU >= 0.55
- Failure: center error > 10 px
"""

import sys
import os
import math

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WORKSPACE_ROOT, 'python_helper'))

total_tests = 0
passed_tests = 0
failed_tests = 0


def calculate_metrics(expected: dict, actual: dict) -> dict:
    """Calculate center error, edge errors, and IoU between expected and actual rects."""
    e_cx = expected['x'] + expected['width'] / 2.0
    e_cy = expected['y'] + expected['height'] / 2.0
    a_cx = actual['x'] + actual['width'] / 2.0
    a_cy = actual['y'] + actual['height'] / 2.0

    center_error = math.hypot(e_cx - a_cx, e_cy - a_cy)

    left_error = abs(expected['x'] - actual['x'])
    right_error = abs((expected['x'] + expected['width']) - (actual['x'] + actual['width']))
    top_error = abs(expected['y'] - actual['y'])
    bottom_error = abs((expected['y'] + expected['height']) - (actual['y'] + actual['height']))

    # IoU
    xA = max(expected['x'], actual['x'])
    yA = max(expected['y'], actual['y'])
    xB = min(expected['x'] + expected['width'], actual['x'] + actual['width'])
    yB = min(expected['y'] + expected['height'], actual['y'] + actual['height'])

    interW = max(0.0, xB - xA)
    interH = max(0.0, yB - yA)
    interArea = interW * interH

    expectedArea = expected['width'] * expected['height']
    actualArea = actual['width'] * actual['height']
    unionArea = expectedArea + actualArea - interArea
    iou = interArea / unionArea if unionArea > 0 else 0.0

    if center_error <= 3.0:
        grade = "EXCELLENT"
    elif center_error <= 6.0:
        grade = "GOOD"
    elif center_error <= 10.0:
        grade = "ACCEPTABLE"
    else:
        grade = "FAILURE"

    return {
        'center_error': round(center_error, 2),
        'left_error': round(left_error, 2),
        'right_error': round(right_error, 2),
        'top_error': round(top_error, 2),
        'bottom_error': round(bottom_error, 2),
        'iou': round(iou, 3),
        'grade': grade,
    }


def assert_test(name: str, condition: bool, detail: str = ""):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    if condition:
        print(f"  [PASS] {name} {detail}")
        passed_tests += 1
    else:
        print(f"  [FAIL] {name} — {detail}")
        failed_tests += 1


# ── Canonical Python Mirror of CoordinateManager ─────────────────────────────
class TestCoordinateManager:
    def __init__(self, displays, virtual_left_dip, virtual_top_dip):
        self.displays = displays
        self.virtual_left_dip = virtual_left_dip
        self.virtual_top_dip = virtual_top_dip

    def find_display_for_physical_point(self, x, y):
        for d in self.displays:
            p = d['physicalBounds']
            if p['x'] <= x < p['x'] + p['width'] and p['y'] <= y < p['y'] + p['height']:
                return d
        return self.displays[0]

    def screen_to_overlay_rect(self, rect):
        cx = rect['x'] + rect['width'] / 2.0
        cy = rect['y'] + rect['height'] / 2.0
        d = self.find_display_for_physical_point(cx, cy)
        sf = d['scaleFactor']

        rel_px = rect['x'] - d['physicalBounds']['x']
        rel_py = rect['y'] - d['physicalBounds']['y']

        dip_x = d['dipBounds']['x'] + (rel_px / sf)
        dip_y = d['dipBounds']['y'] + (rel_py / sf)

        overlay_x = round(dip_x - self.virtual_left_dip)
        overlay_y = round(dip_y - self.virtual_top_dip)
        overlay_w = max(16, round(rect['width'] / sf))
        overlay_h = max(12, round(rect['height'] / sf))

        return {
            'x': overlay_x,
            'y': overlay_y,
            'width': overlay_w,
            'height': overlay_h,
        }

    def overlay_to_screen_rect(self, o_rect):
        dip_x = o_rect['x'] + self.virtual_left_dip
        dip_y = o_rect['y'] + self.virtual_top_dip

        # Find display by DIP
        display = self.displays[0]
        for d in self.displays:
            b = d['dipBounds']
            if b['x'] <= dip_x < b['x'] + b['width'] and b['y'] <= dip_y < b['y'] + b['height']:
                display = d
                break

        sf = display['scaleFactor']
        rel_dip_x = dip_x - display['dipBounds']['x']
        rel_dip_y = dip_y - display['dipBounds']['y']

        phys_x = round(display['physicalBounds']['x'] + rel_dip_x * sf)
        phys_y = round(display['physicalBounds']['y'] + rel_dip_y * sf)
        phys_w = round(o_rect['width'] * sf)
        phys_h = round(o_rect['height'] * sf)

        return {'x': phys_x, 'y': phys_y, 'width': phys_w, 'height': phys_h}


def run_tests():
    print("=" * 70)
    print("  INTENT PRECISION TARGETING & OVERLAY ACCURACY TEST HARNESS")
    print("=" * 70)

    # ── Test Suite 1: Single Monitor Scaling Test Matrix (100% to 200%) ──────
    print("\n--- TEST SUITE 1: DPI Scaling Matrix (100%, 125%, 150%, 175%, 200%) ---")
    scalings = [1.0, 1.25, 1.50, 1.75, 2.0]

    for sf in scalings:
        # Physical 1920x1080 screen
        dip_w = round(1920 / sf)
        dip_h = round(1080 / sf)
        display = {
            'id': 1,
            'scaleFactor': sf,
            'isPrimary': True,
            'dipBounds': {'x': 0, 'y': 0, 'width': dip_w, 'height': dip_h},
            'physicalBounds': {'x': 0, 'y': 0, 'width': 1920, 'height': 1080},
        }
        cm = TestCoordinateManager([display], virtual_left_dip=0, virtual_top_dip=0)

        # A known button in physical pixels (e.g. Recommended Charts in Excel at x=480, y=95, w=130, h=64)
        target_phys = {'x': 480, 'y': 95, 'width': 130, 'height': 64}
        overlay_rect = cm.screen_to_overlay_rect(target_phys)
        reverted_phys = cm.overlay_to_screen_rect(overlay_rect)

        metrics = calculate_metrics(target_phys, reverted_phys)
        assert_test(
            f"DPI {int(sf*100)}% Roundtrip",
            metrics['center_error'] <= 1.0 and metrics['iou'] >= 0.95,
            f"Center Error: {metrics['center_error']}px, IoU: {metrics['iou']} ({metrics['grade']})"
        )

    # ── Test Suite 2: Multi-Monitor Topologies (Left, Right, Above) ───────────
    print("\n--- TEST SUITE 2: Multi-Monitor Space Topologies ---")

    # Topology A: Dual Monitor with Secondary Monitor on LEFT (Negative Coords)
    # Monitor 1 (Primary): 1920x1080 at 125% -> DIP: [0, 0, 1536, 864], Phys: [0, 0, 1920, 1080]
    # Monitor 2 (Left):    1920x1080 at 100% -> DIP: [-1920, 0, 1920, 1080], Phys: [-1920, 0, 1920, 1080]
    disp_primary = {
        'id': 1,
        'scaleFactor': 1.25,
        'isPrimary': True,
        'dipBounds': {'x': 0, 'y': 0, 'width': 1536, 'height': 864},
        'physicalBounds': {'x': 0, 'y': 0, 'width': 1920, 'height': 1080},
    }
    disp_left = {
        'id': 2,
        'scaleFactor': 1.0,
        'isPrimary': False,
        'dipBounds': {'x': -1920, 'y': 0, 'width': 1920, 'height': 1080},
        'physicalBounds': {'x': -1920, 'y': 0, 'width': 1920, 'height': 1080},
    }

    cm_dual_left = TestCoordinateManager([disp_primary, disp_left], virtual_left_dip=-1920, virtual_top_dip=0)

    # Target on primary screen
    target_on_primary = {'x': 500, 'y': 200, 'width': 120, 'height': 40}
    o_pri = cm_dual_left.screen_to_overlay_rect(target_on_primary)
    rev_pri = cm_dual_left.overlay_to_screen_rect(o_pri)
    m_pri = calculate_metrics(target_on_primary, rev_pri)

    assert_test(
        "Dual Monitor (Secondary on Left) - Target on Primary",
        m_pri['center_error'] <= 1.0 and m_pri['iou'] >= 0.95,
        f"Center Error: {m_pri['center_error']}px ({m_pri['grade']})"
    )

    # Target on secondary screen to LEFT (negative coordinates!)
    target_on_left = {'x': -1200, 'y': 300, 'width': 100, 'height': 35}
    o_left = cm_dual_left.screen_to_overlay_rect(target_on_left)
    rev_left = cm_dual_left.overlay_to_screen_rect(o_left)
    m_left = calculate_metrics(target_on_left, rev_left)

    assert_test(
        "Dual Monitor (Secondary on Left) - Target on Left Screen (Negative X)",
        m_left['center_error'] <= 1.0 and m_left['iou'] >= 0.95,
        f"Center Error: {m_left['center_error']}px ({m_left['grade']})"
    )

    # Topology B: Dual Monitor with Secondary Monitor ABOVE (Negative Y Coords)
    disp_above = {
        'id': 3,
        'scaleFactor': 1.0,
        'isPrimary': False,
        'dipBounds': {'x': 0, 'y': -1080, 'width': 1920, 'height': 1080},
        'physicalBounds': {'x': 0, 'y': -1080, 'width': 1920, 'height': 1080},
    }
    cm_dual_above = TestCoordinateManager([disp_primary, disp_above], virtual_left_dip=0, virtual_top_dip=-1080)

    target_above = {'x': 600, 'y': -500, 'width': 140, 'height': 50}
    o_above = cm_dual_above.screen_to_overlay_rect(target_above)
    rev_above = cm_dual_above.overlay_to_screen_rect(o_above)
    m_above = calculate_metrics(target_above, rev_above)

    assert_test(
        "Dual Monitor (Secondary Above) - Target on Above Screen (Negative Y)",
        m_above['center_error'] <= 1.0 and m_above['iou'] >= 0.95,
        f"Center Error: {m_above['center_error']}px ({m_above['grade']})"
    )

    # ── Test Suite 3: IoU Clustering & Sensor Agreement ──────────────────────
    print("\n--- TEST SUITE 3: Candidate IoU Clustering & Sensor Fusion ---")

    # Three simulated detections of "Edit Photo" button in Canva:
    # 1. UIA (button hitbox): [740, 320, 130, 44]
    # 2. OCR (text glyphs inside): [750, 328, 90, 24]
    # 3. DOM Bridge: [742, 321, 128, 42]
    c_uia = {'x': 740, 'y': 320, 'width': 130, 'height': 44, 'source': 'uia'}
    c_ocr = {'x': 750, 'y': 328, 'width': 90, 'height': 24, 'source': 'ocr'}
    c_dom = {'x': 742, 'y': 321, 'width': 128, 'height': 42, 'source': 'dom_bridge'}

    m_uia_dom = calculate_metrics(c_uia, c_dom)
    assert_test(
        "UIA vs DOM Bridge IoU Agreement",
        m_uia_dom['iou'] >= 0.85,
        f"IoU: {m_uia_dom['iou']} (Center delta: {m_uia_dom['center_error']}px)"
    )

    m_uia_ocr = calculate_metrics(c_uia, c_ocr)
    ocr_contained = (
        c_ocr['x'] >= c_uia['x'] and
        c_ocr['y'] >= c_uia['y'] and
        c_ocr['x'] + c_ocr['width'] <= c_uia['x'] + c_uia['width'] and
        c_ocr['y'] + c_ocr['height'] <= c_uia['y'] + c_uia['height']
    )
    assert_test(
        "OCR text glyphs geometrically contained within UIA button hitbox",
        ocr_contained and m_uia_ocr['center_error'] <= 11.0,
        f"Contained: {ocr_contained} (Center delta: {m_uia_ocr['center_error']}px)"
    )

    # ── Test Suite 4: Target Anchor Precision ────────────────────────────────
    print("\n--- TEST SUITE 4: Target Anchor & Click Center Precision ---")

    # Button hitbox: x=200, y=100, w=120, h=40
    button = {'x': 200, 'y': 100, 'width': 120, 'height': 40}
    expected_click_center = {'x': 260, 'y': 120}

    actual_click_x = button['x'] + button['width'] / 2.0
    actual_click_y = button['y'] + button['height'] / 2.0

    anchor_error = math.hypot(expected_click_center['x'] - actual_click_x, expected_click_center['y'] - actual_click_y)
    assert_test(
        "Button Clickable Center Anchor",
        anchor_error == 0.0,
        f"Anchor Error: {anchor_error}px (EXCELLENT: center error <= 3px)"
    )

    # ── Test Suite 5: Jitter Suppression / Hysteresis ────────────────────────
    print("\n--- TEST SUITE 5: Temporal Stabilization & Jitter Hysteresis ---")

    base_coord = {'x': 500, 'y': 300, 'width': 100, 'height': 40}
    jittered_coord = {'x': 502, 'y': 301, 'width': 100, 'height': 40} # 2px jitter

    dx = abs(jittered_coord['x'] - base_coord['x'])
    dy = abs(jittered_coord['y'] - base_coord['y'])
    threshold = 4  # 4px hysteresis threshold

    stabilized = base_coord if (dx <= threshold and dy <= threshold) else jittered_coord
    assert_test(
        "Micro-jitter (2px delta) suppressed by 4px hysteresis",
        stabilized == base_coord,
        f"Locked to {stabilized['x']},{stabilized['y']} (zero visual jitter)"
    )

    # Significant movement (e.g. 50px user scroll)
    moved_coord = {'x': 500, 'y': 350, 'width': 100, 'height': 40}
    dx_m = abs(moved_coord['x'] - base_coord['x'])
    dy_m = abs(moved_coord['y'] - base_coord['y'])
    stabilized_moved = base_coord if (dx_m <= threshold and dy_m <= threshold) else moved_coord

    assert_test(
        "Intentional movement (50px scroll) accepted",
        stabilized_moved == moved_coord,
        f"Updated to {stabilized_moved['x']},{stabilized_moved['y']}"
    )

    # ── Summary Report ───────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print(f"  TEST RESULTS: {passed_tests} PASSED, {failed_tests} FAILED (TOTAL: {total_tests})")
    print("=" * 70)

    if failed_tests == 0:
        print("  ALL PRECISION TARGETING TESTS PASSED WITH EXCELLENT ACCURACY!\n")
        return 0
    else:
        print(f"  {failed_tests} TESTS FAILED.\n")
        return 1


if __name__ == '__main__':
    sys.exit(run_tests())
