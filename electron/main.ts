import { app, BrowserWindow, ipcMain, screen, desktopCapturer, session } from 'electron'
import path, { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { spawn, execFileSync, ChildProcess } from 'child_process'
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

// ─── Resource Path Resolver (Packaged .exe & Dev Mode) ─────────────────────────

function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    const resPath = join(process.resourcesPath, relativePath)
    if (existsSync(resPath)) return resPath
    const appPath = join(app.getAppPath(), relativePath)
    if (existsSync(appPath)) return appPath
  }
  return join(app.getAppPath(), relativePath)
}

// ─── Persistent Settings Management ──────────────────────────────────────────

interface IntentConfig {
  geminiApiKey?: string
  donationUrl?: string
  lastExtensionId?: string
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'intent_config.json')
}

function loadConfig(): IntentConfig {
  try {
    const configPath = getConfigPath()
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.warn('[INTENT] Could not load stored config:', e)
  }
  return {}
}

function saveConfig(cfg: IntentConfig): void {
  try {
    const configPath = getConfigPath()
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8')
  } catch (e) {
    console.error('[INTENT] Failed to save config:', e)
  }
}

let appConfig: IntentConfig = loadConfig()
let genAI: GoogleGenerativeAI | null = null
let activeGeminiKey = appConfig.geminiApiKey || process.env.GEMINI_API_KEY || ''

function initGemini(key: string): boolean {
  const trimmed = key ? key.trim() : ''
  if (trimmed) {
    try {
      genAI = new GoogleGenerativeAI(trimmed)
      activeGeminiKey = trimmed
      console.log('[INTENT] Gemini API initialized with user/environment key')
      return true
    } catch (e) {
      console.error('[INTENT] Failed to initialize Gemini API:', e)
      genAI = null
      activeGeminiKey = ''
      return false
    }
  } else {
    genAI = null
    activeGeminiKey = ''
    console.warn('[INTENT] No GEMINI_API_KEY found — Local Detectors + Demo Fallback active')
    return false
  }
}

initGemini(activeGeminiKey)

// ─── Python Automation Helper (Windows UI Automation + OCR + OpenCV) ──────────

let pythonProc: ChildProcess | null = null
let pythonStartupReport: Record<string, any> | null = null
let reqId = 0
const pendingRequests = new Map<number, (res: any) => void>()

