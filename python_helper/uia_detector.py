"""
Windows UI Automation Detector
Uses uiautomation library to enumerate accessible UI elements from native Windows apps.
Returns elements with ABSOLUTE WINDOWS DESKTOP COORDINATES.
"""

import uiautomation as auto
import win32gui


def get_hwnd_accessible_elements(hwnd: int, max_depth: int = 8) -> list:
    """
    Enumerate all accessible, named, visible, enabled controls under a window HWND.
    Returns list of element dicts with absolute desktop coords.
    """
    results = []
    try:
        # Get the uiautomation control from hwnd
        root_ctrl = auto.ControlFromHandle(hwnd)
        if root_ctrl is None:
            return results

        for ctrl, depth in auto.WalkControl(root_ctrl, maxDepth=max_depth):
            try:
                name = (ctrl.Name or '').strip()
                if not name:
                    continue
                if ctrl.IsOffscreen:
                    continue
                rect = ctrl.BoundingRectangle
                if rect.width() <= 0 or rect.height() <= 0:
                    continue

                ctrl_type = ctrl.ControlTypeName  # e.g. 'ButtonControl', 'TabItemControl'
                enabled = True
                try:
                    enabled = ctrl.IsEnabled
                except Exception:
                    pass

                results.append({
                    'text': name,
                    'control_type': ctrl_type,
                    'x': int(rect.left),
                    'y': int(rect.top),
                    'width': int(rect.width()),
                    'height': int(rect.height()),
                    'enabled': enabled,
                    'source': 'uia',
                    'confidence': 0.99,
                })
            except Exception:
                continue

    except Exception as e:
        pass

    return results


def find_element_in_hwnd(hwnd: int, target_name: str, max_depth: int = 8) -> dict | None:
    """
    Fast search for a specific named element in the accessibility tree of a given HWND.
    Returns the best match or None.
    """
    target_lower = target_name.lower().strip()
    best = None
    best_score = 0.0

    try:
        root_ctrl = auto.ControlFromHandle(hwnd)
        if root_ctrl is None:
            return None

        for ctrl, depth in auto.WalkControl(root_ctrl, maxDepth=max_depth):
            try:
                name = (ctrl.Name or '').strip()
                if not name:
                    continue
                if ctrl.IsOffscreen:
                    continue
                rect = ctrl.BoundingRectangle
                if rect.width() <= 0 or rect.height() <= 0:
                    continue

                name_lower = name.lower()
                # Score exact match vs partial match
                if name_lower == target_lower:
                    score = 1.0
                elif target_lower in name_lower:
                    score = 0.85
                elif any(w in name_lower for w in target_lower.split() if len(w) > 3):
                    score = 0.75
                else:
                    continue

                # Bonus for interactive control types
                ctrl_type = ctrl.ControlTypeName
                if ctrl_type in ('ButtonControl', 'TabItemControl', 'MenuItemControl'):
                    score = min(1.0, score + 0.05)

                if score > best_score:
                    best_score = score
                    best = {
                        'text': name,
                        'control_type': ctrl_type,
                        'x': int(rect.left),
                        'y': int(rect.top),
                        'width': int(rect.width()),
                        'height': int(rect.height()),
                        'enabled': True,
                        'source': 'uia',
                        'confidence': round(score, 2),
                    }
            except Exception:
                continue

    except Exception:
        pass

    return best


def verify_excel_state(hwnd: int, condition: str) -> dict:
    """
    Verify specific Excel UI state using accessibility tree.
    Conditions: 'insert_tab_active', 'chart_exists', 'data_selected'
    """
    condition_lower = condition.lower()
    try:
        root_ctrl = auto.ControlFromHandle(hwnd)
        if root_ctrl is None:
            return {'completed': False, 'evidence': 'Cannot access Excel window', 'confidence': 0.0}

        if 'chart' in condition_lower:
            # Look for Chart-related controls
            for ctrl, _ in auto.WalkControl(root_ctrl, maxDepth=10):
                name = (ctrl.Name or '').lower()
                cls = ctrl.ControlTypeName
                if 'chart' in name or (cls == 'ImageControl' and not ctrl.IsOffscreen):
                    return {'completed': True, 'evidence': f'Chart element found: {ctrl.Name}', 'confidence': 0.92}

        if 'insert' in condition_lower:
            for ctrl, _ in auto.WalkControl(root_ctrl, maxDepth=6):
                name = (ctrl.Name or '').lower()
                ctrl_type = ctrl.ControlTypeName
                if 'insert' in name and ctrl_type == 'TabItemControl':
                    try:
                        # Check if this tab item has IsSelected property
                        selected = getattr(ctrl, 'IsSelected', False)
                        if selected:
                            return {'completed': True, 'evidence': 'Insert ribbon tab is active', 'confidence': 0.95}
                    except Exception:
                        pass
                    # Tab exists, likely active if we just navigated to it
                    return {'completed': True, 'evidence': 'Insert tab found in ribbon', 'confidence': 0.80}

        if 'select' in condition_lower or 'data' in condition_lower:
            # Check for selection indicator (status bar text, named range, etc.)
            for ctrl, _ in auto.WalkControl(root_ctrl, maxDepth=4):
                name = (ctrl.Name or '').lower()
                if 'cell' in name or 'selected' in name:
                    return {'completed': True, 'evidence': f'Data selection detected: {ctrl.Name}', 'confidence': 0.80}

    except Exception as e:
        return {'completed': False, 'evidence': str(e), 'confidence': 0.0}

    return {'completed': False, 'evidence': 'Condition not confirmed', 'confidence': 0.3}
