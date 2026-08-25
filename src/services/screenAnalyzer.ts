import { BoundingBox, TargetDetectionResult } from '../types/screenTarget'
import { Workflow, WorkflowLevel } from '../types/workflow'
import { geminiService } from './gemini'
import { coordinateMapper } from './coordinateMapper'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export interface ScreenAnalysisResult {
  found: boolean
  method: 'uia' | 'ocr' | 'gemini' | 'demo'
  targetText: string
  boundingBox: BoundingBox | null
  cursorPosition: { x: number; y: number } | null
  confidence: number
  isDemoMode: boolean
  reasoning?: string
}

export class ScreenAnalyzer {
  /**
   * Captures screen, runs Multi-Layer Target Detection, normalizes coordinates
   * through CoordinateMapper, and positions the Intent Cursor.
   */
  async captureAndAnalyze(
    workflow: Workflow,
    level: WorkflowLevel,
  ): Promise<ScreenAnalysisResult> {
    // 1. Capture screen & fetch display metadata
    const [screenshot, displayInfo] = await Promise.all([
      api.captureScreen() as Promise<string | null>,
      api.getDisplayInfo() as Promise<{ screenWidth: number; screenHeight: number; scaleFactor: number }>,
    ])

    const screenWidth = displayInfo?.screenWidth || window.screen.width || 1920
    const screenHeight = displayInfo?.screenHeight || window.screen.height || 1080
    const scaleFactor = displayInfo?.scaleFactor || window.devicePixelRatio || 1

    if (!screenshot) {
      console.warn('[ScreenAnalyzer] Screenshot unavailable — using demo coordinates')
      return this.buildDemoResult(level, screenWidth, screenHeight)
    }

    // 2. Run Multi-Layer Target Detection (UIA -> OCR -> Gemini)
    try {
      const detection: any = await geminiService.findTarget(screenshot, workflow, level)

      // Strict Confidence Gate:
      if (detection.found && detection.boundingBox && (detection.confidence >= 0.70)) {
        // If UIA returned coordinates, they are already absolute desktop coordinates
        let mappedBox: BoundingBox
        if (detection.method === 'uia') {
          mappedBox = detection.boundingBox
        } else {
          // Map coordinates from screenshot resolution to display viewport
          mappedBox = coordinateMapper.mapBoundingBox(detection.boundingBox, {
            screenWidth,
            screenHeight,
            screenshotWidth: screenWidth * scaleFactor,
            screenshotHeight: screenHeight * scaleFactor,
            devicePixelRatio: scaleFactor,
          })
        }

        const cursorPosition = coordinateMapper.calculateCursorPosition(mappedBox, screenHeight)

        console.log(
          `[INTENT TARGET] method=${detection.method || 'ocr'} target="${detection.targetText || level.targetText}" ` +
          `bounds=${mappedBox.x},${mappedBox.y},${mappedBox.width},${mappedBox.height} confidence=${detection.confidence}`
        )
        console.log(`[INTENT CURSOR] visible=true screenX=${cursorPosition.x} screenY=${cursorPosition.y}`)

        return {
          found: true,
          method: (detection.method as any) || 'ocr',
          targetText: detection.targetText || level.targetText,
          boundingBox: mappedBox,
          cursorPosition,
          confidence: detection.confidence,
          isDemoMode: false,
          reasoning: detection.reasoning,
        }
      } else {
        console.info('[ScreenAnalyzer] Low confidence or target not found — using demo coordinates', detection)
        return this.buildDemoResult(level, screenWidth, screenHeight)
      }
    } catch (err) {
      console.warn('[ScreenAnalyzer] Detection error — using demo coordinates', err)
      return this.buildDemoResult(level, screenWidth, screenHeight)
    }
  }

  private buildDemoResult(
    level: WorkflowLevel,
    screenWidth: number,
    screenHeight: number,
  ): ScreenAnalysisResult {
    const demoBox = level.demoCoordinates || { x: 500, y: 300, width: 200, height: 60 }
    const cursorPosition = coordinateMapper.calculateCursorPosition(demoBox, screenHeight)

    return {
      found: true,
      method: 'demo',
      targetText: level.targetText,
      boundingBox: demoBox,
      cursorPosition,
      confidence: 0.95,
      isDemoMode: true,
      reasoning: 'Demo mode fallback coordinates',
    }
  }
}

export const screenAnalyzer = new ScreenAnalyzer()
