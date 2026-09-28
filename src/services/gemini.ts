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
    try {
      const raw = await api.classifyIntent(text)
      if (raw && typeof raw === 'object' && 'supported' in raw) {
        return raw as IntentResult
      }
      const result = IntentResultSchema.safeParse(raw)
      if (result.success) return result.data
    } catch {
      // Try local semantic fallback via IPC
      try {
        const local = await api.classifyLocalSemantic?.(text)
        if (local && local.supported) return local as IntentResult
      } catch {}
    }

    return {
      supported: false,
      message: 'Could not classify request. INTENT supports Canva, Excel, Word, PowerPoint, Notepad, Calculator, Chrome, Gmail, and YouTube workflows.',
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
