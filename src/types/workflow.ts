import { SupportedApplication, SupportedTask } from './intent'

// ─── Workflow Level (Action Step) ─────────────────────────────────────────────

export interface WorkflowLevel {
  levelNumber: 1 | 2 | 3 | 4
  id: string
  title: string
  instruction: string
  voiceInstruction: string
  targetText: string
  targetDescription: string
  completionCondition: string
  demoCoordinates?: {
    x: number
    y: number
    width: number
    height: number
  }
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
