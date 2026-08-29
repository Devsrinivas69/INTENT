import { canvaRemoveBackground } from './canvaRemoveBackground'
import { canvaAnimation } from './canvaAnimation'
import { canvaAddText } from './canvaAddText'
import { canvaResizeDesign } from './canvaResizeDesign'
import { canvaDownloadDesign } from './canvaDownloadDesign'

import { excelChart } from './excelChart'
import { excelFormatCells } from './excelFormatCells'
import { excelAutoSum } from './excelAutoSum'
import { excelFreezeRow } from './excelFreezeRow'

import { wordFormatHeading } from './wordFormatHeading'
import { wordInsertTable } from './wordInsertTable'
import { wordSpellCheck } from './wordSpellCheck'

import { powerpointAddSlide } from './powerpointAddSlide'
import { powerpointAddTransition } from './powerpointAddTransition'
import { powerpointInsertImage } from './powerpointInsertImage'

import { notepadFindReplace } from './notepadFindReplace'
import { notepadSaveAs } from './notepadSaveAs'

import { calculatorBasicArithmetic } from './calculatorBasicArithmetic'
import { calculatorScientificMode } from './calculatorScientificMode'

import { chromeOpenNewTab } from './chromeOpenNewTab'
import { chromeBookmarkPage } from './chromeBookmarkPage'
import { chromeFindInPage } from './chromeFindInPage'
import { chromeDownloads } from './chromeDownloads'
import { chromeHistory } from './chromeHistory'

import { gmailCompose } from './gmailCompose'
import { gmailReply } from './gmailReply'

import { youtubeSearch } from './youtubeSearch'
import { youtubeFullscreen } from './youtubeFullscreen'

import type { Workflow } from '../types/workflow'
import type { SupportedApplication, SupportedTask } from '../types/intent'

export const workflows: Workflow[] = [
  // Canva Workflows (5)
  canvaRemoveBackground,
  canvaAnimation,
  canvaAddText,
  canvaResizeDesign,
  canvaDownloadDesign,

  // Excel Workflows (4)
  excelChart,
  excelFormatCells,
  excelAutoSum,
  excelFreezeRow,

  // Word Workflows (3)
  wordFormatHeading,
  wordInsertTable,
  wordSpellCheck,

  // PowerPoint Workflows (3)
  powerpointAddSlide,
  powerpointAddTransition,
  powerpointInsertImage,

  // Notepad Workflows (2)
  notepadFindReplace,
  notepadSaveAs,

  // Calculator Workflows (2)
  calculatorBasicArithmetic,
  calculatorScientificMode,

  // Chrome General Workflows (5)
  chromeOpenNewTab,
  chromeBookmarkPage,
  chromeFindInPage,
  chromeDownloads,
  chromeHistory,

  // Gmail Workflows (2)
  gmailCompose,
  gmailReply,

  // YouTube Workflows (2)
  youtubeSearch,
  youtubeFullscreen,
]

export function getWorkflow(
  application: SupportedApplication,
  task: SupportedTask,
): Workflow | null {
  return workflows.find((w) => w.application === application && w.task === task) ?? null
}

export function getWorkflowsForApp(application: SupportedApplication): Workflow[] {
  return workflows.filter((w) => w.application === application)
}

export {
  canvaRemoveBackground,
  canvaAnimation,
  canvaAddText,
  canvaResizeDesign,
  canvaDownloadDesign,
  excelChart,
  excelFormatCells,
  excelAutoSum,
  excelFreezeRow,
  wordFormatHeading,
  wordInsertTable,
  wordSpellCheck,
  powerpointAddSlide,
  powerpointAddTransition,
  powerpointInsertImage,
  notepadFindReplace,
  notepadSaveAs,
  calculatorBasicArithmetic,
  calculatorScientificMode,
  chromeOpenNewTab,
  chromeBookmarkPage,
  chromeFindInPage,
  chromeDownloads,
  chromeHistory,
  gmailCompose,
  gmailReply,
  youtubeSearch,
  youtubeFullscreen,
}
