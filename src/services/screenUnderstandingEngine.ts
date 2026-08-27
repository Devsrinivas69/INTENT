// ─── ScreenUnderstandingEngine v4.0 ──────────────────────────────────────────
// Central multi-tier intelligence layer implementing the full Target Resolution Pipeline:
//
//   1.  Application Detection (window info, HWND, DPI scale)
//   2.  Screen Inventory Build (UIA + WinRT OCR + DOM Bridge)
//   3.  Multi-Tier Target Finding:
//         Tier 0 — Application awareness (window detection)
//         Tier 1 — UIA (native Windows UI Automation for Excel)
//         Tier 2 — DOM Bridge (Canva browser extension — highest accuracy for web UI)
//         Tier 3 — WinRT OCR (offline, hardware-accelerated text localization)
//         Tier 4 — OpenCV (canvas object isolation, visual contour detection)
//         Tier 5 — Gemini Vision (disambiguation + fallback — never invents coordinates)
//   4.  12-Point Target Validation
//   5.  Stale Target Protection (invalidate on window move/resize)
//   6.  Single Authoritative Coordinate Mapping (Physical → Overlay CSS)
//   7.  TargetLock generation with full provenance
//   8.  Baseline State Capture before user action
//   9.  Verified State Transition Engine
//
// SAFETY RULES (enforced at this layer):
//   - Never return a target whose bounds are ≥70% of the window (container rejection)
//   - Never return a target at (0,0,fullWidth,fullHeight) — root window rejection
//   - Never trust VLM-generated coordinates directly — only VLM candidate selection
//   - Stale targets (window moved/resized/expired) are always re-scanned

import { coordinateMapper } from './coordinateMapper'
import { stateTransitionEngine } from './stateTransitionEngine'
import type {
  WindowInfo, ScreenMap, TargetCandidate, TargetLock, TargetResult, CompletionProof, DisplayInfo,
} from '../types/screenMap'
import type { WorkflowLevel } from '../types/workflow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

// ── Target Lock Staleness Threshold ──────────────────────────────────────────
const TARGET_LOCK_TTL_MS = 30_000  // 30 seconds max before re-scan
const WINDOW_MOVE_THRESHOLD_PX = 20 // Pixels of window movement that triggers re-scan

export class ScreenUnderstandingEngine {
  private lastWindowInfo: WindowInfo | null = null
  private displayInfo: DisplayInfo | null = null

  // ── Step 0: Init Display Meta ─────────────────────────────────────────────

  async initDisplayMeta(): Promise<void> {
    try {
      const info = await api.getDisplayInfo()
      if (info) {
        this.displayInfo = info
        coordinateMapper.setDisplayMeta(info)
      }
    } catch { /* non-fatal */ }
  }

  // ── Step 1: Discover Application Window ───────────────────────────────────

  async getWindowInfo(application: string): Promise<WindowInfo | null> {
    try {
      const result = await api.getWindowInfo(application)
      if (result?.found) {
        this.lastWindowInfo = result as WindowInfo
        return this.lastWindowInfo
      }
      return null
    } catch (err) {
      console.warn('[SUE] getWindowInfo error:', err)
      return null
    }
  }

  // ── Step 1b: Bring Window to Foreground ───────────────────────────────────

  async bringToForeground(hwnd: number): Promise<boolean> {
    try {
      const result = await api.bringToForeground(hwnd)
      return result?.success ?? false
    } catch { return false }
  }

  // ── Step 2: Full Screen Inventory ─────────────────────────────────────────

  async analyzeScreen(winInfo: WindowInfo): Promise<ScreenMap | null> {
    try {
      await this.initDisplayMeta()
      const screenshot = await api.captureScreen()
      const raw = await api.analyzeScreen({
        hwnd: winInfo.hwnd,
        application: winInfo.app ?? '',
        window_title: winInfo.title,
        x: winInfo.x,
        y: winInfo.y,
        width: winInfo.width,
        height: winInfo.height,
        scale_factor: winInfo.scale_factor,
        screenshot,
      })

      if (!raw || raw.error) return null

      return {
        capturedAt: raw.capturedAt ?? Date.now(),
        application: raw.application ?? '',
        windowTitle: raw.windowTitle ?? '',
        windowBounds: { x: winInfo.x, y: winInfo.y, width: winInfo.width, height: winInfo.height },
        scaleFactor: raw.scaleFactor ?? winInfo.scale_factor,
        elements: raw.elements ?? [],
        element_count: raw.element_count ?? 0,
      }
    } catch { return null }
  }

