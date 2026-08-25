import { z } from 'zod'

// ─── Absolute Windows Desktop Bounds ─────────────────────────────────────────
// All coordinates in this system are ABSOLUTE WINDOWS DESKTOP PIXELS.
// Screenshot coordinates, browser coordinates, and window-relative coordinates
// must always be converted to this space before being used.

export const DesktopBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type DesktopBounds = z.infer<typeof DesktopBoundsSchema>

// ─── Screen Element (one detected UI control) ─────────────────────────────────

export const ScreenElementSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['button', 'tab', 'panel', 'image', 'icon', 'menu', 'text', 'unknown']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  confidence: z.number().min(0).max(1),
  source: z.string(),   // 'uia', 'ocr', 'opencv', or combination
  enabled: z.boolean().optional(),
  similarity: z.number().optional(),   // added during candidate ranking
  score: z.number().optional(),        // combined confidence × similarity
})
export type ScreenElement = z.infer<typeof ScreenElementSchema>

// ─── Screen Map (complete element inventory for one screen scan) ──────────────

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

// ─── Window Info (from Python window_detector) ────────────────────────────────

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

// ─── Target Candidate (from Python find_target) ───────────────────────────────

export interface TargetCandidate {
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  source: string
}

// ─── Target Lock (confirmed physical location) ────────────────────────────────
// This is the ONLY thing the Intent Cursor should consume.
// Once a TargetLock is established the cursor moves exactly to these coordinates.

export interface TargetLock {
  found: true
  text: string
  type: string
  bounds: DesktopBounds          // absolute desktop coords
  cursorAnchor: { x: number; y: number }  // Intent Cursor tip position
  confidence: number
  method: string                 // 'uia', 'ocr', 'gemini_disambig', etc.
  isStable: boolean
  candidates: TargetCandidate[]  // all candidates found (for debug HUD)
}

export interface TargetNotFound {
  found: false
  reason: string
  candidates: TargetCandidate[]  // partial candidates for display
}

export type TargetResult = TargetLock | TargetNotFound

// ─── Overlay Payload (sent from main.ts to overlayWin) ───────────────────────

export interface OverlayPayload {
  visible: boolean
  levelNumber: number
  totalLevels: number
  targetText: string
  instruction: string
  bounds: DesktopBounds | null
  cursorAnchor: { x: number; y: number } | null
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
  method: string
  confidence: number
  isDev?: boolean
}
