import { z } from 'zod'

export const SupportedApplicationSchema = z.enum([
  'canva',
  'excel',
  'word',
  'powerpoint',
  'notepad',
  'calculator',
  'chrome',
  'chrome_gmail',
  'chrome_youtube',
  'chrome_docs',
  'chrome_sheets',
])
export type SupportedApplication = z.infer<typeof SupportedApplicationSchema>

export const SupportedTaskSchema = z.enum([
  // Canva Workflows
  'remove_background',
  'add_animation',
  'add_text',
  'resize_design',
  'download_design',
  // Excel Workflows
  'create_chart',
  'format_cells',
  'autosum',
  'freeze_row',
  // Word Workflows
  'format_heading',
  'insert_table',
  'spell_check',
  // PowerPoint Workflows
  'add_slide',
  'add_transition',
  'insert_image',
  // Notepad Workflows
  'find_replace',
  'save_as',
  // Calculator Workflows
  'basic_arithmetic',
  'scientific_mode',
  // Chrome General Workflows
  'open_new_tab',
  'bookmark_page',
  'find_in_page',
  'view_downloads',
  'clear_history',
  // Gmail Workflows
  'compose_email',
  'reply_email',
  // YouTube Workflows
  'search_video',
  'fullscreen_video',
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