function initPythonHelper() {
  const scriptPath = getResourcePath('python_helper/main.py')
  try {
    pythonProc = spawn('python', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const rl = readline.createInterface({ input: pythonProc.stdout! })
    rl.on('line', (line) => {
      try {
        const data = JSON.parse(line)
        if (data.type === 'startup_report') {
          pythonStartupReport = data
          console.log('[INTENT] Python helper startup report:', JSON.stringify(data))
          return
        }
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

    const action = cmd.action || 'unknown'
    const timeoutMap: Record<string, number> = {
      analyze_screen_full: 20000,
      analyze_screen: 20000,
      find_target: 15000,
      verify_level: 10000,
      capture_screenshot: 8000,
      get_window_info: 6000,
      bring_to_foreground: 6000,
      ping: 4000,
    }
    const timeoutMs = timeoutMap[action] ?? 15000

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        console.warn(`[INTENT] Python timeout: action=${action} after ${timeoutMs}ms`)
        resolve({ found: false, error: `Python timeout: action=${action} after ${timeoutMs}ms` })
      }
    }, timeoutMs)
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
const NATIVE_HOST_PORT = 18924
let domBridgeWss: WebSocketServer | null = null
let nativeHostWss: WebSocketServer | null = null
let lastDomSnapshot: Record<string, any> | null = null
let domBridgeConnected = false

function ensureNativeHostInstalled() {
  try {
    const scriptPath = getResourcePath('scripts/install_native_host.py')
    execFileSync('python', [scriptPath], { 
      timeout: 8000, 
      windowsHide: true,
      encoding: 'utf8'
    })
    console.log('[INTENT] Native messaging host verified/installed.')
  } catch (e) {
    console.warn('[INTENT] Native host install failed (non-critical):', e)
  }
}

function initDomBridgeServer() {
  try {
    domBridgeWss = new WebSocketServer({ port: DOM_BRIDGE_PORT, host: '127.0.0.1' })

    domBridgeWss.on('connection', (ws: WebSocket) => {
      domBridgeConnected = true
      console.log('[INTENT] Browser extension DOM bridge connected on port 18923')

      ws.on('message', (raw: Buffer) => {
        try {
          const snapshot = JSON.parse(raw.toString())
          if (snapshot.type === 'canva_dom_snapshot' || snapshot.type === 'DOM_SNAPSHOT') {
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
        console.log('[INTENT] Browser extension DOM bridge disconnected on port 18923')
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

  // Second WebSocket Server on Port 18924 for Native Messaging Host
  try {
    nativeHostWss = new WebSocketServer({ port: NATIVE_HOST_PORT, host: '127.0.0.1' })

    nativeHostWss.on('connection', (ws: WebSocket) => {
      domBridgeConnected = true
      console.log('[INTENT] Native messaging host connected on port 18924')

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'DOM_SNAPSHOT' || msg.type === 'canva_dom_snapshot') {
            lastDomSnapshot = msg
            panelWin?.webContents.send('dom-bridge:snapshot', msg)
          }
        } catch (e) {
          // ignore malformed
        }
      })

      ws.on('close', () => {
        console.log('[INTENT] Native messaging host disconnected on port 18924')
      })
    })

    nativeHostWss.on('error', (err: Error) => {
      console.warn('[INTENT] Native host WebSocket error:', err.message)
    })

    console.log(`[INTENT] Native host WebSocket server listening on port ${NATIVE_HOST_PORT}`)
  } catch (err) {
    console.warn('[INTENT] Could not start native host WebSocket server:', err)
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
  const displays = screen.getAllDisplays()
  const virtualLeft = Math.min(...displays.map(d => d.bounds.x))
  const virtualTop = Math.min(...displays.map(d => d.bounds.y))
  const virtualRight = Math.max(...displays.map(d => d.bounds.x + d.bounds.width))
  const virtualBottom = Math.max(...displays.map(d => d.bounds.y + d.bounds.height))
  const totalWidth = virtualRight - virtualLeft
  const totalHeight = virtualBottom - virtualTop

  overlayWin = new BrowserWindow({
    width: totalWidth,
    height: totalHeight,
    x: virtualLeft,
    y: virtualTop,
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
  ensureNativeHostInstalled()
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
  const virtualLeft = Math.min(...all.map(d => d.bounds.x))
  const virtualTop = Math.min(...all.map(d => d.bounds.y))
  const virtualRight = Math.max(...all.map(d => d.bounds.x + d.bounds.width))
  const virtualBottom = Math.max(...all.map(d => d.bounds.y + d.bounds.height))
  return {
    // Primary display
    screenWidth: primary.bounds.width,
    screenHeight: primary.bounds.height,
    scaleFactor: primary.scaleFactor,
    // Virtual desktop bounds
    virtualLeft,
    virtualTop,
    totalWidth: virtualRight - virtualLeft,
    totalHeight: virtualBottom - virtualTop,
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

  // 1. Canva Workflows
  if (lower.includes('background') || lower.includes('bg remover') || (lower.includes('remove') && !lower.includes('slide'))) {
    return { supported: true, application: 'canva', task: 'remove_background', confidence: 0.95 }
  }
  if (lower.includes('animat') || lower.includes('motion')) {
    return { supported: true, application: 'canva', task: 'add_animation', confidence: 0.95 }
  }
  if ((lower.includes('text') || lower.includes('heading')) && (lower.includes('canva') || lower.includes('poster') || lower.includes('design') || (!lower.includes('word') && !lower.includes('doc')))) {
    return { supported: true, application: 'canva', task: 'add_text', confidence: 0.92 }
  }
  if (lower.includes('resize') || lower.includes('magic switch') || lower.includes('dimensions')) {
    return { supported: true, application: 'canva', task: 'resize_design', confidence: 0.95 }
  }
  if (lower.includes('download') || (lower.includes('export') && (lower.includes('canva') || lower.includes('design')))) {
    return { supported: true, application: 'canva', task: 'download_design', confidence: 0.95 }
  }

  // 2. Excel Workflows
  if (lower.includes('chart') || lower.includes('graph') || (lower.includes('create') && lower.includes('excel'))) {
    return { supported: true, application: 'excel', task: 'create_chart', confidence: 0.95 }
  }
  if ((lower.includes('bold') || lower.includes('format') || lower.includes('highlight')) && (lower.includes('cell') || lower.includes('excel') || lower.includes('sheet'))) {
    return { supported: true, application: 'excel', task: 'format_cells', confidence: 0.95 }
  }
  if (lower.includes('autosum') || lower.includes('sum') || lower.includes('total') || lower.includes('add numbers')) {
    return { supported: true, application: 'excel', task: 'autosum', confidence: 0.95 }
  }
  if (lower.includes('freeze') || lower.includes('freeze row') || lower.includes('freeze top row') || lower.includes('lock header')) {
    return { supported: true, application: 'excel', task: 'freeze_row', confidence: 0.95 }
  }

  // 3. Word Workflows
  if ((lower.includes('heading') || lower.includes('heading 1') || (lower.includes('format') && lower.includes('word'))) && !lower.includes('excel')) {
    return { supported: true, application: 'word', task: 'format_heading', confidence: 0.95 }
  }
  if (lower.includes('table') && (lower.includes('word') || lower.includes('doc') || !lower.includes('excel'))) {
    return { supported: true, application: 'word', task: 'insert_table', confidence: 0.95 }
  }
  if (lower.includes('spell') || lower.includes('grammar') || lower.includes('proofread') || lower.includes('editor')) {
    return { supported: true, application: 'word', task: 'spell_check', confidence: 0.95 }
  }

  // 4. PowerPoint Workflows
  if (lower.includes('new slide') || lower.includes('add slide') || lower.includes('insert slide') || (lower.includes('slide') && !lower.includes('transition'))) {
    return { supported: true, application: 'powerpoint', task: 'add_slide', confidence: 0.95 }
  }
  if (lower.includes('transition') || lower.includes('slide transition')) {
    return { supported: true, application: 'powerpoint', task: 'add_transition', confidence: 0.95 }
  }
  if ((lower.includes('picture') || lower.includes('image')) && (lower.includes('powerpoint') || lower.includes('ppt') || lower.includes('slide'))) {
    return { supported: true, application: 'powerpoint', task: 'insert_image', confidence: 0.95 }
  }

  // 5. Notepad Workflows
  if (lower.includes('replace') || lower.includes('find and replace') || (lower.includes('find') && lower.includes('notepad'))) {
    return { supported: true, application: 'notepad', task: 'find_replace', confidence: 0.95 }
  }
  if (lower.includes('save') && (lower.includes('notepad') || lower.includes('txt') || lower.includes('save as'))) {
    return { supported: true, application: 'notepad', task: 'save_as', confidence: 0.95 }
  }

  // 6. Calculator Workflows
  if (lower.includes('calculate') || lower.includes('arithmetic') || lower.includes('plus') || lower.includes('math')) {
    return { supported: true, application: 'calculator', task: 'basic_arithmetic', confidence: 0.95 }
  }
  if (lower.includes('scientific') || lower.includes('sqrt') || lower.includes('sin') || lower.includes('cos') || lower.includes('log')) {
    return { supported: true, application: 'calculator', task: 'scientific_mode', confidence: 0.95 }
  }

  // 7. Chrome Workflows
  if (lower.includes('new tab') || lower.includes('open tab') || lower.includes('open new tab')) {
    return { supported: true, application: 'chrome', task: 'open_new_tab', confidence: 0.95 }
  }
  if (lower.includes('bookmark') || lower.includes('star page')) {
    return { supported: true, application: 'chrome', task: 'bookmark_page', confidence: 0.95 }
  }
  if ((lower.includes('find in page') || lower.includes('search in page') || (lower.includes('find') && (lower.includes('chrome') || lower.includes('page') || lower.includes('web'))))) {
    return { supported: true, application: 'chrome', task: 'find_in_page', confidence: 0.95 }
  }
  if (lower.includes('download') && (lower.includes('chrome') || lower.includes('history') || lower.includes('list') || lower.includes('view downloads'))) {
    return { supported: true, application: 'chrome', task: 'view_downloads', confidence: 0.95 }
  }
  if (lower.includes('clear history') || lower.includes('browsing history') || lower.includes('clear cache') || lower.includes('clear data') || lower.includes('delete history')) {
    return { supported: true, application: 'chrome', task: 'clear_history', confidence: 0.95 }
  }

  // 8. Gmail Workflows
  if (lower.includes('compose') || (lower.includes('send') && (lower.includes('email') || lower.includes('mail') || lower.includes('gmail'))) || lower.includes('new email')) {
    return { supported: true, application: 'chrome_gmail', task: 'compose_email', confidence: 0.95 }
  }
  if (lower.includes('reply') && (lower.includes('email') || lower.includes('mail') || lower.includes('gmail') || lower.includes('message'))) {
    return { supported: true, application: 'chrome_gmail', task: 'reply_email', confidence: 0.95 }
  }

  // 9. YouTube Workflows
  if (lower.includes('fullscreen') || lower.includes('full screen') || lower.includes('maximize video')) {
    return { supported: true, application: 'chrome_youtube', task: 'fullscreen_video', confidence: 0.95 }
  }
  if ((lower.includes('search') || lower.includes('watch') || lower.includes('find')) && (lower.includes('youtube') || lower.includes('video'))) {
    return { supported: true, application: 'chrome_youtube', task: 'search_video', confidence: 0.95 }
  }

  return {
    supported: false,
    message: 'INTENT supports Canva, Excel, Word, PowerPoint, Notepad, Calculator, Chrome, Gmail, and YouTube workflows.',
  }
}

// ─── IPC: Gemini — Intent Classification ─────────────────────────────────────

ipcMain.handle('gemini:classify', async (_, text: string) => {
  if (!genAI) {
    return localClassify(text)
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `You are an intent classifier for INTENT, a Windows desktop AI guidance assistant.
Classify the user's request into exactly one of the supported applications and tasks:

CANVA:
- application="canva", task="remove_background" (Remove background from image/photo)
- application="canva", task="add_animation" (Add animation effects like Fade/Pan to canvas element)
- application="canva", task="add_text" (Add text box or heading to design)
- application="canva", task="resize_design" (Resize canvas dimensions or use Magic Switch)
- application="canva", task="download_design" (Download/export design as PNG/JPG/PDF)

EXCEL:
- application="excel", task="create_chart" (Create column/bar/pie chart from data)
- application="excel", task="format_cells" (Format cells as bold or highlight)
- application="excel", task="autosum" (Calculate AutoSum total for column/row)
- application="excel", task="freeze_row" (Freeze top header row)

WORD:
- application="word", task="format_heading" (Format selected text as Heading 1)
- application="word", task="insert_table" (Insert a table grid into document)
- application="word", task="spell_check" (Run Spelling & Grammar check)

POWERPOINT:
- application="powerpoint", task="add_slide" (Insert a new slide)
- application="powerpoint", task="add_transition" (Add transition effect like Fade to slide)
- application="powerpoint", task="insert_image" (Insert picture/image from device)

NOTEPAD:
- application="notepad", task="find_replace" (Find and replace text in Notepad)
- application="notepad", task="save_as" (Save text file with a name)

CALCULATOR:
- application="calculator", task="basic_arithmetic" (Perform basic addition/arithmetic)
- application="calculator", task="scientific_mode" (Switch to scientific calculator mode)

GOOGLE CHROME:
- application="chrome", task="open_new_tab" (Open a new browser tab and navigate)
- application="chrome", task="bookmark_page" (Bookmark/save current web page)
- application="chrome", task="find_in_page" (Find text/search in page via Ctrl+F)
- application="chrome", task="view_downloads" (View downloads list)
- application="chrome", task="clear_history" (Clear browsing history and cookies)

GMAIL:
- application="chrome_gmail", task="compose_email" (Compose and send new email)
- application="chrome_gmail", task="reply_email" (Reply to an email conversation)

YOUTUBE:
- application="chrome_youtube", task="search_video" (Search for video or creator)
- application="chrome_youtube", task="fullscreen_video" (Maximize video to full screen)

USER REQUEST: "${text}"

RESPONSE FORMAT (JSON ONLY, NO MARKDOWN):
If supported: {"supported":true,"application":"canva","task":"remove_background","confidence":0.95}
If unsupported: {"supported":false,"message":"Unsupported request. INTENT supports Canva, Excel, Word, PowerPoint, Notepad, Calculator, Chrome, Gmail, and YouTube workflows."}`

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
    const parsed = JSON.parse(raw)

    if (!parsed || !parsed.found) {
      return { found: false, confidence: 0, reason: parsed?.reason || 'Target not found by vision' }
    }

    const primary = screen.getPrimaryDisplay()
    const screenWidth = primary.bounds.width
    const screenHeight = primary.bounds.height
    const { x, y, width, height, confidence = 0 } = parsed

    if (
      typeof width !== 'number' || typeof height !== 'number' ||
      typeof x !== 'number' || typeof y !== 'number' ||
      width > screenWidth * 0.70 ||
      height > screenHeight * 0.70 ||
      x < 0 || y < 0 ||
      confidence < 0.55
    ) {
      console.warn(`[INTENT] Gemini vision bounds rejected: x=${x}, y=${y}, w=${width}, h=${height}, conf=${confidence} (Screen: ${screenWidth}x${screenHeight})`)
      return { found: false, confidence: 0, reason: 'Gemini returned full-window bounds — rejected' }
    }

    return parsed
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

// ─── IPC: API Key & System Status ─────────────────────────────────────────────

ipcMain.handle('app:api-status', () => {
  return {
    hasKey: !!activeGeminiKey,
    isCustomKey: !!appConfig.geminiApiKey,
    isDev,
    domBridgeConnected,
    pythonStartupReport,
  }
})

ipcMain.handle('app:startup-report', () => {
  return pythonStartupReport
})

// ─── IPC: Settings & Gemini Key Management ────────────────────────────────────

ipcMain.handle('settings:get', () => {
  return {
    hasKey: !!activeGeminiKey,
    isCustomKey: !!appConfig.geminiApiKey,
    maskedKey: activeGeminiKey ? `${activeGeminiKey.slice(0, 4)}••••••••${activeGeminiKey.slice(-4)}` : '',
    rawKey: activeGeminiKey,
    donationUrl: appConfig.donationUrl || 'https://buymeacoffee.com',
  }
})

ipcMain.handle('settings:save-gemini-key', async (_, apiKey: string) => {
  try {
    const key = (apiKey || '').trim()
    if (!key) {
      delete appConfig.geminiApiKey
      saveConfig(appConfig)
      initGemini(process.env.GEMINI_API_KEY || '')
      return { success: true, message: 'Custom key cleared. Default fallback active.' }
    }

    // Verify key with a quick lightweight call
    const testGenAI = new GoogleGenerativeAI(key)
    const model = testGenAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 2 },
    })

    // Key is verified! Persist and activate
    appConfig.geminiApiKey = key
    saveConfig(appConfig)
    initGemini(key)
    return { success: true, message: 'Gemini API Key verified and saved successfully!' }
  } catch (err: any) {
    console.warn('[INTENT] Gemini Key validation failed:', err)
    return { success: false, error: err?.message || 'Invalid API Key. Please verify and try again.' }
  }
})

ipcMain.handle('settings:test-gemini-key', async (_, apiKey: string) => {
  try {
    const key = (apiKey || '').trim()
    if (!key) return { success: false, error: 'API key cannot be empty' }
    const testGenAI = new GoogleGenerativeAI(key)
    const model = testGenAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'respond with OK' }] }],
      generationConfig: { maxOutputTokens: 5 },
    })
    return { success: true, response: res.response.text().trim() }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Verification test failed' }
  }
})

ipcMain.handle('settings:clear-gemini-key', () => {
  delete appConfig.geminiApiKey
  saveConfig(appConfig)
  initGemini(process.env.GEMINI_API_KEY || '')
  return { success: true }
})

// ─── IPC: Setup & Extension Management ─────────────────────────────────────────

ipcMain.handle('extension:update-id', async (_, extensionId: string) => {
  try {
    execFileSync('python', [
      getResourcePath('scripts/update_extension_id.py'),
      extensionId
    ], { timeout: 5000, windowsHide: true, encoding: 'utf8' })
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('setup:check-python-deps', async () => {
  try {
    const out = execFileSync('python', [
      getResourcePath('scripts/check_python_deps.py')
    ], { timeout: 25000, windowsHide: true, encoding: 'utf8' })
    return { success: true, output: out }
  } catch (e: any) {
    return { success: false, output: e?.stdout || String(e) }
  }
})

ipcMain.handle('setup:install-native-host', async () => {
  try {
    const out = execFileSync('python', [
      getResourcePath('scripts/install_native_host.py')
    ], { timeout: 10000, windowsHide: true, encoding: 'utf8' })
    return { success: true, output: out }
  } catch (e: any) {
    return { success: false, error: String(e) }
  }
})
