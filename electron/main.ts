import { app, BrowserWindow, ipcMain, screen, desktopCapturer, session } from 'electron'
import path, { join } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { spawn, ChildProcess } from 'child_process'
import readline from 'readline'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { WebSocketServer, WebSocket } from 'ws'

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

// ─── Browser Extension DOM Bridge ─────────────────────────────────────────────
// WebSocket server on port 18923 receives DOM element snapshots from the
// Canva browser extension (browser_extension/content.js).
// INTENT uses these as a high-confidence source (Tier 2) for Canva element positions.

const DOM_BRIDGE_PORT = 18923
let domBridgeWss: WebSocketServer | null = null
let lastDomSnapshot: Record<string, any> | null = null
let domBridgeConnected = false

function initDomBridgeServer() {
  try {
    domBridgeWss = new WebSocketServer({ port: DOM_BRIDGE_PORT, host: '127.0.0.1' })

    domBridgeWss.on('connection', (ws: WebSocket) => {
      domBridgeConnected = true
      console.log('[INTENT] Browser extension DOM bridge connected')

      ws.on('message', (raw: Buffer) => {
        try {
          const snapshot = JSON.parse(raw.toString())
          if (snapshot.type === 'canva_dom_snapshot') {
            lastDomSnapshot = snapshot
            // Forward to panel renderer
            panelWin?.webContents.send('dom-bridge:snapshot', snapshot)
          }
        } catch (e) {
          // ignore malformed messages
        }
      })

      ws.on('close', () => {
        domBridgeConnected = false
        console.log('[INTENT] Browser extension DOM bridge disconnected')
      })

      // Send immediate snapshot request
      ws.send(JSON.stringify({ type: 'request_snapshot' }))
    })

    domBridgeWss.on('error', (err: Error) => {
      console.warn('[INTENT] DOM bridge WebSocket error:', err.message)
    })

    console.log(`[INTENT] DOM bridge WebSocket server listening on port ${DOM_BRIDGE_PORT}`)
  } catch (err) {
    console.warn('[INTENT] Could not start DOM bridge server:', err)
  }
}

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
  initDomBridgeServer()

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
  if (domBridgeWss) domBridgeWss.close()
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
  const primary = screen.getPrimaryDisplay()
  const all = screen.getAllDisplays()
  return {
    // Primary display
    screenWidth: primary.bounds.width,
    screenHeight: primary.bounds.height,
    scaleFactor: primary.scaleFactor,
    // Full multi-monitor topology
    displays: all.map(d => ({
      id: d.id,
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === primary.id,
    }))
  }
})

// ─── IPC: DOM Bridge ──────────────────────────────────────────────────────────

ipcMain.handle('dom-bridge:get-elements', () => {
  return {
    connected: domBridgeConnected,
    snapshot: lastDomSnapshot,
    timestamp: lastDomSnapshot?.timestamp ?? null,
  }
})

ipcMain.handle('dom-bridge:request-snapshot', () => {
  if (!domBridgeWss) return { sent: false }
  let sent = false
  domBridgeWss.clients.forEach((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'request_snapshot' }))
      sent = true
    }
  })
  return { sent }
})

ipcMain.handle('dom-bridge:status', () => {
  return { connected: domBridgeConnected }
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

const CANVA_LAYOUT_SCHEMA = `
CANVA EDITOR LAYOUT GROUNDING:
- Top Navigation Bar: y: 0 to 60px (File, Resize, Title, Share, Export)
- Top Contextual Floating Toolbar: y: 60px to 120px (Appears when an element is selected: "Edit photo" / "Edit", Color swatch, "Animate", "Position", "Transparency", "Lock")
- Left Navigation Sidebar: x: 0 to 72px (Design/Templates, Elements, Text, Brand, Uploads, Draw, Projects, Apps)
- Left Tools / Effects Panel: x: 72px to 400px (Opens when tool is clicked: "BG Remover", "Magic Studio", "Filters", "Adjust", "Effects", "Animations: Fade, Pan, Rise, Pop")
- Central Workspace: x: 72px to (width - 380px), y: 110px to (height - 60px)
- Design Canvas / Poster: The rectangular document in the center of the workspace.
- Selection Visual Indicator: When selected, Canva draws a bright purple outline (#8B3DFF) around the element with white resize handles.
`

const EXCEL_LAYOUT_SCHEMA = `
EXCEL WORKBOOK LAYOUT GROUNDING:
- Title Bar & Quick Access: Top 0 to 40px
- Ribbon Tabs: y: 40px to 75px ("File", "Home", "Insert", "Page Layout", "Formulas", "Data", "Review", "View")
- Ribbon Tools / Groups: y: 75px to 160px (Inside Insert tab: Tables, Illustrations, Add-ins, Charts: "Recommended Charts", Column, Bar, Pie)
- Formula Bar: y: 160px to 195px
- Spreadsheet Grid: Center workspace with rows 1..N and columns A..Z
- Chart Object: Floating chart container inserted over grid with legend, title, and series bars/columns.
`

// ─── IPC: Gemini — Candidate Disambiguation ──────────────────────────────────

ipcMain.handle('gemini:disambiguate', async (_, params: {
  candidates: Array<{ index: number; text: string; x: number; y: number; width: number; height: number }>
  levelTitle: string
  targetText: string
  targetDescription: string
  application: string
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

    const layoutContext = params.application === 'excel' ? EXCEL_LAYOUT_SCHEMA : CANVA_LAYOUT_SCHEMA

    const prompt = `You are a precision UI grounding engine for INTENT desktop guidance assistant.

${layoutContext}

Task / Current Level: "${params.levelTitle}"
Target Label: "${params.targetText}"
Description: "${params.targetDescription}"

Locally detected physical candidates:
${candidateList}

Which candidate index corresponds to the required target control for this task?
(Remember: NEVER pick full-window containers or titlebars. Pick the actual button or canvas element).

RESPONSE FORMAT (JSON ONLY):
{"chosenIndex": 0, "reasoning": "Index 0 matches the contextual toolbar button"}`

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
    const layoutContext = params.application === 'excel' ? EXCEL_LAYOUT_SCHEMA : CANVA_LAYOUT_SCHEMA

    const prompt = `You are a precision UI detector for INTENT desktop guidance assistant.

${layoutContext}

Application: ${params.application}
Current Step: "${params.levelTitle}"
Target Label: "${params.targetText}"
Target Description: "${params.targetDescription}"

Examine the screenshot carefully. Find the exact visual UI element described.
Do NOT return the entire application window (e.g. 0,0,1280,672). Return the exact bounding box of the physical button or canvas object in image pixels.

RESPONSE FORMAT (JSON ONLY):
{"found": true, "targetText": "${params.targetText}", "x": 540, "y": 190, "width": 270, "height": 360, "confidence": 0.92}`

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
    const layoutContext = params.application === 'excel' ? EXCEL_LAYOUT_SCHEMA : CANVA_LAYOUT_SCHEMA

    const prompt = `You are a step completion validator for INTENT desktop guidance assistant.

${layoutContext}

Application: ${params.application}
Level: "${params.levelTitle}"
Condition to verify: "${params.completionCondition}"

Look at the screenshot and determine if the user successfully completed this step.
For Canva Level 1: Look for purple selection border around the image or top contextual toolbar.
For Canva Level 2: Look for Edit Photo / Magic Studio left sidebar panel open.
For Canva Level 3: Look for BG Remover processing or transparent background.

RESPONSE FORMAT (JSON ONLY):
{"completed": true, "confidence": 0.94, "evidence": "Canva image is selected with purple border outline and top toolbar"}`

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
    domBridgeConnected,
  }
})
