import { IntentResult } from '../types/intent'
import { geminiService } from './gemini'

// ─── Intent Engine ────────────────────────────────────────────────────────────

export class IntentEngine {
  /**
   * Analyze user's natural language input and classify it into a workflow.
   * Throws if Gemini is unavailable or the response is invalid.
   */
  async analyze(text: string): Promise<IntentResult> {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('Please describe what you want to do.')
    }
    return geminiService.classifyIntent(trimmed)
  }
}

export const intentEngine = new IntentEngine()
