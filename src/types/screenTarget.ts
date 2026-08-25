import { z } from 'zod'

// ─── Target Bounding Box ──────────────────────────────────────────────────────

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

export type BoundingBox = z.infer<typeof BoundingBoxSchema>

// ─── Two-Stage Target Detection Result ────────────────────────────────────────

export const TargetCandidateSchema = z.object({
  targetText: z.string(),
  boundingBox: BoundingBoxSchema,
  score: z.number().min(0).max(1),
})

export const TargetDetectionResultSchema = z.object({
  found: z.boolean(),
  targetText: z.string().optional(),
  confidence: z.number().min(0).max(1),
  boundingBox: BoundingBoxSchema.optional(),
  candidates: z.array(TargetCandidateSchema).optional(),
  reasoning: z.string().optional(),
  error: z.string().optional(),
})

export type TargetDetectionResult = z.infer<typeof TargetDetectionResultSchema>

// ─── Step Verification Result ─────────────────────────────────────────────────

export const VerificationResultSchema = z.object({
  completed: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
  error: z.string().optional(),
})

export type VerificationResult = z.infer<typeof VerificationResultSchema>

// ─── Overlay Data Transferred via IPC ─────────────────────────────────────────

export interface OverlayGuideData {
  levelNumber: number
  totalLevels: number
  targetText: string
  instruction: string
  boundingBox: BoundingBox | null
  cursorPosition: { x: number; y: number } | null
  status: 'GUIDING' | 'WAITING' | 'VERIFYING' | 'COMPLETE'
  isDemoMode: boolean
  method?: string
  confidence?: number
}
