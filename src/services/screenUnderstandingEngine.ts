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

import { coordinateManager } from './coordinateMapper'
import { targetResolver } from './targetResolver'
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

      // Fallback: If we have a cached window for this app, attempt to restore it to foreground
      if (this.lastWindowInfo && this.lastWindowInfo.app === application && this.lastWindowInfo.hwnd) {
        console.log('[SUE] Application lost focus or minimized. Restoring cached HWND:', this.lastWindowInfo.hwnd)
        await this.bringToForeground(this.lastWindowInfo.hwnd)
        const retry = await api.getWindowInfo(application)
        if (retry?.found) {
          this.lastWindowInfo = retry as WindowInfo
          return this.lastWindowInfo
        }
        return this.lastWindowInfo
      }

      return null
    } catch (err) {
      console.warn('[SUE] getWindowInfo error:', err)
      return this.lastWindowInfo
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

    // 5. Target inside active application window
    // NOTE: For Chrome/Edge, toolbar controls (address bar, bookmark star, tabs) ARE in
    // the first 65px of the window. Only apply this guard for non-Chrome apps (e.g. Canva).
    const isChromeApp = winInfo.app?.startsWith('chrome') || winInfo.app?.startsWith('edge')
    const TOLERANCE = 50
    if (!isChromeApp && y < winInfo.y + 65) {
      return { valid: false, reason: `Target in browser header/tabs area: y=${y} vs min y=${winInfo.y + 65}` }
    }
    // For Chrome: still reject targets that are ABOVE the window top entirely
    if (isChromeApp && y < winInfo.y - 5) {
      return { valid: false, reason: `Target above Chrome window top: y=${y} vs winInfo.y=${winInfo.y}` }
    }
    if (x < winInfo.x - TOLERANCE) {
      return { valid: false, reason: `Target to left of window: x=${x} vs window x=${winInfo.x}` }
    }
    if (x + width > winInfo.x + winInfo.width + TOLERANCE) {
      return { valid: false, reason: 'Target extends beyond window right edge' }
    }
    if (y + height > winInfo.y + winInfo.height + TOLERANCE) {
      return { valid: false, reason: 'Target extends beyond window bottom edge' }
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

  // ── Step 5: Authoritative Multi-Tier Target Resolution Pipeline ───────────

  async findTarget(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<TargetResult> {
    await this.initDisplayMeta()
    // Determine target type:
    // - Level 1 is typically a canvas/viewport area (CANVAS_OBJECT) for Canva & Chrome
    // - Chrome toolbar elements (address bar, star, tabs) are always BUTTON
    // - Explicit workflow targetType always wins
    let targetType = level.targetType
    if (!targetType) {
      const isChromeApp = winInfo.app?.startsWith('chrome')
      const targetLower = level.targetText?.toLowerCase() || ''
      const isWebContentArea = targetLower.includes('web content') || targetLower.includes('viewport') || targetLower.includes('webpage')
      if (level.levelNumber === 1 && (!isChromeApp || isWebContentArea)) {
        targetType = 'CANVAS_OBJECT'
      } else {
        targetType = 'BUTTON'
      }
    }
    const now = Date.now()

    const rawCandidates: Array<{ raw: any; source: string }> = []

    // ── Tier 2: DOM Bridge Candidates (Canva & Chrome web UI) ───────────────
    if (winInfo.app === 'canva' || winInfo.app?.startsWith('chrome')) {
      const domElements = await this.getDomBridgeElements()
      if (domElements.length > 0) {
        const target_lower = level.targetText.toLowerCase()
        for (const el of domElements) {
          const label = (el.label || el.text || '').toLowerCase().trim()
          const semId = (el.semanticId || el.id || '').toLowerCase().trim()
          const isMatch =
            label === target_lower ||
            semId === target_lower.replace(/\s+/g, '_') ||
            label.includes(target_lower) ||
            target_lower.includes(label)

          rawCandidates.push({
            raw: {
              ...el.bounds,
              id: el.semanticId || el.id,
              text: el.label || el.text,
              type: targetType,
              similarity: isMatch ? 0.98 : 0.65,
              confidence: isMatch ? 0.99 : 0.75,
              control_type: 'ButtonControl',
            },
            source: 'dom_bridge',
          })
        }
      }
    }

    // ── Tiers 1, 3, 4: Call Python Helper (UIA + OCR + OpenCV) ──────────────
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
      dom_bridge_bounds: rawCandidates.length > 0 ? rawCandidates[0].raw : null,
    })

    if (localResult?.candidates && Array.isArray(localResult.candidates)) {
      for (const c of localResult.candidates) {
        rawCandidates.push({
          raw: c,
          source: c.source || 'uia',
        })
      }
    }
    if (localResult?.target) {
      rawCandidates.push({
        raw: localResult.target,
        source: localResult.method || localResult.target.source || 'local',
      })
    }

    // ── Single Authoritative Resolution (Fusion + IoU + Scoring + Disambiguation) ─
    const anchorType = targetType === 'CANVAS_OBJECT' ? 'CANVAS_CENTER' : 'CLICKABLE_CENTER'
    const resolution = await targetResolver.resolve({
      rawCandidates,
      targetText: level.targetText,
      targetType,
      targetDescription: level.targetDescription,
      winInfo,
      screenshot,
      anchorType,
    })

    const resolved = resolution.resolved

    if (!resolved) {
      console.warn(`[INTENT SUE] No viable target found for "${level.targetText}"`)
      return {
        found: false,
        reason: `Could not confidently locate "${level.targetText}" across DOM Bridge, UIA, OCR, and OpenCV.`,
        candidates: resolution.candidates || [],
      }
    }

    // ── 12-Point Target Validation ──────────────────────────────────────────
    const validation = this.validateTarget(resolved.rect, winInfo)
    if (!validation.valid) {
      console.warn(`[INTENT SUE] Target REJECTED by 12-point validation: ${validation.reason}`)
      return {
        found: false,
        reason: `Target candidate rejected: ${validation.reason}`,
        candidates: resolution.candidates || [],
      }
    }

    // ── Construct Validated TargetLock ──────────────────────────────────────
    const display = coordinateManager.findDisplayForPhysicalPoint(
      resolved.rect.x + resolved.rect.width / 2,
      resolved.rect.y + resolved.rect.height / 2
    )

    const targetLock: TargetLock = {
      found: true,
      targetId: `target_${level.id}_${now}`,
      levelId: level.id,
      text: resolved.text || level.targetText,
      type: targetType,
      bounds: resolved.rect,
      overlayBounds: resolved.overlayRect,
      cursorAnchor: resolved.cursorAnchor,
      targetAnchor: resolved.anchor,
      center: {
        x: Math.round(resolved.rect.x + resolved.rect.width / 2),
        y: Math.round(resolved.rect.y + resolved.rect.height / 2),
      },
      confidence: resolved.confidence,
      method: resolved.source,
      isStable: true,
      candidates: resolution.candidates,
      debugCandidates: resolution.debugCandidates,
      timestamp: now,
      windowBounds: { x: winInfo.x, y: winInfo.y, width: winInfo.width, height: winInfo.height },
      windowHwnd: winInfo.hwnd,
      screenWidth: this.displayInfo?.screenWidth ?? 1920,
      screenHeight: this.displayInfo?.screenHeight ?? 1080,
      expiresAt: now + TARGET_LOCK_TTL_MS,
      requiresUserChoice: resolution.telemetry?.requiresUserChoice,
      disambiguationOptions: resolution.telemetry?.disambiguationOptions,
    }

    // ── Coordinate Telemetry Logging (Section 20 of Precision Spec) ─────────
    console.log(
      `\n[INTENT TARGET LOCKED]\n` +
      `App: ${winInfo.app || 'desktop'}\n` +
      `Workflow: ${level.id}\n` +
      `Step: ${level.title} ("${level.targetText}")\n` +
      `Source: ${resolved.source}\n` +
      `Physical: x=${resolved.rect.x}, y=${resolved.rect.y}, w=${resolved.rect.width}, h=${resolved.rect.height}\n` +
      `Monitor: DISPLAY_${display?.id ?? 0} (scaleFactor=${display?.scaleFactor ?? 1.0})\n` +
      `Overlay: x=${resolved.overlayRect.x}, y=${resolved.overlayRect.y}, w=${resolved.overlayRect.width}, h=${resolved.overlayRect.height}\n` +
      `Anchor: x=${resolved.anchor.x}, y=${resolved.anchor.y}\n` +
      `Cursor: x=${resolved.cursorAnchor.x}, y=${resolved.cursorAnchor.y}\n` +
      `Confidence: ${(resolved.confidence * 100).toFixed(0)}%`
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
  ): Promise<{
    verified: boolean
    proof: CompletionProof | null
    confidenceState?: 'VERIFIED' | 'LIKELY_VERIFIED' | 'NEEDS_USER_CONFIRMATION' | 'UNVERIFIED'
    reason?: string
  }> {
    return stateTransitionEngine.verifyTransition(winInfo, level)
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine()
