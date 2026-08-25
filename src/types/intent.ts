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

// ─── App States (Strict State Machine) ────────────────────────────────────────

export type AppState =
  | 'IDLE'
  | 'LISTENING'
  | 'UNDERSTANDING'
  | 'CANVA_BACKGROUND_PROMPT'
  | 'APP_DETECTING'
  | 'TASK_SELECTED'
  | 'SCREEN_SCANNING'
  | 'TARGET_SEARCHING'
  | 'TARGET_VALIDATING'
  | 'TARGET_LOCKED'
  | 'LEVEL_ACTIVE'
  | 'WAITING_FOR_USER'
  | 'ACTION_DETECTING'
  | 'VERIFYING'
  | 'LEVEL_COMPLETE'
  | 'NEXT_LEVEL'
  | 'TASK_COMPLETE'
  | 'TARGET_NOT_FOUND'
  | 'SCREEN_MAP_DEBUG'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any)

export type IntentResult = z.infer<typeof IntentResultSchema>
