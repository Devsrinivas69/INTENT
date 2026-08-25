import { SupportedApplication, SupportedTask } from './intent'

// ─── Target Type ─────────────────────────────────────────────────────────────

export type TargetType =
  | 'CANVAS_OBJECT'
  | 'BUTTON'
  | 'TAB'
  | 'MENU_ITEM'
  | 'PANEL'
  | 'INPUT'
  | 'TEXT'

// ─── Workflow Level (Action Step) ─────────────────────────────────────────────

export interface WorkflowLevel {
  levelNumber: 1 | 2 | 3 | 4
  id: string
  title: string
  instruction: string
  voiceInstruction: string
  targetType: TargetType
  targetText: string
  targetDescription: string
  expectedBeforeState: string
  expectedAction: string
  expectedAfterState: string
  completionCondition: string
  verificationMethod:
    | 'canva_selection'
    | 'edit_panel_appearance'
    | 'bg_removal_complete'
    | 'animation_panel_appearance'
    | 'excel_insert_tab'
    | 'excel_chart'
    | 'visual_state_change'
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string
  application: SupportedApplication
  task: SupportedTask
  name: string
  description: string
  levels: WorkflowLevel[]
}
