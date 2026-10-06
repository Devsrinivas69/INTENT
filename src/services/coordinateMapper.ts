// ─── Coordinate Manager / Coordinate Mapper — Single Authority ───────────────
// All coordinate transformations between:
//   - DOM Viewport Space
//   - Windows UI Automation Space
//   - Screenshot / OpenCV Image Space
//   - Physical Desktop Screen Space (Hardware Pixels)
//   - Electron Overlay Window Space (CSS DIPs)
// pass exclusively through this service.
//
// PHYSICAL SPACE: Raw hardware desktop pixels (e.g. 1920x1080, 2560x1440, can be negative for secondary monitors).
//                 Standardized across Windows UIA, WinRT OCR, and DOM bridge.
// OVERLAY SPACE:  Electron CSS pixels rendered by overlayWin and Framer Motion.
//                 Spans the full virtual multi-monitor desktop.
//
// MULTI-MONITOR & MIXED DPI:
// Every display has distinct physical bounds, DIP bounds, and scale factors.
// Transformations explicitly resolve target monitors without arbitrary hardcoded offsets.

import type { DisplayRect, DisplayInfo, ScreenRect, TargetAnchorType, WindowInfo } from '../types/screenMap'

export type DesktopBounds = ScreenRect

export class CoordinateManager {
  private meta: DisplayInfo = {
    screenWidth: typeof window !== 'undefined' ? window.screen.width : 1920,
    screenHeight: typeof window !== 'undefined' ? window.screen.height : 1080,
    scaleFactor: typeof window !== 'undefined' ? window.devicePixelRatio : 1.0,
    displays: [],
  }

  setDisplayMeta(meta: DisplayInfo) {
    if (meta && meta.scaleFactor > 0) {
      this.meta = meta
    }
  }

  getDisplayMeta(): DisplayInfo {
    return this.meta
  }

  getScaleFactor(): number {
    return this.meta.scaleFactor || (typeof window !== 'undefined' ? window.devicePixelRatio : 1.0) || 1.0
  }

  /**
   * Find the display containing a given physical screen point.
   * Matches against physical bounds to prevent DPI-induced display misidentification.
   */
  findDisplayForPhysicalPoint(x: number, y: number): DisplayRect | null {
    if (!this.meta.displays?.length) return null
    for (const d of this.meta.displays) {
      const sf = d.scaleFactor || 1.0
      const px = d.physicalBounds?.x ?? Math.round(d.x * sf)
      const py = d.physicalBounds?.y ?? Math.round(d.y * sf)
      const pw = d.physicalBounds?.width ?? Math.round(d.width * sf)
      const ph = d.physicalBounds?.height ?? Math.round(d.height * sf)

      if (x >= px && x < px + pw && y >= py && y < py + ph) {
        return d
      }
    }
    // Fallback: primary display or first display
    return this.meta.displays.find(d => d.isPrimary) ?? this.meta.displays[0] ?? null
  }