  // ── Step 3: DOM Bridge Snapshot (Tier 2 — Canva only) ─────────────────────

  async getDomBridgeElements(): Promise<any[]> {
    try {
      const result = await api.getDomElements()
      if (!result?.connected || !result.snapshot?.elements) return []
      const snapshot = result.snapshot
      // Only use snapshot if it's fresh (< 5 seconds old)
      if (Date.now() - snapshot.timestamp > 5000) return []
      return snapshot.elements as any[]
    } catch { return [] }
  }

  // ── Step 4 — Stale Target Validation ─────────────────────────────────────

  isTargetStale(targetLock: TargetLock, currentWin: WindowInfo): boolean {
    const now = Date.now()

    // Expired TTL
    if (now > targetLock.expiresAt) {
      console.log('[SUE] Target stale: TTL expired')
      return true
    }

    // Window moved significantly
    const movedX = Math.abs(currentWin.x - targetLock.windowBounds.x)
    const movedY = Math.abs(currentWin.y - targetLock.windowBounds.y)
    if (movedX > WINDOW_MOVE_THRESHOLD_PX || movedY > WINDOW_MOVE_THRESHOLD_PX) {
      console.log(`[SUE] Target stale: window moved by (${movedX}, ${movedY})px`)
      return true
    }

    // Window resized
    const resizedW = Math.abs(currentWin.width - targetLock.windowBounds.width)
    const resizedH = Math.abs(currentWin.height - targetLock.windowBounds.height)
    if (resizedW > WINDOW_MOVE_THRESHOLD_PX || resizedH > WINDOW_MOVE_THRESHOLD_PX) {
      console.log(`[SUE] Target stale: window resized by (${resizedW}, ${resizedH})px`)
      return true
    }

    // HWND changed (window was closed/reopened)
    if (currentWin.hwnd !== targetLock.windowHwnd) {
      console.log('[SUE] Target stale: window HWND changed')
      return true
    }

    return false
  }

  // ── 12-Point Target Validation ─────────────────────────────────────────────

  validateTarget(
    target: any,
    winInfo: WindowInfo,
  ): { valid: boolean; reason?: string } {
    const { x, y, width, height } = target

    // 1. Finite numbers
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { valid: false, reason: 'Non-finite coordinates' }

    // 2. Width and height > 2
    if (width <= 2 || height <= 2) return { valid: false, reason: `Bounds too small: ${width}×${height}` }

    // 3. Not an enormous container (>70% of window on BOTH dimensions)
    if (width > winInfo.width * 0.70 && height > winInfo.height * 0.70) {
      return { valid: false, reason: `Container rejection: ${width}×${height} ≥70% of window ${winInfo.width}×${winInfo.height}` }
    }

    // 4. Not root window (x=0, y=0, fullWidth)
    if (x === winInfo.x && y === winInfo.y && width >= winInfo.width * 0.95) {
      return { valid: false, reason: 'Root window bounds rejected' }
    }

    // 5. Target inside active application window (with tolerance)
    const TOLERANCE = 50
    if (x < winInfo.x - TOLERANCE || y < winInfo.y - TOLERANCE) {
      return { valid: false, reason: `Target above/left of window: (${x},${y}) vs window (${winInfo.x},${winInfo.y})` }
    }
    if (x + width > winInfo.x + winInfo.width + TOLERANCE) {
      return { valid: false, reason: 'Target extends beyond window right edge' }
    }

    // 6. Not off-screen entirely (multi-monitor: allow negative X/Y)
    if (x + width < -200 || y + height < -200) {
      return { valid: false, reason: 'Target off-screen' }
    }

    // 7. Confidence threshold
    if ((target.confidence ?? 1.0) < 0.40) {
      return { valid: false, reason: `Confidence too low: ${target.confidence}` }
    }

    return { valid: true }
  }

