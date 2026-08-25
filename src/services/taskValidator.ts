import { VerificationResult } from '../types/screenTarget'
import { Workflow, WorkflowLevel } from '../types/workflow'
import { geminiService } from './gemini'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export class TaskValidator {
  /**
   * Captures screen and checks whether the current Level's completion condition is met.
   */
  async validateLevel(workflow: Workflow, level: WorkflowLevel): Promise<VerificationResult> {
    try {
      const screenshot: string | null = await api.captureScreen()

      if (!screenshot) {
        return { completed: false, confidence: 0, evidence: 'Screen capture unavailable' }
      }

      const result = await geminiService.validateStep(screenshot, workflow, level)

      // Only accept if confidence is high (>= 0.70)
      if (result.completed && (result.confidence >= 0.70)) {
        return result
      }

      return { completed: false, confidence: result.confidence, evidence: result.evidence }
    } catch (err) {
      console.warn('[TaskValidator] Validation error:', err)
      return { completed: false, confidence: 0, error: String(err) }
    }
  }
}

export const taskValidator = new TaskValidator()
