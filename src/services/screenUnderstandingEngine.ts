// ─── ScreenUnderstandingEngine ───────────────────────────────────────────────
// Central multi-tier intelligence layer:
//   Tier 1: Windows UI Automation (Excel / native desktop apps) -> 0.99
//   Tier 2: Windows Native OCR (Canva text / buttons) -> 0.90+
//   Tier 3: Gemini 1.5 Flash Vision (multimodal visual localization) -> 0.85+
//   Tier 4: Workflow coordinates fallback (graceful safety guarantee)

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

      if (!raw || raw.error) {
        console.warn('[SUE] analyzeScreen error:', raw?.error)
        return null
      }

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
      console.warn('[SUE] analyzeScreen error:', err)
      return null
    }
  }

  // ── Step 4: Multi-Tier Target Finding Pipeline ───────────────────────────

  async findTarget(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<TargetResult> {
    try {
      // 1. Capture live screen via Electron
      const screenshot: string | null = await api.captureScreen()
      this.lastScreenshotB64 = screenshot

      // TIER 1 & 2: Local Python Helper (Windows UI Automation + Windows Native OCR)
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
        screenshot,
      })

      if (localResult?.found && localResult.target) {
        const target = localResult.target
        const rawPhysicalBounds = { x: target.x, y: target.y, width: target.width, height: target.height }
        const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)
        const cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)

        console.log(
          `[INTENT TARGET] method=${target.source} target="${target.text}" ` +
          `physical=[${rawPhysicalBounds.x},${rawPhysicalBounds.y},${rawPhysicalBounds.width},${rawPhysicalBounds.height}] ` +
          `overlay=[${overlayBounds.x},${overlayBounds.y},${overlayBounds.width},${overlayBounds.height}] ` +
          `confidence=${target.confidence}`
        )
        console.log(`[INTENT CURSOR] visible=true screenX=${cursorAnchor.x} screenY=${cursorAnchor.y}`)

        return {
          found: true,
          text: target.text,
          type: target.type ?? 'button',
          bounds: overlayBounds,
          cursorAnchor,
          confidence: target.confidence,
          method: target.source ?? 'local_ocr',
          isStable: true,
          candidates: localResult.candidates ?? [],
        }
      }

      // TIER 3: Gemini 1.5 Flash Vision Multimodal Detector
      if (screenshot) {
        console.log(`[SUE] Local text detection not matched for "${level.targetText}". Running Gemini Vision...`)
        const visionResult: any = await api.findTargetVision({
          screenshot,
          application: winInfo.app ?? '',
          levelTitle: level.title,
          targetText: level.targetText,
          targetDescription: level.targetDescription,
        })

        if (visionResult?.found && visionResult.width > 0 && visionResult.height > 0) {
          const rawPhysicalBounds = {
            x: visionResult.x,
            y: visionResult.y,
            width: visionResult.width,
            height: visionResult.height,
          }
          const overlayBounds = coordinateMapper.physicalToOverlay(rawPhysicalBounds)
          const cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)

          console.log(`[INTENT TARGET] method=GeminiVision target="${level.targetText}" confidence=${visionResult.confidence}`)
          console.log(`[INTENT CURSOR] visible=true screenX=${cursorAnchor.x} screenY=${cursorAnchor.y}`)

          return {
            found: true,
            text: visionResult.targetText || level.targetText,
            type: 'button',
            bounds: overlayBounds,
            cursorAnchor,
            confidence: visionResult.confidence || 0.85,
            method: 'gemini_vision',
            isStable: true,
            candidates: [],
          }
        }
      }

      // TIER 4: Graceful workflow coordinates fallback
      console.log(`[SUE] Using workflow coordinates for level "${level.title}"`)
      const demoBox = level.demoCoordinates || { x: 500, y: 300, width: 200, height: 60 }
      const overlayBounds = coordinateMapper.physicalToOverlay(demoBox)
      const cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)

      return {
        found: true,
        text: level.targetText,
        type: 'button',
        bounds: overlayBounds,
        cursorAnchor,
        confidence: 0.80,
        method: 'workflow_guide',
        isStable: true,
        candidates: [],
      }
    } catch (err) {
      console.warn('[SUE] findTarget error:', err)
      const demoBox = level.demoCoordinates || { x: 500, y: 300, width: 200, height: 60 }
      const overlayBounds = coordinateMapper.physicalToOverlay(demoBox)
      const cursorAnchor = coordinateMapper.cursorAnchorFromBounds(overlayBounds)
      return {
        found: true,
        text: level.targetText,
        type: 'button',
        bounds: overlayBounds,
        cursorAnchor,
        confidence: 0.75,
        method: 'fallback',
        isStable: true,
        candidates: [],
      }
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
        condition: level.completionCondition,
        screenshot_before: screenshotBefore,
        screenshot_after: screenshotAfter,
      })

      if (raw?.completed) {
        return {
          completed: true,
          confidence: raw.confidence ?? 0.85,
          evidence: raw.evidence ?? 'State verified',
          method: raw.method ?? 'local',
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
        if (geminiVerify?.completed && geminiVerify.confidence >= 0.70) {
          return {
            completed: true,
            confidence: geminiVerify.confidence,
            evidence: geminiVerify.evidence || 'Gemini verified state change',
            method: 'gemini_vision',
          }
        }
      }

      return {
        completed: false,
        confidence: raw?.confidence ?? 0.3,
        evidence: raw?.evidence ?? 'No state change detected',
        method: raw?.method ?? 'local',
      }
    } catch (err) {
      return { completed: false, confidence: 0, evidence: String(err), method: 'error' }
    }
  }

  // ── Capture current screenshot for before/after comparison ───────────────

  async captureCurrentScreenshot(winInfo: WindowInfo): Promise<string | null> {
    try {
      return await api.captureScreen()
    } catch {
      return null
    }
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine()
