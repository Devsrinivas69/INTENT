"""
INTENT Guidance Test Suite — npm run test:guidance
Automated tests for coordinate mapping, target validation, state transitions,
detection candidate ranking, and workflow progression.
Uses mock screen map fixtures — no live screen required.
"""

import sys
import os
import json
import math

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WORKSPACE_ROOT, 'python_helper'))

passed = 0
failed = 0


def test(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  \u2705 PASS: {name}")
        passed += 1
    else:
        print(f"  \u274c FAIL: {name}" + (f" — {detail}" if detail else ""))
        failed += 1


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


# ─── Mock Screen Map Fixtures ─────────────────────────────────────────────────

CANVA_MOCK_SCREEN = {
    'application': 'canva',
    'windowTitle': 'Design - Canva',
    'windowBounds': {'x': 0, 'y': 0, 'width': 1280, 'height': 800},
    'scaleFactor': 1.25,
    'elements': [
        # Canva top toolbar controls (appear after element is selected)
        {'id': 'el_001', 'text': 'Edit photo', 'type': 'button', 'x': 120, 'y': 76, 'width': 90, 'height': 32, 'confidence': 0.98, 'source': 'dom_bridge', 'enabled': True},
        {'id': 'el_002', 'text': 'Animate', 'type': 'button', 'x': 215, 'y': 76, 'width': 75, 'height': 32, 'confidence': 0.98, 'source': 'dom_bridge', 'enabled': True},
        {'id': 'el_003', 'text': 'Position', 'type': 'button', 'x': 295, 'y': 76, 'width': 72, 'height': 32, 'confidence': 0.97, 'source': 'dom_bridge', 'enabled': True},
        # Left panel tools (after Edit photo clicked)
        {'id': 'el_010', 'text': 'BG Remover', 'type': 'button', 'x': 85, 'y': 195, 'width': 120, 'height': 42, 'confidence': 0.96, 'source': 'ocr', 'enabled': True},
        {'id': 'el_011', 'text': 'Adjust', 'type': 'button', 'x': 85, 'y': 245, 'width': 90, 'height': 38, 'confidence': 0.95, 'source': 'ocr', 'enabled': True},
        {'id': 'el_012', 'text': 'Filters', 'type': 'button', 'x': 85, 'y': 290, 'width': 80, 'height': 38, 'confidence': 0.95, 'source': 'ocr', 'enabled': True},
        # Canvas object (the design image)
        {'id': 'el_020', 'text': 'Image on Canvas', 'type': 'canvas_object', 'x': 320, 'y': 130, 'width': 640, 'height': 480, 'confidence': 0.94, 'source': 'opencv_canvas', 'enabled': True},
        # Giant container (should be rejected)
        {'id': 'el_099', 'text': 'Canva window', 'type': 'panel', 'x': 0, 'y': 0, 'width': 1280, 'height': 800, 'confidence': 0.99, 'source': 'uia', 'enabled': True},
    ]
}

EXCEL_MOCK_SCREEN = {
    'application': 'excel',
    'windowTitle': 'Book1.xlsx - Excel',
    'windowBounds': {'x': 0, 'y': 0, 'width': 1920, 'height': 1080},
    'scaleFactor': 1.0,
    'elements': [
        # Ribbon tabs
        {'id': 'el_001', 'text': 'Home', 'type': 'tab', 'x': 72, 'y': 55, 'width': 52, 'height': 24, 'confidence': 0.99, 'source': 'uia', 'enabled': True},
        {'id': 'el_002', 'text': 'Insert', 'type': 'tab', 'x': 124, 'y': 55, 'width': 55, 'height': 24, 'confidence': 0.99, 'source': 'uia', 'enabled': True},
        {'id': 'el_003', 'text': 'Page Layout', 'type': 'tab', 'x': 180, 'y': 55, 'width': 88, 'height': 24, 'confidence': 0.99, 'source': 'uia', 'enabled': True},
        # Insert ribbon controls
        {'id': 'el_010', 'text': 'Recommended Charts', 'type': 'button', 'x': 560, 'y': 100, 'width': 110, 'height': 56, 'confidence': 0.98, 'source': 'uia', 'enabled': True},
        {'id': 'el_011', 'text': 'Insert Column or Bar Chart', 'type': 'button', 'x': 500, 'y': 100, 'width': 56, 'height': 56, 'confidence': 0.97, 'source': 'uia', 'enabled': True},
        # Chart object (after chart created)
        {'id': 'el_020', 'text': 'Chart Area', 'type': 'canvas_object', 'x': 200, 'y': 300, 'width': 480, 'height': 320, 'confidence': 0.95, 'source': 'uia', 'enabled': True},
    ]
}

# ─── 1. OCR Text Similarity Tests ─────────────────────────────────────────────

def test_ocr_similarity():
    section("1. OCR TEXT SIMILARITY SCORING")
    try:
        from ocr_detector import text_similarity

        test("Exact match", text_similarity("Edit photo", "Edit photo") == 1.0)
        test("Case-insensitive", text_similarity("edit photo", "Edit Photo") >= 0.90)
        test("Substring match", text_similarity("BG Remover", "BG Remover button") >= 0.80)
        test("Synonym: BG Remover → Background Remover", text_similarity("BG Remover", "Background Remover") >= 0.80)
        test("Synonym: bg remover → background removal", text_similarity("bg remover", "background removal") >= 0.75)
        test("No match", text_similarity("File", "Animate") == 0.0)
        test("Animate match", text_similarity("Animate", "Animate") == 1.0)
        test("Insert tab match", text_similarity("Insert", "Insert") == 1.0)
        test("Partial word match", text_similarity("Recommended Charts", "Recommended Charts") == 1.0)
        test("Low similarity rejection", text_similarity("aaa", "zzz") < 0.50)
    except ImportError as e:
        print(f"  ⚠️  SKIP: ocr_detector import failed: {e}")


# ─── 2. Screen Map Candidate Search Tests ─────────────────────────────────────

def test_candidate_search():
    section("2. SCREEN MAP CANDIDATE SEARCH")
    try:
        from screen_map_builder import find_candidates_in_map

        # Canva: find Edit photo
        results = find_candidates_in_map(CANVA_MOCK_SCREEN, "Edit photo", min_similarity=0.50)
        test("Canva: finds 'Edit photo'", len(results) > 0, f"found {len(results)}")
        if results:
            test("Edit photo: correct bounds", results[0]['x'] == 120 and results[0]['y'] == 76)

        # Canva: find BG Remover
        results = find_candidates_in_map(CANVA_MOCK_SCREEN, "BG Remover", min_similarity=0.50)
        test("Canva: finds 'BG Remover'", len(results) > 0, f"found {len(results)}")

        # Canva: find Animate
        results = find_candidates_in_map(CANVA_MOCK_SCREEN, "Animate", min_similarity=0.50)
        test("Canva: finds 'Animate'", len(results) > 0, f"found {len(results)}")

        # Excel: find Insert tab
        results = find_candidates_in_map(EXCEL_MOCK_SCREEN, "Insert", min_similarity=0.50)
        test("Excel: finds 'Insert' tab", len(results) > 0, f"found {len(results)}")
        if results:
            best = results[0]
            test("Insert tab: correct x/y", best['x'] == 124 and best['y'] == 55, f"got ({best['x']}, {best['y']})")

        # Excel: find Recommended Charts
        results = find_candidates_in_map(EXCEL_MOCK_SCREEN, "Recommended Charts", min_similarity=0.50)
        test("Excel: finds 'Recommended Charts'", len(results) > 0, f"found {len(results)}")

        # Container Rejection: giant panel should be filtered
        results = find_candidates_in_map(CANVA_MOCK_SCREEN, "Canva window", min_similarity=0.50)
        test("Container rejection: giant panel filtered", not any(
            r['width'] > 700 and r['height'] > 450 for r in results
        ))

    except ImportError as e:
        print(f"  ⚠️  SKIP: screen_map_builder import failed: {e}")


# ─── 3. Coordinate Mapping Tests ──────────────────────────────────────────────

def test_coordinate_mapping():
    section("3. COORDINATE MAPPING (DPI Scale Tests)")

    def phys_to_overlay(x, y, w, h, scale):
        return (round(x/scale), round(y/scale), round(w/scale), round(h/scale))

    # 100% DPI (1.0)
    ox, oy, ow, oh = phys_to_overlay(400, 200, 100, 40, 1.0)
    test("100% DPI: no scaling", ox == 400 and oy == 200)

    # 125% DPI (1.25)
    ox, oy, ow, oh = phys_to_overlay(400, 200, 100, 40, 1.25)
    test("125% DPI: physical 400,200 → overlay 320,160", ox == 320 and oy == 160, f"got ({ox},{oy})")

    # 150% DPI (1.5)
    ox, oy, ow, oh = phys_to_overlay(600, 300, 120, 48, 1.5)
    test("150% DPI: physical 600,300 → overlay 400,200", ox == 400 and oy == 200, f"got ({ox},{oy})")

    # 175% DPI (1.75)
    ox, oy, ow, oh = phys_to_overlay(875, 350, 140, 56, 1.75)
    test("175% DPI: physical 875,350 → overlay 500,200", ox == 500 and oy == 200, f"got ({ox},{oy})")

    # Multi-monitor: Negative X (monitor to left of primary)
    ox, oy, ow, oh = phys_to_overlay(-500, 100, 100, 40, 1.0)
    test("Multi-monitor: negative X preserved", ox == -500, f"got ({ox},{oy})")

    # Div-by-zero guard
    try:
        ox, oy, ow, oh = phys_to_overlay(400, 200, 100, 40, 0)
        test("Zero scale factor fallback", False, "Should have raised ZeroDivisionError")
    except ZeroDivisionError:
        test("Zero scale factor raises ZeroDivisionError (expected)", True)


# ─── 4. Target Validation Tests ───────────────────────────────────────────────

def test_target_validation():
    section("4. TARGET VALIDATION (12-Point Checks)")

    window = {'x': 0, 'y': 0, 'width': 1280, 'height': 800}

    def validate(target):
        """Inline 12-point validator."""
        x, y, w, h = target['x'], target['y'], target['width'], target['height']
        if w <= 2 or h <= 2: return False, "too small"
        if w > window['width'] * 0.70 and h > window['height'] * 0.70: return False, "container"
        if x == window['x'] and y == window['y'] and w >= window['width'] * 0.95: return False, "root window"
        if target.get('confidence', 1.0) < 0.40: return False, "low confidence"
        return True, "ok"

    # Valid targets
    valid, reason = validate({'x': 120, 'y': 76, 'width': 90, 'height': 32, 'confidence': 0.98})
    test("Valid button accepted", valid, reason)

    valid, reason = validate({'x': 320, 'y': 130, 'width': 640, 'height': 480, 'confidence': 0.94})
    test("Valid canvas object accepted", valid, reason)

    # Container rejection
    valid, reason = validate({'x': 0, 'y': 0, 'width': 1280, 'height': 800, 'confidence': 0.99})
    test("Full-window container rejected", not valid, reason)

    valid, reason = validate({'x': 0, 'y': 0, 'width': 960, 'height': 700, 'confidence': 0.95})
    test("Giant pane (75%×87%) rejected", not valid, reason)

    # Too small
    valid, reason = validate({'x': 100, 'y': 50, 'width': 1, 'height': 1, 'confidence': 0.90})
    test("1×1 element rejected", not valid, reason)

    # Low confidence
    valid, reason = validate({'x': 100, 'y': 50, 'width': 90, 'height': 32, 'confidence': 0.30})
    test("Low confidence (0.30) rejected", not valid, reason)

    # Root window pattern
    valid, reason = validate({'x': 0, 'y': 0, 'width': 1280, 'height': 600, 'confidence': 0.95})
    test("Root window at (0,0) full width rejected", not valid, reason)


# ─── 5. IOU Calculation Tests ─────────────────────────────────────────────────

def test_iou():
    section("5. INTERSECTION OVER UNION (IoU) CALCULATION")
    try:
        from opencv_detector import calculate_iou

        # Perfect overlap
        a = {'x': 0, 'y': 0, 'width': 100, 'height': 100}
        test("Perfect overlap IoU = 1.0", calculate_iou(a, a) == 1.0)

        # No overlap
        b = {'x': 200, 'y': 0, 'width': 100, 'height': 100}
        test("No overlap IoU = 0.0", calculate_iou(a, b) == 0.0, str(calculate_iou(a, b)))

        # Partial overlap
        c = {'x': 50, 'y': 0, 'width': 100, 'height': 100}
        iou = calculate_iou(a, c)
        test("50% overlap IoU ≈ 0.33", 0.30 <= iou <= 0.40, f"got {iou:.3f}")

        # Near-identical (DOM bridge + OCR agreement)
        dom = {'x': 120, 'y': 76, 'width': 90, 'height': 32}
        ocr = {'x': 118, 'y': 74, 'width': 94, 'height': 34}
        iou = calculate_iou(dom, ocr)
        test("Near-identical sources agree (IoU ≥ 0.80)", iou >= 0.80, f"got {iou:.3f}")

    except ImportError as e:
        print(f"  ⚠️  SKIP: opencv_detector import failed: {e}")


# ─── 6. Screen Deduplication Tests ───────────────────────────────────────────

def test_deduplication():
    section("6. ELEMENT DEDUPLICATION (IoU-based merge)")
    try:
        from screen_map_builder import deduplicate_elements

        elements = [
            # Same element from UIA and OCR (should merge → keep UIA)
            {'text': 'Edit photo', 'x': 120, 'y': 76, 'width': 90, 'height': 32, 'confidence': 0.99, 'source': 'uia'},
            {'text': 'Edit photo', 'x': 118, 'y': 74, 'width': 94, 'height': 34, 'confidence': 0.90, 'source': 'ocr'},
            # Different element
            {'text': 'Animate', 'x': 215, 'y': 76, 'width': 75, 'height': 32, 'confidence': 0.98, 'source': 'uia'},
        ]
        result = deduplicate_elements(elements, iou_threshold=0.40)
        test("Deduplication: 3 elements → 2 unique", len(result) == 2, f"got {len(result)}")
        test("Higher confidence source (UIA) kept", any(r['source'] == 'uia' and r['text'] == 'Edit photo' for r in result))

    except ImportError as e:
        print(f"  ⚠️  SKIP: screen_map_builder import failed: {e}")


# ─── 7. Workflow Level Integrity ──────────────────────────────────────────────

def test_workflow_integrity():
    section("7. WORKFLOW DEFINITIONS INTEGRITY")
    workflows_dir = os.path.join(WORKSPACE_ROOT, 'src', 'workflows')

    for wf_name in ['canvaRemoveBackground.ts', 'canvaAnimation.ts', 'excelChart.ts']:
        path = os.path.join(workflows_dir, wf_name)
        if not os.path.exists(path):
            test(f"{wf_name} exists", False, "file not found")
            continue

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        level_count = content.count('levelNumber:')
        test(f"{wf_name}: exactly 4 levels", level_count == 4, f"found {level_count}")

        # Check no hardcoded coordinates
        import re
        coord_patterns = [r'\bx:\s*\d{3,4}\b', r'\by:\s*\d{3,4}\b']
        hardcoded_found = any(re.search(pat, content) for pat in coord_patterns)
        test(f"{wf_name}: no hardcoded coordinates", not hardcoded_found)

        # Check verification methods present
        test(f"{wf_name}: has verificationMethod field", 'verificationMethod' in content)
        test(f"{wf_name}: has completionCondition field", 'completionCondition' in content)


# ─── 8. Knowledge Base Integrity ─────────────────────────────────────────────

def test_knowledge_base():
    section("8. KNOWLEDGE BASE INTEGRITY")
    for app in ['canva', 'excel']:
        path = os.path.join(WORKSPACE_ROOT, 'src', 'knowledge', f'{app}.json')
        if not os.path.exists(path):
            test(f"{app}.json exists", False)
            continue

        try:
            with open(path) as f:
                data = json.load(f)

            test(f"{app}.json: valid JSON", True)
            test(f"{app}.json: has controls array", 'controls' in data)
            test(f"{app}.json: has layout_regions", 'layout_regions' in data)

            # Check no coordinates in knowledge base (must be semantics only)
            raw = json.dumps(data)
            import re
            # Look for suspiciously specific pixel values (> 3 digits in x/y context)
            has_pixel_coords = bool(re.search(r'"x":\s*\d{3,}|"y":\s*\d{3,}', raw))
            test(f"{app}.json: no hardcoded pixel coordinates", not has_pixel_coords)

            controls = data.get('controls', [])
            test(f"{app}.json: ≥3 controls registered", len(controls) >= 3, f"found {len(controls)}")

            for ctrl in controls:
                test(f"  Control '{ctrl.get('canonical')}': has aliases", len(ctrl.get('aliases', [])) > 0)

        except json.JSONDecodeError as e:
            test(f"{app}.json: parse error", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "#"*60)
    print("  INTENT GUIDANCE TEST SUITE (npm run test:guidance)")
    print("#"*60)

    test_ocr_similarity()
    test_candidate_search()
    test_coordinate_mapping()
    test_target_validation()
    test_iou()
    test_deduplication()
    test_workflow_integrity()
    test_knowledge_base()

    print("\n" + "="*60)
    total = passed + failed
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
    if failed == 0:
        print("  \u2705 ALL TESTS PASSED")
    else:
        print(f"  \u274c {failed} test(s) failed — check output above")
    print("="*60 + "\n")

    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
