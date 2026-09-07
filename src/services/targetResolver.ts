// ─── Target Resolver & Precision Fusion Engine ──────────────────────────────
// Central authoritative resolver implementing:
//   1. Candidate Normalization into Canonical Physical ScreenRect
//   2. IoU Clustering & Multi-Sensor Fusion (UIA + DOM + OCR + OpenCV)
//   3. Deterministic 6-Factor Target Scoring
//   4. Conflict Disambiguation via Gemini (Gemini selects candidate index only)
//   5. Temporal Smoothing & Jitter Hysteresis Tracking
//   6. Target Anchor Extraction (CLICKABLE_CENTER, TEXT_CENTER, etc.)
//
// ZERO-GUESS GUARANTEE: Neither LLMs nor heuristics invent raw coordinates.
// Every pixel originates from deterministic operating system perception.

import type {
  ScreenRect,
  TargetCandidate,
  ResolvedTarget,
  TargetAnchorType,
  WindowInfo,
} from '../types/screenMap'
import { coordinateManager } from './coordinateMapper'
import { geminiService } from './gemini'

// ─── Mathematical Geometry Helpers ──────────────────────────────────────────

export function calculateIoU(a: ScreenRect, b: ScreenRect): number {
  const xA = Math.max(a.x, b.x)
  const yA = Math.max(a.y, b.y)
  const xB = Math.min(a.x + a.width, b.x + b.width)
  const yB = Math.min(a.y + a.height, b.y + b.height)

  const interW = Math.max(0, xB - xA)
  const interH = Math.max(0, yB - yA)
  const interArea = interW * interH

  if (interArea <= 0) return 0.0
  const unionArea = a.width * a.height + b.width * b.height - interArea
  return unionArea > 0 ? interArea / unionArea : 0.0
}

export function calculateCenterDistance(a: ScreenRect, b: ScreenRect): number {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  return Math.hypot(ax - bx, ay - by)
}

// ─── Candidate Normalization & Fusion ───────────────────────────────────────

export class CandidateFusion {
  /**
   * Normalize raw detector candidate dictionaries into strongly-typed TargetCandidate.
   */
  normalizeCandidate(raw: any, source: string, index: number, winInfo?: WindowInfo): TargetCandidate {
    const rawRect: ScreenRect = {
      x: Number(raw.x || 0),
      y: Number(raw.y || 0),
      width: Math.max(4, Number(raw.width || 0)),
      height: Math.max(4, Number(raw.height || 0)),
    }

    let normalizedRect: ScreenRect
    if (source === 'dom' || source === 'dom_bridge') {
      normalizedRect = coordinateManager.domToScreenRect(raw, winInfo)
    } else if (source === 'uia') {
      normalizedRect = coordinateManager.uiaToScreenRect(rawRect)
    } else {
      normalizedRect = rawRect
    }

    const text = String(raw.text || raw.name || raw.label || '').trim()
    const confidence = Math.min(1.0, Math.max(0.1, Number(raw.confidence ?? 0.8)))
    const controlType = String(raw.control_type || raw.type || 'unknown')

    return {
      id: raw.id || `${source}_${index}_${Date.now()}`,
      text,
      type: raw.type || 'BUTTON',
      x: normalizedRect.x,
      y: normalizedRect.y,
      width: normalizedRect.width,
      height: normalizedRect.height,
      rect: normalizedRect,
      confidence,
      source,
      controlType,
      semanticScore: Number(raw.similarity ?? raw.score ?? 0.7),
      visualScore: 0.8,
      interactionScore: this.estimateInteractionScore(controlType, source),
      crossSensorAgreement: 0,
      visibilityScore: 1.0,
      positionalStabilityScore: 1.0,
    }
  }

  private estimateInteractionScore(controlType: string, source: string): number {
    const ct = controlType.toLowerCase()
    if (ct.includes('button') || ct.includes('tab') || ct.includes('menu')) return 0.95
    if (source === 'dom_bridge' || source === 'dom') return 0.90
    if (source === 'uia') return 0.85
    if (source === 'winrt_ocr' || source === 'ocr') return 0.70
    return 0.60
  }