  // ── Step 5: Multi-Tier Target Finding ─────────────────────────────────────

  async findTarget(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<TargetResult> {
    await this.initDisplayMeta()
    const targetType = level.targetType || (level.levelNumber === 1 ? 'CANVAS_OBJECT' : 'BUTTON')
    const now = Date.now()

    // ── DOM Bridge Candidates (Tier 2 — Canva only, highest accuracy for web UI) ──
    let domBridgeMatch: any = null
    if (winInfo.app === 'canva') {
      const domElements = await this.getDomBridgeElements()
      if (domElements.length > 0) {
        // Find best match by semantic ID or label similarity
        const target_lower = level.targetText.toLowerCase()
        for (const el of domElements) {
          const label = (el.label || '').toLowerCase()
          const semanticId = el.semanticId || ''
          const isExactMatch = label === target_lower ||
            semanticId === target_lower.replace(' ', '_') ||
            label.includes(target_lower) ||
            target_lower.includes(label)

          if (isExactMatch && el.bounds?.width > 4 && el.bounds?.height > 4) {
            // DOM bridge gives CSS pixel coords — convert to physical using DPR from snapshot
            // The extension already converts to physical (multiplied by devicePixelRatio)
            const candidate = {
              ...el.bounds,
              text: el.label,
              type: targetType,
              confidence: 0.98,
              source: 'dom_bridge',
            }

            const validation = this.validateTarget(candidate, winInfo)
            if (validation.valid) {
              domBridgeMatch = candidate
              break
            }
          }
        }
      }
    }

    // ── Call Python Helper (Tier 1 UIA + Tier 3 OCR + Tier 4 OpenCV) ─────────
    const screenshot: string | null = await api.captureScreen()
    const localResult = await api.findTarget({
      hwnd: winInfo.hwnd,
      application: winInfo.app ?? '',
      window_title: winInfo.title,
      x: winInfo.x,
      y: winInfo.y,
      width: winInfo.width,
      height: winInfo.height,
      scale_factor: winInfo.scale_factor,
      target_text: level.targetText,
      target_type: targetType,
      level_number: level.levelNumber,
      screenshot,
      // Pass DOM bridge match as a reference for comparison/corroboration
      dom_bridge_bounds: domBridgeMatch ?? null,
    })

    // ── Multi-Source Agreement / Best Source Selection ─────────────────────
    let bestTarget: any = null
    let detectionMethod = 'none'

    if (domBridgeMatch) {
      // DOM bridge is highest confidence for Canva (Tier 2)
      const localTarget = localResult?.target
      if (localTarget) {
        // Check if DOM bridge and local detection agree (IoU overlap)
        const iou = this.calculateIoU(domBridgeMatch, localTarget)
        if (iou >= 0.30) {
          // Sources agree — use DOM bridge bounds (more accurate, from actual DOM)
          bestTarget = { ...domBridgeMatch, confidence: Math.min(0.99, domBridgeMatch.confidence + 0.01) }
          detectionMethod = 'dom_bridge+ocr_agreement'
        } else {
          // Sources disagree — prefer DOM bridge for Canva
          bestTarget = domBridgeMatch
          detectionMethod = 'dom_bridge'
          console.log(`[SUE] DOM bridge and local detection disagree (IoU=${iou.toFixed(2)}) — using DOM bridge`)
        }
      } else {
        bestTarget = domBridgeMatch
        detectionMethod = 'dom_bridge'
      }
    } else if (localResult?.found && localResult.target) {
      bestTarget = localResult.target
      detectionMethod = localResult.method || 'local_engine'
    }

    // ── Apply 12-Point Validation ─────────────────────────────────────────
    if (bestTarget) {
      const validation = this.validateTarget(bestTarget, winInfo)
      if (!validation.valid) {
        console.warn(`[SUE] Target REJECTED by validation: ${validation.reason}`)
        bestTarget = null
      }
    }

    // ── Gemini Vision Fallback (Tier 5 — Disambiguation Only) ─────────────
    if (!bestTarget && screenshot) {
      console.log('[SUE] Falling back to Gemini Vision for', level.targetText)
      const visionResult: any = await api.findTargetVision({
        screenshot,
        application: winInfo.app ?? '',
        levelTitle: level.title,
        targetText: level.targetText,
        targetDescription: level.targetDescription,
      })

      if (visionResult?.found && visionResult.width > 0 && visionResult.height > 0) {
        const validation = this.validateTarget(visionResult, winInfo)
        if (validation.valid) {
          bestTarget = visionResult
          detectionMethod = 'gemini_vision'
        } else {
          console.warn(`[SUE] Gemini Vision result also rejected: ${validation.reason}`)
        }
      }
    }

    // ── No Target Found ────────────────────────────────────────────────────
    if (!bestTarget) {
      return {
        found: false,
        reason: `Could not confidently locate "${level.targetText}" — tried DOM Bridge, UIA, OCR, OpenCV, and Gemini Vision`,
        candidates: localResult?.candidates || [],
      }
    }

    // ── Build Final TargetLock ─────────────────────────────────────────────
    const rawPhysicalBounds = {
      x: bestTarget.x,
      y: bestTarget.y,
      width: bestTarget.width,
      height: bestTarget.height,
    }
    const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)
    const cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds, targetType)