  /**
   * Find the display containing a given DIP point.
   */
  findDisplayForDipPoint(x: number, y: number): DisplayRect | null {
    if (!this.meta.displays?.length) return null
    for (const d of this.meta.displays) {
      const dx = d.dipBounds?.x ?? d.x
      const dy = d.dipBounds?.y ?? d.y
      const dw = d.dipBounds?.width ?? d.width
      const dh = d.dipBounds?.height ?? d.height

      if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) {
        return d
      }
    }
    return this.meta.displays.find(d => d.isPrimary) ?? this.meta.displays[0] ?? null
  }

  // ── Explicit Normalization Transforms ─────────────────────────────────────

  /**
   * UIA → Physical Desktop ScreenRect
   * Windows UI Automation already returns absolute screen coordinates in physical pixels
   * when Per-Monitor DPI Awareness V2 is enabled.
   */
  uiaToScreenRect(raw: { x: number; y: number; width: number; height: number }): ScreenRect {
    return {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width: Math.max(4, Math.round(raw.width)),
      height: Math.max(4, Math.round(raw.height)),
    }
  }

  /**
   * DOM Bridge → Physical Desktop ScreenRect
   * Handles browser viewport, chrome offset (tabs/address bar), and DPI scaling.
   */
  domToScreenRect(
    domRaw: {
      x: number
      y: number
      width: number
      height: number
      viewportX?: number
      viewportY?: number
      viewportWidth?: number
      viewportHeight?: number
      navHeight?: number
      dpr?: number
    },
    winInfo?: WindowInfo
  ): ScreenRect {
    // If we have verified target application window bounds from Windows OS
    if (winInfo && winInfo.found && winInfo.width > 0) {
      const dpr = domRaw.dpr || winInfo.scale_factor || 1.0
      // If viewport relative coordinates are available
      if (domRaw.viewportX !== undefined && domRaw.viewportY !== undefined) {
        // Compute Chrome tab/titlebar offset in physical pixels
        // In Windows Chrome/Edge, navigation chrome is typically ~80px at 100% DPI
        const navHeightPx = Math.round((domRaw.navHeight ?? 80) * dpr)
        const physX = winInfo.x + Math.round(domRaw.viewportX * dpr)
        const physY = winInfo.y + navHeightPx + Math.round(domRaw.viewportY * dpr)
        const physW = Math.round((domRaw.viewportWidth ?? domRaw.width) * dpr)
        const physH = Math.round((domRaw.viewportHeight ?? domRaw.height) * dpr)

        return {
          x: physX,
          y: physY,
          width: Math.max(4, physW),
          height: Math.max(4, physH),
        }
      }
    }

    // Default: domRaw.x / domRaw.y is already physical desktop coordinates computed by content.js
    return {
      x: Math.round(domRaw.x),
      y: Math.round(domRaw.y),
      width: Math.max(4, Math.round(domRaw.width)),
      height: Math.max(4, Math.round(domRaw.height)),
    }
  }

  /**
   * Screenshot Image Coordinates → Physical Desktop ScreenRect
   */
  imageToScreenRect(
    imageBox: { x: number; y: number; width: number; height: number },
    winInfo?: WindowInfo,
    captureScale: number = 1.0
  ): ScreenRect {
    const offsetX = winInfo?.x ?? 0
    const offsetY = winInfo?.y ?? 0
    const scale = captureScale > 0 ? captureScale : 1.0

    return {
      x: Math.round(offsetX + imageBox.x / scale),
      y: Math.round(offsetY + imageBox.y / scale),
      width: Math.max(4, Math.round(imageBox.width / scale)),
      height: Math.max(4, Math.round(imageBox.height / scale)),
    }
  }

  /**
   * Window Relative Coordinates → Physical Desktop ScreenRect
   */
  windowToScreenRect(
    localRect: { x: number; y: number; width: number; height: number },
    winInfo: WindowInfo
  ): ScreenRect {
    return {
      x: Math.round(winInfo.x + localRect.x),
      y: Math.round(winInfo.y + localRect.y),
      width: Math.max(4, Math.round(localRect.width)),
      height: Math.max(4, Math.round(localRect.height)),
    }
  }

  // ── Canonical Screen to Overlay CSS Space ─────────────────────────────────

  /**
   * PHYSICAL DESKTOP PIXELS → ELECTRON OVERLAY CSS PIXELS
   *
   * Rigorous mathematical translation:
   * 1. Determines target display from physical coordinate center.
   * 2. Computes point offset relative to that display's physical origin.
   * 3. Divides by that display's specific scaleFactor to obtain DIPs.
   * 4. Translates relative to overlay window DIP origin (virtualLeft, virtualTop).
   *
   * Zero hardcoded pixel offsets.
   */
  screenToOverlayRect(bounds: ScreenRect): ScreenRect {
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    const display = this.findDisplayForPhysicalPoint(cx, cy)
    const sf = display?.scaleFactor ?? this.getScaleFactor()
    const vLeftDIP = this.meta.virtualLeft ?? 0
    const vTopDIP = this.meta.virtualTop ?? 0

    if (display) {
      const physLeft = display.physicalBounds?.x ?? Math.round(display.x * sf)
      const physTop = display.physicalBounds?.y ?? Math.round(display.y * sf)
      const relPhysX = bounds.x - physLeft
      const relPhysY = bounds.y - physTop
      const dipX = display.x + (relPhysX / sf)
      const dipY = display.y + (relPhysY / sf)

      return {
        x: Math.round(dipX - vLeftDIP),
        y: Math.round(dipY - vTopDIP),
        width: Math.max(16, Math.round(bounds.width / sf)),
        height: Math.max(12, Math.round(bounds.height / sf)),
      }
    }

    // Fallback for single monitor without multi-monitor array
    return {
      x: Math.round((bounds.x - (this.meta.virtualLeftPhysical ?? 0)) / sf),
      y: Math.round((bounds.y - (this.meta.virtualTopPhysical ?? 0)) / sf),
      width: Math.max(16, Math.round(bounds.width / sf)),
      height: Math.max(12, Math.round(bounds.height / sf)),
    }
  }

  /**
   * Legacy alias for physicalToOverlay
   */
  physicalToOverlay(bounds: ScreenRect): ScreenRect {
    return this.screenToOverlayRect(bounds)
  }

  desktopToOverlay(bounds: ScreenRect): ScreenRect {
    return this.screenToOverlayRect(bounds)
  }

  /**
   * Reverse mapping: Overlay CSS Pixels → Physical Screen Pixels
   */
  overlayToScreenRect(overlayRect: ScreenRect): ScreenRect {
    const vLeftDIP = this.meta.virtualLeft ?? 0
    const vTopDIP = this.meta.virtualTop ?? 0
    const dipX = overlayRect.x + vLeftDIP
    const dipY = overlayRect.y + vTopDIP

    const display = this.findDisplayForDipPoint(dipX, dipY)
    const sf = display?.scaleFactor ?? this.getScaleFactor()

    if (display) {
      const relDipX = dipX - display.x
      const relDipY = dipY - display.y
      const physLeft = display.physicalBounds?.x ?? Math.round(display.x * sf)
      const physTop = display.physicalBounds?.y ?? Math.round(display.y * sf)

      return {
        x: Math.round(physLeft + relDipX * sf),
        y: Math.round(physTop + relDipY * sf),
        width: Math.round(overlayRect.width * sf),
        height: Math.round(overlayRect.height * sf),
      }
    }

    return {
      x: Math.round((overlayRect.x + vLeftDIP) * sf),
      y: Math.round((overlayRect.y + vTopDIP) * sf),
      width: Math.round(overlayRect.width * sf),
      height: Math.round(overlayRect.height * sf),
    }
  }

  // ── Target Anchor & Cursor Anchor System ──────────────────────────────────

  /**
   * Compute the primary interaction point (anchor) within a target rectangle.
   * Differentiates between button hitbox centers, text centers, icons, and canvas objects.
   */
  computeTargetAnchor(
    rect: ScreenRect,
    anchorType: TargetAnchorType = 'CLICKABLE_CENTER',
    targetType: string = 'BUTTON'
  ): { x: number; y: number } {
    const cx = Math.round(rect.x + rect.width / 2)
    const cy = Math.round(rect.y + rect.height / 2)

    switch (anchorType) {
      case 'CENTER':
      case 'CLICKABLE_CENTER':
      case 'CANVAS_CENTER':
        return { x: cx, y: cy }
      case 'TOP':
        return { x: cx, y: Math.round(rect.y + Math.min(6, rect.height * 0.2)) }
      case 'BOTTOM':
        return { x: cx, y: Math.round(rect.y + rect.height - Math.min(6, rect.height * 0.2)) }
      case 'LEFT':
        return { x: Math.round(rect.x + Math.min(8, rect.width * 0.2)), y: cy }
      case 'RIGHT':
        return { x: Math.round(rect.x + rect.width - Math.min(8, rect.width * 0.2)), y: cy }
      case 'TEXT_CENTER':
        return { x: cx, y: cy }
      case 'ICON_CENTER':
        return { x: Math.round(rect.x + Math.min(24, rect.width * 0.25)), y: cy }
      default:
        return { x: cx, y: cy }
    }
  }

  /**
   * Compute the non-intrusive Intent Cursor anchor position from OVERLAY BOUNDS.
   * Input MUST already be in overlay CSS pixels.
   *
   * For CANVAS_OBJECT: places cursor at center of object.
   * For BUTTON/TAB/MENU: places cursor neatly below the control pointing directly at target anchor.
   * Flips above if near the bottom edge of the desktop screen.
   */
  cursorAnchorFromBounds(
    overlayBounds: ScreenRect,
    targetType: string = 'BUTTON',
    customAnchor?: { x: number; y: number }
  ): { x: number; y: number } {
    // Use physical desktop dimensions from display metadata — NOT window.innerWidth/Height
    // (which in the overlay window equals the INTENT panel size, NOT the desktop resolution)
    const screenW = this.meta.totalWidth ?? this.meta.screenWidth ?? 1920
    const screenH = this.meta.totalHeight ?? this.meta.screenHeight ?? 1080

    const targetAnchor = customAnchor || this.computeTargetAnchor(overlayBounds, 'CLICKABLE_CENTER', targetType)
    const centerX = Math.max(30, Math.min(screenW - 30, targetAnchor.x))

    // Canvas objects → center cursor directly on the object itself
    if (targetType === 'CANVAS_OBJECT') {
      return {
        x: centerX,
        y: Math.max(30, Math.min(screenH - 30, targetAnchor.y)),
      }
    }

    // Buttons, tabs, menus → cursor placed below with a clean 20px gap
    const OFFSET = 20
    let cursorY = Math.round(overlayBounds.y + overlayBounds.height + OFFSET)

    // If target is near the bottom of the virtual desktop, place cursor ABOVE it instead
    if (cursorY > screenH - 75) {
      cursorY = Math.round(overlayBounds.y - OFFSET - 10)
    }

    // Clamp Y to stay strictly within visible virtual desktop bounds
    cursorY = Math.max(30, Math.min(screenH - 45, cursorY))

    return { x: centerX, y: cursorY }
  }

  /**
   * Validate that a coordinate is finite and within reasonable multi-monitor desktop bounds.
   */
  isValidDesktopCoord(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    return x >= -16000 && x <= 16000 && y >= -8000 && y <= 8000
  }

  /**
   * Validate a bounding box: checks it is non-trivial and within screen bounds.
   */
  isValidBounds(bounds: ScreenRect): boolean {
    if (!bounds) return false
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return false
    if (bounds.width < 4 || bounds.height < 4) return false
    return this.isValidDesktopCoord(bounds.x, bounds.y)
  }
}

export const coordinateManager = new CoordinateManager()
export const coordinateMapper = coordinateManager
export default coordinateManager