  /**
   * Cluster and fuse overlapping candidates using IoU and spatial proximity.
   * Boosts confidence when multiple distinct sensors agree on the same UI control.
   */
  clusterAndFuse(candidates: TargetCandidate[], iouThreshold: number = 0.35, distThreshold: number = 30): TargetCandidate[] {
    if (candidates.length <= 1) return candidates

    const clusters: TargetCandidate[][] = []
    const visited = new Set<string>()

    for (let i = 0; i < candidates.length; i++) {
      const c1 = candidates[i]
      if (visited.has(c1.id)) continue

      const currentCluster = [c1]
      visited.add(c1.id)

      for (let j = i + 1; j < candidates.length; j++) {
        const c2 = candidates[j]
        if (visited.has(c2.id)) continue

        const rect1 = c1.rect || { x: c1.x, y: c1.y, width: c1.width, height: c1.height }
        const rect2 = c2.rect || { x: c2.x, y: c2.y, width: c2.width, height: c2.height }

        const iou = calculateIoU(rect1, rect2)
        const dist = calculateCenterDistance(rect1, rect2)

        if (iou >= iouThreshold || dist <= distThreshold) {
          currentCluster.push(c2)
          visited.add(c2.id)
        }
      }

      clusters.push(currentCluster)
    }

    // Fuse each cluster into a single consolidated candidate
    const fused: TargetCandidate[] = clusters.map((cluster, clusterIdx) => {
      if (cluster.length === 1) return cluster[0]

      const distinctSources = new Set(cluster.map(c => c.source))
      const hasUia = cluster.find(c => c.source === 'uia')
      const hasDom = cluster.find(c => c.source === 'dom' || c.source === 'dom_bridge')
      const hasOcr = cluster.find(c => c.source === 'winrt_ocr' || c.source === 'ocr')

      // Hitbox selection hierarchy:
      // DOM bridge or UIA has the true clickable control bounding box (hitbox).
      // OCR only has the text glyph bounding box (often smaller or offset inside button).
      const primaryHitbox = hasDom || hasUia || cluster[0]

      // Agreement bonus: up to +0.15 for multi-sensor corroboration
      const agreementBonus = Math.min(0.20, (distinctSources.size - 1) * 0.10)
      const maxConf = Math.max(...cluster.map(c => c.confidence))
      const maxSem = Math.max(...cluster.map(c => c.semanticScore ?? 0.5))

      const fusedSource = Array.from(distinctSources).sort().join('+')
      const fusedText = cluster.find(c => c.text.length > 0)?.text || primaryHitbox.text

      return {
        id: `fused_${clusterIdx}_${primaryHitbox.id}`,
        text: fusedText,
        type: primaryHitbox.type,
        x: primaryHitbox.x,
        y: primaryHitbox.y,
        width: primaryHitbox.width,
        height: primaryHitbox.height,
        rect: primaryHitbox.rect || { x: primaryHitbox.x, y: primaryHitbox.y, width: primaryHitbox.width, height: primaryHitbox.height },
        confidence: Math.min(0.99, maxConf + agreementBonus),
        source: distinctSources.size > 1 ? `fused:${fusedSource}` : primaryHitbox.source,
        controlType: primaryHitbox.controlType,
        semanticScore: maxSem,
        visualScore: 0.9,
        interactionScore: Math.max(...cluster.map(c => c.interactionScore ?? 0.7)),
        crossSensorAgreement: agreementBonus,
        visibilityScore: 1.0,
        positionalStabilityScore: 1.0,
      }
    })

    return fused
  }
}

// ─── Deterministic Target Scorer ────────────────────────────────────────────

