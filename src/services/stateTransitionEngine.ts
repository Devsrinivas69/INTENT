// ─── State Transition Engine v3.4 ─────────────────────────────────────────────
// Authoritative engine for:
//   1. Capturing and storing baseline snapshots before user actions
//   2. Comparing before-vs-after screen states
//   3. Generating immutable CompletionProof records
//   4. Ensuring TASK_COMPLETE can only be reached if all levels have valid proofs

import type { WorkflowLevel } from '../types/workflow'
import type { WindowInfo, TargetLock, CompletionProof, BaselineState } from '../types/screenMap'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

export class StateTransitionEngine {
  private baselineMap: Map<string, BaselineState> = new Map()

  /**
   * Capture and register the baseline snapshot before the user is given instructions.
   */
  async captureBaseline(
    level: WorkflowLevel,
    targetLock: TargetLock,
  ): Promise<BaselineState | null> {
    try {
      const screenshotB64: string | null = await api.captureScreen()
      if (!screenshotB64) return null

      const baseline: BaselineState = {
        levelNumber: level.levelNumber,
        levelId: level.id,
        screenshotB64,
        targetLock,
        timestamp: Date.now(),
      }

      this.baselineMap.set(level.id, baseline)
      return baseline
    } catch (err) {
      console.warn('[StateTransitionEngine] captureBaseline error:', err)
      return null
    }
  }

  /**
   * Compare after-action state against the stored baseline.
   * Returns CompletionProof on verified state transition.
   */
  async verifyTransition(
    winInfo: WindowInfo,
    level: WorkflowLevel,
  ): Promise<{ verified: boolean; proof: CompletionProof | null; reason?: string }> {
    try {
      const baseline = this.baselineMap.get(level.id)
      const screenshotAfter: string | null = await api.captureScreen()

      if (!screenshotAfter) {
        return { verified: false, proof: null, reason: 'Failed to capture screen' }
      }

      // Call Python helper verification
      const raw = await api.verifyLevel({
        hwnd: winInfo.hwnd,
        application: winInfo.app ?? '',
        level_number: level.levelNumber,
        condition: level.completionCondition,
        target_bounds: baseline?.targetLock.bounds,
        screenshot_before: baseline?.screenshotB64 || null,
        screenshot_after: screenshotAfter,
      })

      if (raw?.completed && raw.confidence >= 0.70) {
        const proof: CompletionProof = {
          levelId: level.id,
          levelNumber: level.levelNumber,
          actionDetected: true,
          stateChanged: true,
          evidence: [raw.evidence || 'Verified state transition'],
          confidence: raw.confidence,
          method: raw.method || 'local_transition',
          timestamp: Date.now(),
          bounds: raw.bounds || baseline?.targetLock.bounds,
        }

        console.log(`[StateTransitionEngine] Level ${level.levelNumber} PROOF GENERATED:`, proof)
        return { verified: true, proof }
      }

      return {
        verified: false,
        proof: null,
        reason: raw?.evidence || 'Waiting for user action',
      }
    } catch (err) {
      return { verified: false, proof: null, reason: String(err) }
    }
  }

  /**
   * Clear all stored baselines (e.g. on reset).
   */
  reset() {
    this.baselineMap.clear()
  }
}

export const stateTransitionEngine = new StateTransitionEngine()
