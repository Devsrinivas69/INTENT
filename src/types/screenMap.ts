import { z } from 'zod'

// ─── Absolute Windows Desktop Bounds ─────────────────────────────────────────
// All internal coordinates are PHYSICAL HARDWARE DESKTOP PIXELS (e.g. 1920x1080).
// They are converted to Electron Overlay CSS Pixels ONLY at the final rendering stage.

export const DesktopBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  screenId: z.union([z.string(), z.number()]).optional(),
})
export type DesktopBounds = z.infer<typeof DesktopBoundsSchema>

export const ScreenRectSchema = DesktopBoundsSchema
export type ScreenRect = DesktopBounds

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

export type TargetAnchorType =
  | 'CENTER'
  | 'TOP'
  | 'BOTTOM'
  | 'LEFT'
  | 'RIGHT'
  | 'TEXT_CENTER'
  | 'ICON_CENTER'
  | 'CLICKABLE_CENTER'
  | 'CANVAS_CENTER'

export interface TargetCandidate {
  id: string
  text: string
  type?: string
  x: number
  y: number
  width: number
  height: number
  rect?: ScreenRect
  confidence: number
  source: 'uia' | 'dom' | 'dom_bridge' | 'ocr' | 'winrt_ocr' | 'opencv' | 'fused' | string
  semanticScore?: number
  visualScore?: number
  interactionScore?: number
  crossSensorAgreement?: number
  visibilityScore?: number
  positionalStabilityScore?: number
  finalScore?: number
  score?: number
  similarity?: number
  controlType?: string
  anchor?: { x: number; y: number }
  metadata?: Record<string, any>
}

// ─── Canonical Resolved Target ────────────────────────────────────────────────

export interface ResolvedTarget {
  id: string
  rect: ScreenRect
  overlayRect: ScreenRect
  anchor: { x: number; y: number }
  cursorAnchor: { x: number; y: number }
  confidence: number
  source: string
  monitorId?: string | number
  targetType: string
  text: string
  candidates: TargetCandidate[]
  debugCandidates?: TargetCandidate[]
  timestamp: number
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
  targetAnchor?: { x: number; y: number } // Primary click interaction point in Overlay CSS Space
  center: { x: number; y: number }       // Physical Center
  confidence: number
  method: string                 // 'opencv_canvas' | 'winrt_ocr' | 'uia' | 'dom_bridge' | 'gemini_disambig' | 'fused'
  isStable: boolean
  candidates: TargetCandidate[]
  debugCandidates?: TargetCandidate[]
  timestamp: number
  // Stale-target protection fields
  windowBounds: DesktopBounds    // Window bounds at time of locking (for staleness check)
  windowHwnd: number             // HWND at time of locking
  screenWidth: number            // Screen dimensions at lock time
  screenHeight: number           // Screen dimensions at lock time
  expiresAt: number              // Unix ms when this lock becomes stale (default: 30s)
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

// ─── Multi-Monitor Display Info ───────────────────────────────────────────────────────────

export interface DisplayRect {
  id: number
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  isPrimary: boolean
  dipBounds?: { x: number; y: number; width: number; height: number }
  physicalBounds?: { x: number; y: number; width: number; height: number }
}

export interface DisplayInfo {
  screenWidth: number
  screenHeight: number
  scaleFactor: number
  virtualLeft?: number
  virtualTop?: number
  totalWidth?: number
  totalHeight?: number
  virtualLeftPhysical?: number
  virtualTopPhysical?: number
  totalWidthPhysical?: number
  totalHeightPhysical?: number
  displays?: DisplayRect[]
}

// ─── Overlay Payload (Transferred to overlayWin) ──────────────────────────────────────────────────────

export interface OverlayPayload {
  visible: boolean
  levelNumber: number
  totalLevels: number
  targetText: string
  instruction: string
  bounds: DesktopBounds | null          // Overlay CSS Pixels
  cursorAnchor: { x: number; y: number } | null // Overlay CSS Pixels
  targetAnchor?: { x: number; y: number } | null // Overlay CSS Pixels
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'ACTION_DETECTED' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
  method: string
  confidence: number
  isDev?: boolean
  debugMode?: boolean
  debugCandidates?: TargetCandidate[]
}