export class TargetScorer {
  /**
   * Deterministic 6-Factor scoring function:
   * FinalScore =
   *   0.30 * semanticMatch +
   *   0.25 * detectorConfidence +
   *   0.20 * interactionLikelihood +
   *   0.10 * crossSensorAgreement +
   *   0.10 * visibility +
   *   0.05 * positionalStability
   */
  scoreCandidate(c: TargetCandidate, winInfo?: WindowInfo): number {
    const sem = c.semanticScore ?? 0.7
    const conf = c.confidence ?? 0.8
    const inter = c.interactionScore ?? 0.7
    const agree = c.crossSensorAgreement ? Math.min(1.0, c.crossSensorAgreement / 0.20) : 0.0
    const vis = c.visibilityScore ?? 1.0
    const stab = c.positionalStabilityScore ?? 1.0

    // Spatial bonus: in Canva or ribbon apps, controls in top 20% of window are prioritized
    let spatialBonus = 0
    if (winInfo && winInfo.found && winInfo.height > 0) {
      const relY = c.y - winInfo.y
      if (relY >= 30 && relY <= winInfo.height * 0.22) {
        spatialBonus = 0.05
      }
    }

    const finalScore =
      0.30 * sem +
      0.25 * conf +
      0.20 * inter +
      0.10 * agree +
      0.10 * vis +
      0.05 * stab +
      spatialBonus

    return Math.round(Math.min(0.99, Math.max(0.01, finalScore)) * 1000) / 1000
  }
}

// ─── Dynamic Target Tracker & Jitter Hysteresis ─────────────────────────────

export interface TrackingState {
  lockedTarget: ResolvedTarget | null
  lastObservedAt: number
  lockStabilityCount: number
  hysteresisThresholdPx: number
}

export class TargetTracker {
  private state: TrackingState = {
    lockedTarget: null,
    lastObservedAt: 0,
    lockStabilityCount: 0,
    hysteresisThresholdPx: 4, // Ignore sub-4px jitter
  }

  /**
   * Apply temporal smoothing and jitter suppression.
   * If new position is within hysteresis threshold of locked target, keep locked coordinate.
   * If moved significantly (e.g. window moved or page scrolled), update position cleanly.
   */
  stabilize(newTarget: ResolvedTarget): ResolvedTarget {
    const locked = this.state.lockedTarget
    if (!locked || locked.id !== newTarget.id) {
      this.state.lockedTarget = newTarget
      this.state.lastObservedAt = Date.now()
      this.state.lockStabilityCount = 1
      return newTarget
    }

    const dx = Math.abs(newTarget.rect.x - locked.rect.x)
    const dy = Math.abs(newTarget.rect.y - locked.rect.y)
    const dw = Math.abs(newTarget.rect.width - locked.rect.width)
    const dh = Math.abs(newTarget.rect.height - locked.rect.height)

    // If within jitter threshold, lock to existing coordinates
    if (
      dx <= this.state.hysteresisThresholdPx &&
      dy <= this.state.hysteresisThresholdPx &&
      dw <= this.state.hysteresisThresholdPx &&
      dh <= this.state.hysteresisThresholdPx
    ) {
      this.state.lockStabilityCount++
      return {
        ...newTarget,
        rect: locked.rect,
        overlayRect: locked.overlayRect,
        anchor: locked.anchor,
        cursorAnchor: locked.cursorAnchor,
      }
    }

    // Significant intentional movement detected (scroll, window drag)
    this.state.lockedTarget = newTarget
    this.state.lastObservedAt = Date.now()
    this.state.lockStabilityCount = 1
    return newTarget
  }

  reset() {
    this.state.lockedTarget = null
    this.state.lastObservedAt = 0
    this.state.lockStabilityCount = 0
  }
}

// ─── Target Resolver (Single Authoritative Pipeline) ────────────────────────

export class TargetResolver {
  private fusion = new CandidateFusion()
  private scorer = new TargetScorer()
  private tracker = new TargetTracker()

