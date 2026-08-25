import { app, BrowserWindow, ipcMain, screen, desktopCapturer, session } from 'electron'
import path, { join } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { spawn, ChildProcess } from 'child_process'
import readline from 'readline'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load environment variables
dotenv.config()

// Disable Electron security warnings in dev
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

const isDev = process.env.NODE_ENV === 'development'
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const DIST = join(__dirname, '../dist')

function getPreloadPath(): string {
  if (existsSync(join(__dirname, 'preload.mjs'))) return join(__dirname, 'preload.mjs')
  if (existsSync(join(__dirname, 'preload.js'))) return join(__dirname, 'preload.js')
  return join(__dirname, 'preload.cjs')
}

// ─── Gemini AI Setup ─────────────────────────────────────────────────────────

let genAI: GoogleGenerativeAI | null = null

if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim())
  console.log('[INTENT] Gemini API initialized')
} else {
  console.warn('[INTENT] No GEMINI_API_KEY found — Local Detectors + Demo Fallback active')
}

// ─── Python Automation Helper (Windows UI Automation + OCR + OpenCV) ──────────

let pythonProc: ChildProcess | null = null
let reqId = 0
const pendingRequests = new Map<number, (res: any) => void>()

function initPythonHelper() {
  const scriptPath = join(app.getAppPath(), 'python_helper/main.py')
  try {
    pythonProc = spawn('python', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const rl = readline.createInterface({ input: pythonProc.stdout! })
    rl.on('line', (line) => {
      try {
        const data = JSON.parse(line)
        if (data.id !== undefined && pendingRequests.has(data.id)) {
          const resolve = pendingRequests.get(data.id)!
          pendingRequests.delete(data.id)
          resolve(data)
        }
      } catch (err) {
        console.warn('[PythonHelper] JSON error:', err)
      }
    })

    pythonProc.stderr?.on('data', (d) => {
      console.warn('[PythonHelper stderr]:', d.toString())
    })

    pythonProc.on('close', () => {
      pythonProc = null
    })
    console.log('[INTENT] Local Windows Automation Helper started')
  } catch (err) {
    console.warn('[INTENT] Could not start Python helper:', err)
  }
}

function sendPythonCommand(cmd: Record<string, any>): Promise<any> {
  return new Promise((resolve) => {
    if (!pythonProc || !pythonProc.stdin?.writable) {
      resolve({ found: false, error: 'Helper not running' })
      return
    }

    const id = ++reqId
    pendingRequests.set(id, resolve)
    pythonProc.stdin.write(JSON.stringify({ ...cmd, id }) + '\n')

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        resolve({ found: false, error: 'Timeout' })
      }
    }, 6000)
  })
}

// ─── Window References ───────────────────────────────────────────────────────

let floatingWin: BrowserWindow | null = null
let panelWin: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null

// ─── URL Helpers ─────────────────────────────────────────────────────────────

function getURL(page: string): string {
  if (VITE_DEV_SERVER_URL) {
    return `${VITE_DEV_SERVER_URL}${page}`
  }
  return `file://${join(DIST, page)}`
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createFloatingWindow() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize

  floatingWin = new BrowserWindow({
    width: 56,
    height: 56,
    x: width - 80,
    y: height - 80,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  floatingWin.setAlwaysOnTop(true, 'screen-saver')
  floatingWin.loadURL(getURL('index.html'))
  floatingWin.on('closed', () => { floatingWin = null })
}

function createPanelWindow() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize

  panelWin = new BrowserWindow({
    width: 380,
    height: 520,
    x: width - 410,
    y: Math.max(30, height - 580),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  panelWin.setAlwaysOnTop(true, 'screen-saver')
  panelWin.loadURL(getURL('panel.html'))
  panelWin.on('closed', () => { panelWin = null })
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.bounds

  overlayWin = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  overlayWin.loadURL(getURL('overlay.html'))
  overlayWin.on('closed', () => { overlayWin = null })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  initPythonHelper()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      callback(true)
    } else {
      callback(false)
    }
  })

  createOverlayWindow()
  createPanelWindow()
  createFloatingWindow()
})

app.on('window-all-closed', () => {
  if (pythonProc) pythonProc.kill()
  app.quit()
})

