import { canvaRemoveBackground } from './canvaRemoveBackground'
import { canvaAnimation } from './canvaAnimation'
import { excelChart } from './excelChart'
import type { Workflow } from '../types/workflow'
import type { SupportedApplication, SupportedTask } from '../types/intent'

export const workflows: Workflow[] = [
  canvaRemoveBackground,
  canvaAnimation,
  excelChart,
]

export function getWorkflow(
  application: SupportedApplication,
  task: SupportedTask,
): Workflow | null {
  return workflows.find((w) => w.application === application && w.task === task) ?? null
}

export { canvaRemoveBackground, canvaAnimation, excelChart }