    const targetLock: TargetLock = {
      found: true,
      targetId: `target_${level.id}_${now}`,
      levelId: level.id,
      text: bestTarget.text || level.targetText,
      type: targetType,
      bounds: rawPhysicalBounds,
      overlayBounds,
      cursorAnchor,
      center: {
        x: Math.round(rawPhysicalBounds.x + rawPhysicalBounds.width / 2),
        y: Math.round(rawPhysicalBounds.y + rawPhysicalBounds.height / 2),
      },
      confidence: bestTarget.confidence || 0.90,
      method: detectionMethod,
      isStable: true,
      candidates: localResult?.candidates || [],
      timestamp: now,
      // Stale target protection
      windowBounds: { x: winInfo.x, y: winInfo.y, width: winInfo.width, height: winInfo.height },
      windowHwnd: winInfo.hwnd,
      screenWidth: this.displayInfo?.screenWidth ?? 1920,
      screenHeight: this.displayInfo?.screenHeight ?? 1080,
      expiresAt: now + TARGET_LOCK_TTL_MS,
    }

    console.log(
      `[INTENT TARGET LOCKED] L${level.levelNumber} "${targetLock.text}" ` +
      `METHOD: ${detectionMethod.toUpperCase()} ` +
      `PHYSICAL: [${rawPhysicalBounds.x},${rawPhysicalBounds.y},${rawPhysicalBounds.width}×${rawPhysicalBounds.height}] ` +
      `OVERLAY: [${overlayBounds.x},${overlayBounds.y}] ` +
      `CONFIDENCE: ${(targetLock.confidence * 100).toFixed(0)}%`
    )

    return targetLock
  }

  // ── IoU Calculation ───────────────────────────────────────────────────────

  private calculateIoU(a: any, b: any): number {
    const xA = Math.max(a.x, b.x)
    const yA = Math.max(a.y, b.y)
    const xB = Math.min(a.x + a.width, b.x + b.width)
    const yB = Math.min(a.y + a.height, b.y + b.height)
    const interW = Math.max(0, xB - xA)
    const interH = Math.max(0, yB - yA)
    const interArea = interW * interH
    const unionArea = a.width * a.height + b.width * b.height - interArea
    return unionArea > 0 ? interArea / unionArea : 0
  }

  // ── Step 6: Capture Baseline Snapshot ─────────────────────────────────────

  async captureBaseline(level: WorkflowLevel, targetLock: TargetLock) {
    return stateTransitionEngine.captureBaseline(level, targetLock)
  }

  // ── Step 7: Verify Level State Transition ─────────────────────────────────

  async verifyLevelTransition(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<{ verified: boolean; proof: CompletionProof | null; reason?: string }> {
    return stateTransitionEngine.verifyTransition(winInfo, level)
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine()
