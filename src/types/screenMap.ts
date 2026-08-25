import { z } from 'zod'

// ─── Absolute Windows Desktop Bounds ─────────────────────────────────────────
// All internal coordinates are PHYSICAL HARDWARE DESKTOP PIXELS (e.g. 1920x1080).
// They are converted to Electron Overlay CSS Pixels ONLY at the final rendering stage.

export const DesktopBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type DesktopBounds = z.infer<typeof DesktopBoundsSchema>

// ─── Screen Element (Single Detected UI Control) ─────────────────────────────

export const ScreenElementSchema = z.object({
  id: z.string(),
  type: z.enum(['button', 'tab', 'panel', 'image', 'icon', 'menu', 'text', 'canvas_object', 'input', 'unknown']),
  text: z.string(),
  role: z.string().optional(),
  bounds: DesktopBoundsSchema,
  center: z.object({ x: z.number(), y: z.number() }),
  confidence: z.number().min(0).max(1),
  source: z.string(), // 'uia' | 'winrt_ocr' | 'opencv' | 'multi_detector'
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
  similarity: z.number().optional(),
  score: z.number().optional(),
})
export type ScreenElement = z.infer<typeof ScreenElementSchema>

// ─── Screen Map (Complete Physical Inventory of Visible Screen) ───────────────

export const ScreenMapSchema = z.object({
  capturedAt: z.number(),
  application: z.string(),
  windowTitle: z.string(),
  windowBounds: DesktopBoundsSchema,
  scaleFactor: z.number(),
  elements: z.array(ScreenElementSchema),
  element_count: z.number().optional(),
})
export type ScreenMap = z.infer<typeof ScreenMapSchema>

// ─── Window Info (from Win32 window_detector) ─────────────────────────────────

export interface WindowInfo {
  found: boolean
  app: string | null
  title: string
  hwnd: number
  x: number
  y: number
  width: number
  height: number
  scale_factor: number
  is_foreground: boolean
}

// ─── Target Candidate ─────────────────────────────────────────────────────────

export interface TargetCandidate {
  id?: string
  text: string
  type?: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  source: string
  score?: number
  similarity?: number
}

// ─── Target Lock (Authoritative Validated Target Location) ───────────────────

export interface TargetLock {
  found: true
  targetId: string
  levelId: string
  text: string
  type: string
  bounds: DesktopBounds          // Raw Physical Desktop Pixels
  overlayBounds: DesktopBounds   // Electron Overlay CSS Pixels
  cursorAnchor: { x: number; y: number } // Cursor anchor in Overlay CSS Space
  center: { x: number; y: number }       // Physical Center
  confidence: number
  method: string                 // 'opencv_canvas' | 'winrt_ocr' | 'uia' | 'gemini_disambig'
  isStable: boolean
  candidates: TargetCandidate[]
  timestamp: number
}

export interface TargetNotFound {
  found: false
  reason: string
  candidates: TargetCandidate[]
}

export type TargetResult = TargetLock | TargetNotFound

// ─── Target Validation Result ────────────────────────────────────────────────

export interface TargetValidationResult {
  valid: boolean
  reason?: string
  score: number
  candidate?: TargetCandidate
}

// ─── Completion Proof (Mandatory Evidence for Level Completion) ──────────────

export interface CompletionProof {
  levelId: string
  levelNumber: number
  actionDetected: boolean
  stateChanged: boolean
  evidence: string[]
  confidence: number
  method: string
  timestamp: number
  bounds?: DesktopBounds
}

// ─── Baseline State (Captured Before User Action) ────────────────────────────

export interface BaselineState {
  levelNumber: number
  levelId: string
  screenshotB64: string
  targetLock: TargetLock
  timestamp: number
}

// ─── Overlay Payload (Transferred to overlayWin) ─────────────────────────────

export interface OverlayPayload {
  visible: boolean
  levelNumber: number
  totalLevels: number
  targetText: string
  instruction: string
  bounds: DesktopBounds | null          // Overlay CSS Pixels
  cursorAnchor: { x: number; y: number } | null // Overlay CSS Pixels
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'ACTION_DETECTED' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
  method: string
  confidence: number
  isDev?: boolean
}
