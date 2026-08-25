// ─── Coordinate Mapper — Single Authority ────────────────────────────────────
// All coordinate transformations between Physical Screen Space and Electron Overlay Space
// pass through this service.
//
// PHYSICAL SPACE: Raw hardware pixels (e.g. 1920x1080, 2560x1440).
//                 Returned by Windows UI Automation, WinRT OCR, and Gemini Vision.
// OVERLAY SPACE:  Electron CSS pixels (e.g. 1536x864 at 125% DPI).
//                 Rendered by overlayWin and Framer Motion.

export interface DesktopBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayMeta {
  screenWidth: number     // CSS width of primary display
  screenHeight: number    // CSS height
  scaleFactor: number     // e.g. 1.25 for 125% DPI
}

export class CoordinateMapper {
  private meta: DisplayMeta = {
    screenWidth: window.screen.width || 1920,
    screenHeight: window.screen.height || 1080,
    scaleFactor: window.devicePixelRatio || 1.0,
  }

  setDisplayMeta(meta: DisplayMeta) {
    if (meta && meta.scaleFactor > 0) {
      this.meta = meta
    }
  }

  getScaleFactor(): number {
    return this.meta.scaleFactor || window.devicePixelRatio || 1.0
  }

  /**
   * PHYSICAL PIXELS → ELECTRON OVERLAY CSS PIXELS
   * Applies EXACTLY ONE division by scaleFactor.
   */
  physicalToOverlay(bounds: DesktopBounds): DesktopBounds {
    const sf = this.getScaleFactor()
    return {
      x: Math.round(bounds.x / sf),
      y: Math.round(bounds.y / sf),
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
   */
  cursorAnchorFromBounds(
    overlayBounds: DesktopBounds,
  ): { x: number; y: number } {
    const screenW = this.meta.screenWidth || window.innerWidth || 1920
    const screenH = this.meta.screenHeight || window.innerHeight || 1080

    const centerX = Math.max(60, Math.min(screenW - 60, Math.round(overlayBounds.x + overlayBounds.width / 2)))
    const OFFSET = 24

    // Place cursor below the target bounding box
    let cursorY = Math.round(overlayBounds.y + overlayBounds.height + OFFSET)

    // If target is near the bottom of the screen, place cursor ABOVE it instead
    if (cursorY > screenH - 70) {
      cursorY = Math.round(overlayBounds.y - OFFSET - 10)
    }

    // Clamp Y to strictly stay within visible screen bounds (never negative)
    cursorY = Math.max(40, Math.min(screenH - 50, cursorY))

    return {
      x: centerX,
      y: cursorY,
    }
  }

  /**
   * Validate that a coordinate is finite and within reasonable bounds.
   */
  isValidDesktopCoord(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    return x >= -200 && x <= 4000 && y >= -200 && y <= 3000
  }
}

export const coordinateMapper = new CoordinateMapper()