// ─── IPC: Window Controls ────────────────────────────────────────────────────

ipcMain.handle('window:toggle-panel', () => {
  if (!panelWin) return
  if (panelWin.isVisible()) {
    panelWin.hide()
    overlayWin?.hide()
  } else {
    panelWin.show()
    panelWin.focus()
  }
})

ipcMain.handle('window:hide-panel', () => {
  panelWin?.hide()
  overlayWin?.hide()
})

ipcMain.handle('window:show-overlay', (_, data: unknown) => {
  if (!overlayWin) return
  overlayWin.show()
  overlayWin.webContents.send('overlay:update', data)
})

ipcMain.handle('window:update-overlay', (_, data: unknown) => {
  if (!overlayWin?.isVisible()) return
  overlayWin.webContents.send('overlay:update', data)
})

ipcMain.handle('window:hide-overlay', () => {
  overlayWin?.hide()
})

// ─── IPC: Screen Capture & Display Info ──────────────────────────────────────

ipcMain.handle('screen:get-display-info', () => {
  const display = screen.getPrimaryDisplay()
  return {
    screenWidth: display.bounds.width,
    screenHeight: display.bounds.height,
    scaleFactor: display.scaleFactor,
  }
})

ipcMain.handle('screen:capture', async () => {
  try {
    const display = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: display.bounds.width * display.scaleFactor,
        height: display.bounds.height * display.scaleFactor,
      },
    })

    if (sources.length === 0) return null
    return sources[0].thumbnail.toDataURL()
  } catch (err) {
    console.error('[INTENT] Screen capture error:', err)
    return null
  }
})

// ─── IPC: ScreenUnderstandingEngine Python RPCs ──────────────────────────────

ipcMain.handle('intent:get-window-info', async (_, application?: string) => {
  return sendPythonCommand({
    action: 'get_window_info',
    application,
  })
})

ipcMain.handle('intent:bring-to-foreground', async (_, hwnd: number) => {
  return sendPythonCommand({
    action: 'bring_to_foreground',
    hwnd,
  })
})

ipcMain.handle('intent:analyze-screen', async (_, params: Record<string, any>) => {
  return sendPythonCommand({
    action: 'analyze_screen_full',
    ...params,
  })
})

ipcMain.handle('intent:find-target', async (_, params: Record<string, any>) => {
  return sendPythonCommand({
    action: 'find_target',
    ...params,
  })
})

ipcMain.handle('intent:verify-level', async (_, params: Record<string, any>) => {
  return sendPythonCommand({
    action: 'verify_level',
    ...params,
  })
})

ipcMain.handle('intent:capture-screenshot', async (_, params: Record<string, any>) => {
  return sendPythonCommand({
    action: 'capture_screenshot',
    ...params,
  })
})

// ─── Local Intent Classification Fallback ────────────────────────────────────

function localClassify(text: string) {
  const lower = text.toLowerCase()
  if (lower.includes('background') || lower.includes('bg') || lower.includes('remove')) {
    return { supported: true, application: 'canva', task: 'remove_background', confidence: 0.95 }
  }
  if (lower.includes('animat') || lower.includes('motion') || lower.includes('fade')) {
    return { supported: true, application: 'canva', task: 'add_animation', confidence: 0.95 }
  }
  if (lower.includes('chart') || lower.includes('graph') || lower.includes('excel') || lower.includes('data')) {
    return { supported: true, application: 'excel', task: 'create_chart', confidence: 0.95 }
  }
  return {
    supported: false,
    message: 'This MVP supports Canva background removal, Canva animation, and Excel chart creation.',
  }
}

// ─── IPC: Gemini — Intent Classification ─────────────────────────────────────

ipcMain.handle('gemini:classify', async (_, text: string) => {
  if (!genAI) {
    return localClassify(text)
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `You are an intent classifier for INTENT, a desktop guidance assistant.
Classify the user's request into exactly one of the supported workflows:
1. application="canva", task="remove_background" (Remove image background)
2. application="canva", task="add_animation" (Add animation to element)
3. application="excel", task="create_chart" (Create chart from data)

USER REQUEST: "${text}"

RESPONSE FORMAT (JSON ONLY, NO MARKDOWN):
If supported: {"supported":true,"application":"canva","task":"remove_background","confidence":0.95}
If unsupported: {"supported":false,"message":"This MVP supports Canva background removal, Canva animation, and Excel chart creation."}`

    const result = await model.generateContent(prompt)
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[INTENT] Gemini classify error, using local classifier:', err)
    return localClassify(text)
  }
})

