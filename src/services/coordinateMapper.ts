// ─── Coordinate Mapper — Single Authority ────────────────────────────────────
// All coordinate transformations between Physical Screen Space and Electron Overlay Space
// pass through this service.
//
// PHYSICAL SPACE: Raw hardware pixels (e.g. 1920x1080, 2560x1440, can be negative for secondary monitors).
//                 Returned by Windows UI Automation, WinRT OCR, and Gemini Vision.
// OVERLAY SPACE:  Electron CSS pixels (e.g. 1536x864 at 125% DPI).
//                 Rendered by overlayWin and Framer Motion.
//
// MULTI-MONITOR: Desktop origin may NOT be at (0,0). Secondary monitors to the left have negative X.
// We always work in absolute desktop coordinates, then subtract the overlay window's position.

import type { DisplayRect, DisplayInfo } from '../types/screenMap'

export interface DesktopBounds {
  x: number
  y: number
  width: number
  height: number
}

export class CoordinateMapper {
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

  getScaleFactor(): number {
    return this.meta.scaleFactor || (typeof window !== 'undefined' ? window.devicePixelRatio : 1.0) || 1.0
  }

  /**
   * Find the display that contains a given physical point.
   * Falls back to primary if no match.
   */
  findDisplayForPoint(x: number, y: number): DisplayRect | null {
    if (!this.meta.displays?.length) return null
    for (const d of this.meta.displays) {
      if (x >= d.x && x < d.x + d.width && y >= d.y && y < d.y + d.height) {
        return d
      }
    }
    // Fallback: primary
    return this.meta.displays.find(d => d.isPrimary) ?? this.meta.displays[0] ?? null
  }

  /**
   * PHYSICAL PIXELS → ELECTRON OVERLAY CSS PIXELS
   * Applies EXACTLY ONE division by the display's scaleFactor.
   * Handles negative coordinates (monitors to left/above primary).
   */
  physicalToOverlay(bounds: DesktopBounds): DesktopBounds {
    // Find the display this element belongs to for the correct scale factor
    const display = this.findDisplayForPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    const sf = display?.scaleFactor ?? this.getScaleFactor()
    const vLeft = this.meta.virtualLeft ?? 0
    const vTop = this.meta.virtualTop ?? 0

    return {
      x: Math.round((bounds.x - vLeft) / sf),
      y: Math.round((bounds.y - vTop) / sf),
      width: Math.max(24, Math.round(bounds.width / sf)),
      height: Math.max(16, Math.round(bounds.height / sf)),
    }
  }

  /**
   * Legacy alias for physicalToOverlay
   */
  desktopToOverlay(bounds: DesktopBounds): DesktopBounds {
    return this.physicalToOverlay(bounds)
  }

  /**
   * Compute the Intent Cursor anchor position from OVERLAY BOUNDS.
   * Input MUST already be in overlay CSS pixels.
   * Does NOT divide by scaleFactor again.
   *
   * For CANVAS_OBJECT: places cursor at center of the bounding box.
   * For BUTTON/TAB: places cursor BELOW the button (+ OFFSET px gap).
   */
  cursorAnchorFromBounds(
    overlayBounds: DesktopBounds,
    targetType: string = 'BUTTON',
  ): { x: number; y: number } {
    const screenW = this.meta.totalWidth || this.meta.screenWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920) || 1920
    const screenH = this.meta.totalHeight || this.meta.screenHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080) || 1080

    const centerX = Math.max(60, Math.min(screenW - 60, Math.round(overlayBounds.x + overlayBounds.width / 2)))

    // Canvas objects → center cursor on the object itself
    if (targetType === 'CANVAS_OBJECT') {
      return {
        x: centerX,
        y: Math.max(40, Math.min(screenH - 50, Math.round(overlayBounds.y + overlayBounds.height / 2))),
      }
    }

    // Buttons, tabs → cursor below with a 24px gap
    const OFFSET = 24
    let cursorY = Math.round(overlayBounds.y + overlayBounds.height + OFFSET)

    // If target is near the bottom of the screen, place cursor ABOVE it instead
    if (cursorY > screenH - 70) {
      cursorY = Math.round(overlayBounds.y - OFFSET - 10)
    }

    // Clamp Y to strictly stay within visible screen bounds
    cursorY = Math.max(40, Math.min(screenH - 50, cursorY))

    return { x: centerX, y: cursorY }
  }

  /**
   * Validate that a coordinate is finite and within reasonable multi-monitor bounds.
   */
  isValidDesktopCoord(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    // Allow negative coords for monitors to the left/above primary
    return x >= -8000 && x <= 8000 && y >= -4000 && y <= 4000
  }

  /**
   * Validate a bounding box: checks it is non-trivial and within screen bounds.
   */
  isValidBounds(bounds: DesktopBounds): boolean {
    if (!bounds) return false
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return false
    if (bounds.width < 4 || bounds.height < 4) return false
    return this.isValidDesktopCoord(bounds.x, bounds.y)
  }
}

export const coordinateMapper = new CoordinateMapper()
