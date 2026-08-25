// ─── Gemini Service (v3) ─────────────────────────────────────────────────────
// Gemini's ONLY roles in v3:
//   1. Intent classification (natural language → workflow)
//   2. Candidate disambiguation (which locally-detected element is the right one)
//   3. State verification (before/after semantic analysis — fallback only)
//
// Gemini does NOT generate absolute screen coordinates.

import { IntentResult, IntentResultSchema } from '../types/intent'
import type { TargetCandidate } from '../types/screenMap'
import type { WorkflowLevel } from '../types/workflow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export class GeminiService {
  // ── Intent Classification ──────────────────────────────────────────────────

  async classifyIntent(text: string): Promise<IntentResult> {
    const raw = await api.classifyIntent(text)
    const result = IntentResultSchema.safeParse(raw)
    if (result.success) return result.data

    // Heuristic fallback
    const lower = text.toLowerCase()
    if (lower.includes('background') || lower.includes('bg') || lower.includes('remove')) {
      return { supported: true, application: 'canva', task: 'remove_background', confidence: 0.95 }
    }
    if (lower.includes('animat') || lower.includes('motion') || lower.includes('fade')) {
      return { supported: true, application: 'canva', task: 'add_animation', confidence: 0.95 }
    }
    if (lower.includes('chart') || lower.includes('graph') || lower.includes('excel') || lower.includes('data')) {
      return { supported: true, application: 'excel', task: 'create_chart', confidence: 0.95 }
    }
    return {
      supported: false,
      message: 'This MVP supports Canva background removal, Canva animation, and Excel chart creation.',
    }
  }

  // ── Candidate Disambiguation ───────────────────────────────────────────────
  // Given locally-detected candidates, Gemini SELECTS the best one.
  // It does NOT invent new coordinates.

  async disambiguateCandidates(params: {
    candidates: Array<{ index: number; text: string; x: number; y: number; width: number; height: number }>
    levelTitle: string
    targetText: string
    targetDescription: string
    screenshot: string | null
  }): Promise<{ chosenIndex: number; reasoning: string }> {
    return api.disambiguateCandidates(params)
  }

  // ── State Verification (Gemini fallback) ───────────────────────────────────
  // Used only when local screen diff + UIA verification both fail.

  async verifyStateChange(params: {
    screenshotAfter: string
    levelTitle: string
    completionCondition: string
    application: string
  }): Promise<{ completed: boolean; confidence: number; evidence: string }> {
    return api.verifyStateChange(params)
  }
}

export const geminiService = new GeminiService()
