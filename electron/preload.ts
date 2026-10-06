import { contextBridge, ipcRenderer } from 'electron'

// ─── Type Definitions ─────────────────────────────────────────────────────────

type OverlayUpdateHandler = (data: unknown) => void

// ─── Electron API Bridge ──────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window Management ──────────────────────────────────────────────────────
  togglePanel: () => ipcRenderer.invoke('window:toggle-panel'),
  hidePanel: () => ipcRenderer.invoke('window:hide-panel'),
  showOverlay: (data: unknown) => ipcRenderer.invoke('window:show-overlay', data),
  updateOverlay: (data: unknown) => ipcRenderer.invoke('window:update-overlay', data),
  hideOverlay: () => ipcRenderer.invoke('window:hide-overlay'),

  // ── Screen Capture & Display Info ──────────────────────────────────────────
  captureScreen: (): Promise<string | null> =>
    ipcRenderer.invoke('screen:capture'),

  getDisplayInfo: (): Promise<{ screenWidth: number; screenHeight: number; scaleFactor: number; displays?: any[] }> =>
    ipcRenderer.invoke('screen:get-display-info'),

  // ── ScreenUnderstandingEngine Python IPC ──────────────────────────────────
  getWindowInfo: (application?: string): Promise<unknown> =>
    ipcRenderer.invoke('intent:get-window-info', application),

  bringToForeground: (hwnd: number): Promise<unknown> =>
    ipcRenderer.invoke('intent:bring-to-foreground', hwnd),

  analyzeScreen: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('intent:analyze-screen', params),

  findTarget: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('intent:find-target', params),

  verifyLevel: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('intent:verify-level', params),

  captureScreenshot: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('intent:capture-screenshot', params),

  // ── Gemini AI Services ────────────────────────────────────────────────────
  classifyIntent: (text: string): Promise<unknown> =>
    ipcRenderer.invoke('gemini:classify', text),

  disambiguateCandidates: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('gemini:disambiguate', params),

  findTargetVision: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('gemini:find-target-vision', params),

  verifyStateChange: (params: unknown): Promise<unknown> =>
    ipcRenderer.invoke('gemini:verify-state', params),

  // ── DOM Bridge ───────────────────────────────────────────────────────────
  getDomElements: (): Promise<unknown> =>
    ipcRenderer.invoke('dom-bridge:get-elements'),

  requestDomSnapshot: (): Promise<unknown> =>
    ipcRenderer.invoke('dom-bridge:request-snapshot'),

  getDomBridgeStatus: (): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke('dom-bridge:status'),

  onDomBridgeSnapshot: (callback: (snapshot: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, snapshot: unknown) => callback(snapshot)
    ipcRenderer.on('dom-bridge:snapshot', handler)
    return () => ipcRenderer.removeListener('dom-bridge:snapshot', handler)
  },

  // ── App Status & Settings ──────────────────────────────────────────────────
  getApiStatus: (): Promise<{ hasKey: boolean; isCustomKey?: boolean; isDev: boolean; domBridgeConnected?: boolean; pythonStartupReport?: any }> =>
    ipcRenderer.invoke('app:api-status'),

  getStartupReport: (): Promise<any> =>
    ipcRenderer.invoke('app:startup-report'),

  getSettings: (): Promise<{ hasKey: boolean; isCustomKey: boolean; maskedKey: string; rawKey: string; modelName?: string; donationUrl: string }> =>
    ipcRenderer.invoke('settings:get'),

  saveGeminiKey: (apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('settings:save-gemini-key', apiKey),

  testGeminiKey: (apiKey: string): Promise<{ success: boolean; response?: string; error?: string }> =>
    ipcRenderer.invoke('settings:test-gemini-key', apiKey),

  clearGeminiKey: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('settings:clear-gemini-key'),

  updateExtensionId: (extensionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('extension:update-id', extensionId),

  checkPythonDeps: (): Promise<{ success: boolean; output: string }> =>
    ipcRenderer.invoke('setup:check-python-deps'),

  installNativeHost: (): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('setup:install-native-host'),

  // ── Overlay Events ────────────────────────────────────────────────────────
  onOverlayUpdate: (callback: OverlayUpdateHandler) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('overlay:update', handler)
    return () => ipcRenderer.removeListener('overlay:update', handler)
  },

  onToggleDebug: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('overlay:toggle-debug', handler)
    return () => ipcRenderer.removeListener('overlay:toggle-debug', handler)
  },

  // ── Connectivity & Offline Mode ──────────────────────────────────────────
  getConnectivityStatus: (): Promise<any> =>
    ipcRenderer.invoke('connectivity:get-status'),

  probeConnectivity: (): Promise<any> =>
    ipcRenderer.invoke('connectivity:probe'),

  onConnectivityChanged: (callback: (status: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on('connectivity:changed', handler)
    return () => ipcRenderer.removeListener('connectivity:changed', handler)
  },

  // ── Task Persistence & Offline Queue ───────────────────────────────────────
  saveTask: (task: any): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('task:save', task),

  loadActiveTask: (): Promise<any | null> =>
    ipcRenderer.invoke('task:load-active'),

  clearActiveTask: (taskId?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('task:clear-active', taskId),

  listTasks: (): Promise<any[]> =>
    ipcRenderer.invoke('task:list'),

  enqueueAction: (action: any): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('queue:enqueue', action),

  getQueuedActions: (): Promise<any[]> =>
    ipcRenderer.invoke('queue:get-all'),

  updateQueuedAction: (id: string, updates: any): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('queue:update', id, updates),

  clearQueuedActions: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('queue:clear'),

  // ── Local Semantic Classification ──────────────────────────────────────────
  classifyLocalSemantic: (text: string): Promise<any> =>
    ipcRenderer.invoke('intent:classify-semantic', text),

  // ── Platform ───────────────────────────────────────────────────────────────
  platform: process.platform,
})