// ─── IPC: Gemini — Candidate Disambiguation ──────────────────────────────────
// Given candidate bounding boxes detected locally, Gemini selects the best match.

ipcMain.handle('gemini:disambiguate', async (_, params: {
  candidates: Array<{ index: number; text: string; x: number; y: number; width: number; height: number }>
  levelTitle: string
  targetText: string
  targetDescription: string
  screenshot: string | null
}) => {
  if (!genAI || !params.candidates.length) {
    return { chosenIndex: 0, reasoning: 'Fallback to first candidate' }
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const candidateList = params.candidates
      .map((c) => `[Index ${c.index}] "${c.text}" at (x:${c.x}, y:${c.y}, w:${c.width}, h:${c.height})`)
      .join('\n')

    const prompt = `You are disambiguating UI control candidates for INTENT desktop guidance assistant.

Task / Current Level: "${params.levelTitle}"
Target Label: "${params.targetText}"
Description: "${params.targetDescription}"

Locally detected candidates:
${candidateList}

Which candidate index best matches the target control for this task?

RESPONSE FORMAT (JSON ONLY):
{"chosenIndex": 0, "reasoning": "Index 0 exactly matches the requested button"}`

    const contents: any[] = [prompt]
    if (params.screenshot) {
      const base64 = params.screenshot.replace(/^data:image\/(png|jpeg|webp);base64,/, '')
      contents.push({
        inlineData: { data: base64, mimeType: 'image/png' },
      })
    }

    const result = await model.generateContent(contents)
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[INTENT] Gemini disambiguation error:', err)
    return { chosenIndex: 0, reasoning: 'Fallback due to error' }
  }
})

// ─── IPC: Gemini — Multimodal Target Vision Fallback ─────────────────────────

ipcMain.handle('gemini:find-target-vision', async (_, params: {
  screenshot: string
  application: string
  levelTitle: string
  targetText: string
  targetDescription: string
}) => {
  if (!genAI) return { found: false, confidence: 0 }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const base64 = params.screenshot.replace(/^data:image\/(png|jpeg|webp);base64,/, '')

    const prompt = `You are a precision UI detector for INTENT desktop guidance assistant.

Application: ${params.application}
Current Step: "${params.levelTitle}"
Target Label: "${params.targetText}"
Target Description: "${params.targetDescription}"

Examine the screenshot carefully. Find the UI element described.
Return bounding box in image pixel coordinates (x, y, width, height from top-left of image).

RESPONSE FORMAT (JSON ONLY):
{"found": true, "targetText": "${params.targetText}", "x": 560, "y": 340, "width": 400, "height": 300, "confidence": 0.88}`

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: 'image/png' } },
    ])
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[INTENT] Gemini target vision error:', err)
    return { found: false, confidence: 0 }
  }
})

// ─── IPC: Gemini — State Verification (Fallback) ──────────────────────────────

ipcMain.handle('gemini:verify-state', async (_, params: {
  screenshotAfter: string
  levelTitle: string
  completionCondition: string
  application: string
}) => {
  if (!genAI) return { completed: false, confidence: 0, evidence: 'No API key' }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const base64 = params.screenshotAfter.replace(/^data:image\/(png|jpeg|webp);base64,/, '')

    const prompt = `You are a step completion validator for INTENT desktop guidance assistant.

Application: ${params.application}
Level: "${params.levelTitle}"
Condition to verify: "${params.completionCondition}"

Look at the screenshot and determine if the user performed this action.

RESPONSE FORMAT (JSON ONLY):
{"completed": true, "confidence": 0.90, "evidence": "Observed the expected panel open"}`

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType: 'image/png' } },
    ])
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[INTENT] Gemini state verify error:', err)
    return { completed: false, confidence: 0, evidence: String(err) }
  }
})

// ─── IPC: API Key Status ──────────────────────────────────────────────────────

ipcMain.handle('app:api-status', () => {
  return {
    hasKey: !!process.env.GEMINI_API_KEY,
    isDev,
  }
})
