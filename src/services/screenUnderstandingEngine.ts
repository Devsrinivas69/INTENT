// ─── ScreenUnderstandingEngine v3.3 ──────────────────────────────────────────
// Central multi-tier intelligence layer:
//   - Strict rejection of application windows, full-screen containers, and root panes.
//   - Level 1: Visual Canvas Object Detection (center of poster).
//   - Level 2 & 3: Windows Native OCR & UI Automation for buttons.
//   - Real-time purple selection border & panel transition verification.

import { coordinateMapper } from './coordinateMapper'
import type {
  WindowInfo, ScreenMap, TargetCandidate, TargetLock, TargetResult,
} from '../types/screenMap'
import type { Workflow, WorkflowLevel } from '../types/workflow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export class ScreenUnderstandingEngine {
  private lastScreenshotB64: string | null = null
  private lastWindowInfo: WindowInfo | null = null

  // ── Step 1: Get Window Info ───────────────────────────────────────────────

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

  // ── Step 2: Bring to Foreground (Scenario 2) ─────────────────────────────

  async bringToForeground(hwnd: number): Promise<boolean> {
    try {
      const result = await api.bringToForeground(hwnd)
      return result?.success ?? false
    } catch (err) {
      return false
    }
  }

  // ── Step 3: Full Screen Analysis → ScreenMap ─────────────────────────────

  async analyzeScreen(winInfo: WindowInfo): Promise<ScreenMap | null> {
    try {
      const screenshot = await api.captureScreen()
      this.lastScreenshotB64 = screenshot

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
    } catch (err) {
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
      this.lastScreenshotB64 = screenshot

      const targetType = level.levelNumber === 1 ? 'CANVAS_OBJECT' : 'BUTTON'

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

        // STRICT VALIDATION: Reject full-screen or window bounds
        const isGiant = target.width > winInfo.width * 0.75 && target.height > winInfo.height * 0.75
        const isWindowRoot = target.x === 0 && target.y === 0 && target.width >= winInfo.width

        if (!isGiant && !isWindowRoot) {
          const rawPhysicalBounds = { x: target.x, y: target.y, width: target.width, height: target.height }
          const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)

          // For Level 1 Canvas Object, place cursor in the center of the image
          let cursorAnchor: { x: number; y: number }
          if (targetType === 'CANVAS_OBJECT') {
            cursorAnchor = {
              x: Math.round(overlayBounds.x + overlayBounds.width / 2),
              y: Math.round(overlayBounds.y + overlayBounds.height / 2),
            }
          } else {
            cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)
          }

          console.log(
            `[INTENT] LEVEL: ${level.levelNumber} TARGET: "${target.text}" TYPE: ${targetType} ` +
            `BOUNDS: [${overlayBounds.x},${overlayBounds.y},${overlayBounds.width},${overlayBounds.height}] ` +
            `CURSOR: [${cursorAnchor.x},${cursorAnchor.y}] CONFIDENCE: ${(target.confidence * 100).toFixed(0)}%`
          )

          return {
            found: true,
            text: target.text,
            type: target.type ?? targetType,
            bounds: overlayBounds,
            cursorAnchor,
            confidence: target.confidence,
            method: localResult.method ?? 'visual_engine',
            isStable: true,
            candidates: localResult.candidates ?? [],
          }
        } else {
          console.warn('[INTENT] TARGET REJECTED: Window container or full-screen bounds detected', target)
        }
      }

      // Fallback: Gemini Vision
      if (screenshot) {
        const visionResult: any = await api.findTargetVision({
          screenshot,
          application: winInfo.app ?? '',
          levelTitle: level.title,
          targetText: level.targetText,
          targetDescription: level.targetDescription,
        })

        if (visionResult?.found && visionResult.width > 0 && visionResult.height > 0) {
          const isGiant = visionResult.width > winInfo.width * 0.75 && visionResult.height > winInfo.height * 0.75
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

            return {
              found: true,
              text: visionResult.targetText || level.targetText,
              type: targetType,
              bounds: overlayBounds,
              cursorAnchor,
              confidence: visionResult.confidence || 0.88,
              method: 'gemini_vision',
              isStable: true,
              candidates: [],
            }
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

  // ── Step 5: Verify Level Completion ──────────────────────────────────────

  async verifyLevelComplete(
    winInfo: WindowInfo,
    level: WorkflowLevel,
    screenshotBefore: string | null,
  ): Promise<{ completed: boolean; confidence: number; evidence: string; method: string }> {
    try {
      const screenshotAfter: string | null = await api.captureScreen()

      const raw = await api.verifyLevel({
        hwnd: winInfo.hwnd,
        application: winInfo.app ?? '',
        level_number: level.levelNumber,
        condition: level.completionCondition,
        screenshot_before: screenshotBefore,
        screenshot_after: screenshotAfter,
      })

      if (raw?.completed && raw.confidence >= 0.75) {
        console.log(`[INTENT] LEVEL ${level.levelNumber} VERIFICATION PASSED: ${raw.evidence} (${raw.method})`)
        return {
          completed: true,
          confidence: raw.confidence,
          evidence: raw.evidence,
          method: raw.method,
        }
      }

      // Gemini Vision Fallback Verification
      if (screenshotAfter) {
        const geminiVerify: any = await api.verifyStateChange({
          screenshotAfter,
          levelTitle: level.title,
          completionCondition: level.completionCondition,
          application: winInfo.app ?? '',
        })
        if (geminiVerify?.completed && geminiVerify.confidence >= 0.75) {
          console.log(`[INTENT] LEVEL ${level.levelNumber} VERIFICATION PASSED via Gemini: ${geminiVerify.evidence}`)
          return {
            completed: true,
            confidence: geminiVerify.confidence,
            evidence: geminiVerify.evidence || 'Visual state transition confirmed',
            method: 'gemini_vision',
          }
        }
      }

      return {
        completed: false,
        confidence: raw?.confidence ?? 0.3,
        evidence: raw?.evidence ?? 'Waiting for user action',
        method: raw?.method ?? 'local',
      }
    } catch (err) {
      return { completed: false, confidence: 0, evidence: String(err), method: 'error' }
    }
  }

  async captureCurrentScreenshot(winInfo: WindowInfo): Promise<string | null> {
    try {
      return await api.captureScreen()
    } catch {
      return null
    }
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine()