  /**
   * Full Target Resolution Pipeline:
   * 1. Ingest candidates from UIA, DOM Bridge, OCR, OpenCV
   * 2. Normalize to Canonical Physical Screen Space
   * 3. IoU Clustering & Cross-Sensor Fusion
   * 4. Multi-Factor Scoring
   * 5. Conflict Disambiguation (Gemini only picks candidate index if ambiguous)
   * 6. Precision Locking & Target Anchor Computation
   * 7. Jitter Hysteresis Stabilization
   * 8. Overlay Space Conversion
   */
  async resolve(params: {
    rawCandidates: Array<{ raw: any; source: string }>
    targetText: string
    targetType?: string
    targetDescription?: string
    winInfo?: WindowInfo
    screenshot?: string | null
    anchorType?: TargetAnchorType
  }): Promise<{
    resolved: ResolvedTarget | null
    candidates: TargetCandidate[]
    debugCandidates: TargetCandidate[]
    telemetry: Record<string, any>
  }> {
    const { rawCandidates, targetText, targetType = 'BUTTON', winInfo, screenshot, anchorType = 'CLICKABLE_CENTER' } = params

    // 1. Normalize all candidates
    const normalized: TargetCandidate[] = []
    rawCandidates.forEach((item, idx) => {
      const c = this.fusion.normalizeCandidate(item.raw, item.source, idx, winInfo)
      normalized.push(c)
    })

    // 2. IoU Clustering & Sensor Fusion
    const fusedCandidates = this.fusion.clusterAndFuse(normalized, 0.35, 30)

    // 3. Multi-Factor Scoring
    for (const c of fusedCandidates) {
      c.finalScore = this.scorer.scoreCandidate(c, winInfo)
    }

    // Filter non-viable candidates (giant window frames or tiny noise)
    const viable = fusedCandidates.filter(c => {
      if (c.width < 6 || c.height < 6) return false
      if (winInfo && winInfo.width > 0 && winInfo.height > 0) {
        if (c.width > winInfo.width * 0.85 && c.height > winInfo.height * 0.85) return false
      }
      return (c.finalScore ?? 0) >= 0.40
    })

    viable.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0))

    if (viable.length === 0) {
      return {
        resolved: null,
        candidates: [],
        debugCandidates: normalized,
        telemetry: { status: 'no_viable_candidates', totalFound: normalized.length },
      }
    }

    let selectedCandidate = viable[0]

    // 4. Disambiguation:
    // If top 2 candidates have very close scores (score delta <= 0.12), call Gemini to pick index
    if (viable.length >= 2 && screenshot) {
      const scoreDelta = (viable[0].finalScore ?? 0) - (viable[1].finalScore ?? 0)
      if (scoreDelta <= 0.12) {
        try {
          const disambigPayload = viable.slice(0, 4).map((c, i) => ({
            index: i,
            text: c.text,
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
          }))

          const choice = await geminiService.disambiguateCandidates({
            candidates: disambigPayload,
            levelTitle: targetText,
            targetText,
            targetDescription: params.targetDescription || targetText,
            screenshot,
          })

          if (choice && choice.chosenIndex !== undefined && viable[choice.chosenIndex]) {
            selectedCandidate = viable[choice.chosenIndex]
          }
        } catch (e) {
          // Fall back to top scored candidate on network error
        }
      }
    }

    // 5. Canonical Screen Rect
    const screenRect: ScreenRect = selectedCandidate.rect || {
      x: selectedCandidate.x,
      y: selectedCandidate.y,
      width: selectedCandidate.width,
      height: selectedCandidate.height,
    }

    // 6. Overlay Screen Rect
    const overlayRect = coordinateManager.screenToOverlayRect(screenRect)

    // 7. Interaction Anchor & Cursor Anchor
    const targetAnchor = coordinateManager.computeTargetAnchor(overlayRect, anchorType, targetType)
    const cursorAnchor = coordinateManager.cursorAnchorFromBounds(overlayRect, targetType, targetAnchor)

    const rawResolved: ResolvedTarget = {
      id: selectedCandidate.id,
      rect: screenRect,
      overlayRect,
      anchor: targetAnchor,
      cursorAnchor,
      confidence: selectedCandidate.confidence,
      source: selectedCandidate.source,
      targetType,
      text: selectedCandidate.text || targetText,
      candidates: viable,
      debugCandidates: normalized,
      timestamp: Date.now(),
    }

    // 8. Temporal Stabilization
    const stabilized = this.tracker.stabilize(rawResolved)

    const telemetry = {
      targetText,
      source: stabilized.source,
      physicalRect: stabilized.rect,
      overlayRect: stabilized.overlayRect,
      anchor: stabilized.anchor,
      cursorAnchor: stabilized.cursorAnchor,
      confidence: stabilized.confidence,
      score: selectedCandidate.finalScore,
      candidateCount: viable.length,
    }

    return {
      resolved: stabilized,
      candidates: viable,
      debugCandidates: normalized,
      telemetry,
    }
  }

  resetTracker() {
    this.tracker.reset()
  }
}

export const targetResolver = new TargetResolver()
export default targetResolver
