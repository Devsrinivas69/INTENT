import { z } from 'zod'

// ─── Supported Applications & Tasks ──────────────────────────────────────────

export const SupportedApplicationSchema = z.enum(['canva', 'excel'])
export type SupportedApplication = z.infer<typeof SupportedApplicationSchema>

export const SupportedTaskSchema = z.enum([
  'remove_background',
  'add_animation',
  'create_chart',
])
export type SupportedTask = z.infer<typeof SupportedTaskSchema>

// ─── App States (Explicit State Machine) ──────────────────────────────────────

export type AppState =
  | 'IDLE'
  | 'LISTENING'
  | 'UNDERSTANDING'
  | 'TASK_SELECTED'
  | 'LEVEL_ACTIVE'
  | 'WAITING_FOR_USER'
  | 'VERIFYING'
  | 'LEVEL_COMPLETE'
  | 'TASK_COMPLETE'
  | 'ERROR'

// ─── Intent Result Schemas ───────────────────────────────────────────────────

export const SupportedIntentResultSchema = z.object({
  supported: z.literal(true),
  application: SupportedApplicationSchema,
  task: SupportedTaskSchema,
  confidence: z.number().min(0).max(1),
})

export const UnsupportedIntentResultSchema = z.object({
  supported: z.literal(false),
  message: z.string(),
})

export const IntentResultSchema = z.discriminatedUnion('supported', [
  SupportedIntentResultSchema,
  UnsupportedIntentResultSchema,
])

export type IntentResult = z.infer<typeof IntentResultSchema>
