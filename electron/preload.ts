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

  getDisplayInfo: (): Promise<{ screenWidth: number; screenHeight: number; scaleFactor: number }> =>
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

  // ── App Status ─────────────────────────────────────────────────────────────
  getApiStatus: (): Promise<{ hasKey: boolean; isDev: boolean }> =>
    ipcRenderer.invoke('app:api-status'),

  // ── Overlay Events ────────────────────────────────────────────────────────
  onOverlayUpdate: (callback: OverlayUpdateHandler) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('overlay:update', handler)
    return () => ipcRenderer.removeListener('overlay:update', handler)
  },

  // ── Platform ───────────────────────────────────────────────────────────────
  platform: process.platform,
})
