// ─── ScreenUnderstandingEngine v3.4 ──────────────────────────────────────────
// Central multi-tier intelligence layer:
//   1. Full screen analysis & element inventory before every level
//   2. Deterministic candidate generation (OpenCV, WinRT OCR, UIA)
//   3. Composite candidate validation & scoring
//   4. Strict rejection of application windows, full-screen containers, and root panes
//   5. Single authoritative coordinate mapping to Electron Overlay Space
//   6. TargetLock generation

import { coordinateMapper } from './coordinateMapper'
import { stateTransitionEngine } from './stateTransitionEngine'
import type {
  WindowInfo, ScreenMap, TargetCandidate, TargetLock, TargetResult, CompletionProof,
} from '../types/screenMap'
import type { WorkflowLevel } from '../types/workflow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export class ScreenUnderstandingEngine {
  private lastWindowInfo: WindowInfo | null = null

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

  // ── Step 2: Bring Window to Foreground ────────────────────────────────────

  async bringToForeground(hwnd: number): Promise<boolean> {
    try {
      const result = await api.bringToForeground(hwnd)
      return result?.success ?? false
    } catch {
      return false
    }
  }

  // ── Step 3: Full Screen Inventory ─────────────────────────────────────────

  async analyzeScreen(winInfo: WindowInfo): Promise<ScreenMap | null> {
    try {
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
    } catch {
      return null
    }
  }

  // ── Step 4: Multi-Tier Target Finding Pipeline ───────────────────────────

  async findTarget(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<TargetResult> {
    try {
      const screenshot: string | null = await api.captureScreen()
      const targetType = level.targetType || (level.levelNumber === 1 ? 'CANVAS_OBJECT' : 'BUTTON')

      // Call Python helper
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
      })

      if (localResult?.found && localResult.target) {
        const target = localResult.target

        // HARD CONTAINER REJECTION: Reject full-screen or window bounds
        const isGiant = target.width > winInfo.width * 0.70 && target.height > winInfo.height * 0.70
        const isWindowRoot = target.x === 0 && target.y === 0 && target.width >= winInfo.width

        if (!isGiant && !isWindowRoot) {
          const rawPhysicalBounds = {
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
          }
          const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)

          // Center for canvas objects, right below for buttons
          let cursorAnchor: { x: number; y: number }
          if (targetType === 'CANVAS_OBJECT') {
            cursorAnchor = {
              x: Math.round(overlayBounds.x + overlayBounds.width / 2),
              y: Math.round(overlayBounds.y + overlayBounds.height / 2),
            }
          } else {
            cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)
          }

          const targetLock: TargetLock = {
            found: true,
            targetId: `target_${level.id}`,
            levelId: level.id,
            text: target.text || level.targetText,
            type: target.type || targetType,
            bounds: rawPhysicalBounds,
            overlayBounds,
            cursorAnchor,
            center: {
              x: Math.round(rawPhysicalBounds.x + rawPhysicalBounds.width / 2),
              y: Math.round(rawPhysicalBounds.y + rawPhysicalBounds.height / 2),
            },
            confidence: target.confidence || 0.90,
            method: localResult.method || 'local_engine',
            isStable: true,
            candidates: localResult.candidates || [],
            timestamp: Date.now(),
          }

          console.log(
            `[INTENT] LEVEL ${level.levelNumber} LOCKED: "${targetLock.text}" ` +
            `PHYSICAL: [${rawPhysicalBounds.x},${rawPhysicalBounds.y},${rawPhysicalBounds.width},${rawPhysicalBounds.height}] ` +
            `OVERLAY: [${overlayBounds.x},${overlayBounds.y},${overlayBounds.width},${overlayBounds.height}] ` +
            `CURSOR: [${cursorAnchor.x},${cursorAnchor.y}] CONFIDENCE: ${(targetLock.confidence * 100).toFixed(0)}%`
          )

          return targetLock
        } else {
          console.warn('[INTENT] TARGET REJECTED: Full-screen or window container bounds', target)
        }
      }

      // Gemini Vision Fallback (Only if local detection yielded no match)
      if (screenshot) {
        const visionResult: any = await api.findTargetVision({
          screenshot,
          application: winInfo.app ?? '',
          levelTitle: level.title,
          targetText: level.targetText,
          targetDescription: level.targetDescription,
        })

        if (visionResult?.found && visionResult.width > 0 && visionResult.height > 0) {
          const isGiant = visionResult.width > winInfo.width * 0.70 && visionResult.height > winInfo.height * 0.70
          if (!isGiant) {
            const rawPhysicalBounds = {
              x: visionResult.x,
              y: visionResult.y,
              width: visionResult.width,
              height: visionResult.height,
            }
            const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)
            const cursorAnchor = targetType === 'CANVAS_OBJECT'
              ? { x: Math.round(overlayBounds.x + overlayBounds.width / 2), y: Math.round(overlayBounds.y + overlayBounds.height / 2) }
              : coordinateMapper.cursorAnchorFromBounds(overlayBounds)

            const targetLock: TargetLock = {
              found: true,
              targetId: `target_gemini_${level.id}`,
              levelId: level.id,
              text: visionResult.targetText || level.targetText,
              type: targetType,
              bounds: rawPhysicalBounds,
              overlayBounds,
              cursorAnchor,
              center: {
                x: Math.round(rawPhysicalBounds.x + rawPhysicalBounds.width / 2),
                y: Math.round(rawPhysicalBounds.y + rawPhysicalBounds.height / 2),
              },
              confidence: visionResult.confidence || 0.85,
              method: 'gemini_vision',
              isStable: true,
              candidates: [],
              timestamp: Date.now(),
            }

            return targetLock
          }
        }
      }

      return {
        found: false,
        reason: `Could not confidently locate ${level.targetText}`,
        candidates: [],
      }
    } catch (err) {
      return { found: false, reason: String(err), candidates: [] }
    }
  }

  // ── Step 5: Capture Baseline Snapshot ─────────────────────────────────────

  async captureBaseline(level: WorkflowLevel, targetLock: TargetLock) {
    return stateTransitionEngine.captureBaseline(level, targetLock)
  }

  // ── Step 6: Verify Level State Transition ─────────────────────────────────

  async verifyLevelTransition(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<{ verified: boolean; proof: CompletionProof | null; reason?: string }> {
    return stateTransitionEngine.verifyTransition(winInfo, level)
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine()
