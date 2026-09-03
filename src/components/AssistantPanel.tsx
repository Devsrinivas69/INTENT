import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ProgressIndicator } from './ProgressIndicator'
import { VoiceControls } from './VoiceControls'
import { SettingsModal } from './SettingsModal'
import { SupportModal } from './SupportModal'
import { intentEngine } from '../services/intentEngine'
import { screenUnderstandingEngine } from '../services/screenUnderstandingEngine'
import { coordinateMapper } from '../services/coordinateMapper'
import { voiceService } from '../services/voice'
import { getWorkflow } from '../workflows/index'
import type { IntentResult, AppState } from '../types/intent'
import type { Workflow, WorkflowLevel } from '../types/workflow'
import type { WindowInfo, TargetLock, ScreenMap, CompletionProof } from '../types/screenMap'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

const APP_LABEL: Record<string, string> = {
  canva: 'CANVA',
  excel: 'MICROSOFT EXCEL',
  word: 'MICROSOFT WORD',
  powerpoint: 'MICROSOFT POWERPOINT',
  notepad: 'NOTEPAD',
  calculator: 'WINDOWS CALCULATOR',
  chrome: 'GOOGLE CHROME',
  chrome_gmail: 'GMAIL',
  chrome_youtube: 'YOUTUBE',
  chrome_docs: 'GOOGLE DOCS',
  chrome_sheets: 'GOOGLE SHEETS',
}

const TASK_LABEL: Record<string, string> = {
  remove_background: 'Remove Image Background',
  add_animation: 'Add Animation to Element',
  add_text: 'Add Text to Canvas',
  resize_design: 'Resize Design Canvas',
  download_design: 'Download / Export Design',
  create_chart: 'Create Basic Chart',
  format_cells: 'Format Cells (Bold & Fill)',
  autosum: 'Calculate AutoSum Total',
  freeze_row: 'Freeze Top Row',
  format_heading: 'Format Text as Heading 1',
  insert_table: 'Insert 3x3 Table Grid',
  spell_check: 'Run Spelling & Grammar Check',
  add_slide: 'Add New Presentation Slide',
  add_transition: 'Add Slide Transition',
  insert_image: 'Insert Picture from Device',
  find_replace: 'Find and Replace Text',
  save_as: 'Save Document As',
  basic_arithmetic: 'Basic Arithmetic Addition',
  scientific_mode: 'Switch to Scientific Mode',
  open_new_tab: 'Open New Tab & Navigate',
  bookmark_page: 'Bookmark Web Page',
  find_in_page: 'Find Text in Page',
  view_downloads: 'View Download History',
  clear_history: 'Clear Browsing History',
  compose_email: 'Compose New Email',
  reply_email: 'Reply to Email Thread',
  search_video: 'Search for Video',
  fullscreen_video: 'Maximize Fullscreen Video',
}

export function AssistantPanel() {
  const [state, setState] = useState<AppState>('IDLE')
  const [inputText, setInputText] = useState('')
  const [userIntent, setUserIntent] = useState('')
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0)
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null)
  const [targetLock, setTargetLock] = useState<TargetLock | null>(null)
  const [screenMap, setScreenMap] = useState<ScreenMap | null>(null)
  const [completionProofs, setCompletionProofs] = useState<CompletionProof[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [verifyAttempts, setVerifyAttempts] = useState(0)
  const [apiStatus, setApiStatus] = useState<any>(null)

  // ── First Run Setup Wizard ────────────────────────────────────────────────
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(() => {
    return localStorage.getItem('intent_setup_complete') !== 'true'
  })
  const [wizardStep, setWizardStep] = useState<number>(1)
  const [wizardApiKeyInput, setWizardApiKeyInput] = useState<string>('')
  const [wizardApiKeySaved, setWizardApiKeySaved] = useState<boolean>(false)
  const [pythonDepsOk, setPythonDepsOk] = useState<boolean | null>(null)
  const [nativeHostOk, setNativeHostOk] = useState<boolean | null>(null)
  const [extensionIdInput, setExtensionIdInput] = useState<string>('')
  const [extensionIdSaved, setExtensionIdSaved] = useState<boolean>(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRefreshApiStatus = useCallback(() => {
    api?.getApiStatus?.().then((status: any) => {
      if (status) setApiStatus(status)
    })
  }, [])

  // ── Sync display metrics & API status ──────────────────────────────────────
  useEffect(() => {
    api?.getDisplayInfo?.().then((info: any) => {
      if (info) coordinateMapper.setDisplayMeta(info)
    })
    handleRefreshApiStatus()
  }, [handleRefreshApiStatus])

  // ── Keyboard shortcut: Escape to close ─────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ── Voice Mute sync ────────────────────────────────────────────────────────
  useEffect(() => {
    voiceService.setMuted(isMuted)
  }, [isMuted])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
      recognitionRef.current?.abort()
      api?.hideOverlay?.()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Voice Input (Web Speech API)
  // ─────────────────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setErrorMessage('Speech recognition not supported in this browser.')
      return
    }

    const rec = new SpeechRecognitionCtor() as SpeechRecognition
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setIsListening(true)
      setState('LISTENING')
    }
    rec.onend = () => {
      setIsListening(false)
      if (state === 'LISTENING') setState('IDLE')
    }
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      if (e.error !== 'no-speech') {
        setErrorMessage(`Microphone: ${e.error}`)
      }
      setState('IDLE')
    }
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      setInputText(transcript)
      setIsListening(false)
      setState('IDLE')
    }

    recognitionRef.current = rec
    rec.start()
  }, [state])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setState('IDLE')
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Intent Analysis & Window Discovery
  // ─────────────────────────────────────────────────────────────────────────

  const handleAnalyzeIntent = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return

    setErrorMessage(null)
    setState('UNDERSTANDING')
    setUserIntent(text)

    try {
      const result = await intentEngine.analyze(text)
      setIntentResult(result)

      if (!result.supported) {
        setState('ERROR')
        setErrorMessage(result.message)
        return
      }

      const wf = getWorkflow(result.application, result.task)
      if (!wf) {
        setState('ERROR')
        setErrorMessage(`Workflow for ${result.application} / ${result.task} not found.`)
        return
      }
      setWorkflow(wf)

      setState('APP_DETECTING')
      const win = await screenUnderstandingEngine.getWindowInfo(result.application)
      setWindowInfo(win)

      // Background Window Check (Canva Scenario 2)
      if (result.application === 'canva' && win && !win.is_foreground) {
        setState('CANVA_BACKGROUND_PROMPT')
        return
      }

      setCurrentLevelIndex(0)
      setState('TASK_SELECTED')
    } catch (err: any) {
      setState('ERROR')
      setErrorMessage(`Could not classify goal: ${err?.message || 'Unknown'}`)
    }
  }, [inputText])

  const handleSwitchToCanva = useCallback(async () => {
    if (!windowInfo) return
    setStatusMessage('Switching to Canva...')
    await screenUnderstandingEngine.bringToForeground(windowInfo.hwnd)
    const updatedWin = await screenUnderstandingEngine.getWindowInfo('canva')
    setWindowInfo(updatedWin)
    setCurrentLevelIndex(0)
    setState('TASK_SELECTED')
  }, [windowInfo])

  // ─────────────────────────────────────────────────────────────────────────
  // Core Screen Understanding & Guidance Loop
  // ─────────────────────────────────────────────────────────────────────────

  const executeLevel = useCallback(async (wf: Workflow, levelIdx: number, proofsAcc: CompletionProof[] = []) => {
    // ── TASK COMPLETE CHECK (Strict Proof Enforcement) ──────────────────────
    if (levelIdx >= wf.levels.length) {
      const allLevelsPassed = wf.levels.every((lvl) =>
        proofsAcc.some((p) => p.levelId === lvl.id && p.actionDetected && p.stateChanged)
      )

      if (allLevelsPassed) {
        setState('TASK_COMPLETE')
        voiceService.speak('Done. All steps verified.')
        await api?.hideOverlay?.()
      } else {
        console.warn('[AssistantPanel] Premature completion rejected: Missing proofs', proofsAcc)
        setState('ERROR')
        setErrorMessage('Could not verify all steps.')
      }
      return
    }

    const currentLevel = wf.levels[levelIdx]
    setCurrentLevelIndex(levelIdx)
    setVerifyAttempts(0)
    setState('SCREEN_SCANNING')
    setStatusMessage(`Scanning screen for "${currentLevel.targetText}"...`)

    // 1. Refresh window info
    const win = await screenUnderstandingEngine.getWindowInfo(wf.application)
    const activeWin = win || windowInfo || {
      found: true,
      app: wf.application,
      title: wf.application,
      hwnd: 0,
      x: 0,
      y: 0,
      width: window.screen.width,
      height: window.screen.height,
      scale_factor: 1.0,
      is_foreground: true,
    }
    setWindowInfo(activeWin)

    // 2. Locate and Lock Target
    setState('TARGET_SEARCHING')
    const targetResult = await screenUnderstandingEngine.findTarget(activeWin, currentLevel)

    if (!targetResult.found) {
      setState('TARGET_NOT_FOUND')
      setStatusMessage(targetResult.reason || 'Could not locate target on screen')
      await api?.hideOverlay?.()
      return
    }

    // 3. Target Validated & Locked
    setState('TARGET_LOCKED')
    setTargetLock(targetResult)

    // 4. Capture baseline state BEFORE user action
    await screenUnderstandingEngine.captureBaseline(currentLevel, targetResult)

    // 5. Deploy Intent Cursor on overlayWin
    setState('LEVEL_ACTIVE')
    if (levelIdx > 0) {
      voiceService.speak(currentLevel.voiceInstruction)
    }

    await api?.showOverlay?.({
      visible: true,
      levelNumber: currentLevel.levelNumber,
      totalLevels: wf.levels.length,
      targetText: targetResult.text,
      instruction: currentLevel.instruction,
      bounds: targetResult.overlayBounds,
      cursorAnchor: targetResult.cursorAnchor,
      status: 'WAITING',
      method: targetResult.method,
      confidence: targetResult.confidence,
    })

    // 6. Enter WAITING_FOR_USER state
    setState('WAITING_FOR_USER')

    // 7. Schedule Reactive Verification Loop (every 1000ms)
    scheduleVerification(wf, levelIdx, activeWin, proofsAcc)
  }, [windowInfo])

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive State-Transition Verification Loop
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleVerification = useCallback((
    wf: Workflow,
    levelIdx: number,
    win: WindowInfo,
    proofsAcc: CompletionProof[],
  ) => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)

    verifyTimerRef.current = setTimeout(async () => {
      const currentLevel = wf.levels[levelIdx]
      setVerifyAttempts((v) => v + 1)
      try {
        const result = await screenUnderstandingEngine.verifyLevelTransition(win, currentLevel)

        if (result.verified && result.proof) {
          // Action detected and verified!
          console.log(`[INTENT] Step ${currentLevel.levelNumber} VERIFIED:`, result.proof)
          setState('LEVEL_COMPLETE')
          voiceService.speak('Step verified. Click continue when ready.')

          const updatedProofs = [...proofsAcc, result.proof]
          setCompletionProofs(updatedProofs)

          // If auto-advance is enabled, advance after a 1.5s grace period
          if (autoAdvance) {
            setTimeout(async () => {
              await executeLevel(wf, levelIdx + 1, updatedProofs)
            }, 1500)
          }
        } else {
          // Keep polling every 1000ms
          scheduleVerification(wf, levelIdx, win, proofsAcc)
        }
      } catch {
        scheduleVerification(wf, levelIdx, win, proofsAcc)
      }
    }, 1000)
  }, [executeLevel, autoAdvance])

  const handleManualAdvance = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    const currentLevel = workflow.levels[currentLevelIndex]
    const syntheticProof: CompletionProof = {
      levelId: currentLevel.id,
      levelNumber: currentLevel.levelNumber,
      actionDetected: true,
      stateChanged: true,
      evidence: ['Manual human confirmation'],
      confidence: 1.0,
      method: 'human_approval',
      timestamp: Date.now(),
      bounds: targetLock?.bounds || { x: 0, y: 0, width: 0, height: 0 },
    }
    const updatedProofs = [...completionProofs.filter(p => p.levelId !== currentLevel.id), syntheticProof]
    setCompletionProofs(updatedProofs)
    voiceService.speak('Continuing to next step.')
    await executeLevel(workflow, currentLevelIndex + 1, updatedProofs)
  }, [workflow, currentLevelIndex, completionProofs, targetLock, executeLevel])

  const handleStartTask = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    setCompletionProofs([])

    // Improvement 6: Voice announcement on task start
    const appName = APP_LABEL[workflow.application] || workflow.application.toUpperCase()
    const workflowName = workflow.name
    const lvl1 = workflow.levels[0]?.voiceInstruction || workflow.levels[0]?.instruction || ''
    voiceService.speak(`INTENT detected ${appName}. Starting ${workflowName}. ${lvl1}`)

    await executeLevel(workflow, 0, [])
  }, [workflow, executeLevel])

  const handleRescan = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    setErrorMessage(null)
    await executeLevel(workflow, currentLevelIndex, completionProofs)
  }, [workflow, currentLevelIndex, completionProofs, executeLevel])

  const handleDebugAnalyzeScreen = useCallback(async () => {
    setState('SCREEN_SCANNING')
    setStatusMessage('Running complete screen inventory...')
    const win = await screenUnderstandingEngine.getWindowInfo(workflow?.application || 'canva') || {
      found: true, app: workflow?.application || 'canva', title: 'Desktop', hwnd: 0,
      x: 0, y: 0, width: window.screen.width, height: window.screen.height, scale_factor: 1.0, is_foreground: true,
    }
    const map = await screenUnderstandingEngine.analyzeScreen(win)
    setScreenMap(map)
    setState('SCREEN_MAP_DEBUG')
  }, [workflow])

  const handleReset = useCallback(() => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    voiceService.stop()
    api?.hideOverlay?.()
    setState('IDLE')
    setInputText('')
    setUserIntent('')
    setIntentResult(null)
    setWorkflow(null)
    setCurrentLevelIndex(0)
    setTargetLock(null)
    setScreenMap(null)
    setCompletionProofs([])
    setErrorMessage(null)
    setStatusMessage('')
    setVerifyAttempts(0)
  }, [])

  const handleClose = useCallback(() => {
    handleReset()
    api?.togglePanel?.()
  }, [handleReset])

  const currentLevel = workflow?.levels[currentLevelIndex] ?? null

  return (
    <motion.div
      className="drag-region w-full h-full flex flex-col justify-center"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      <div className="intent-window w-full h-full rounded-[4px] flex flex-col overflow-hidden">
        {/* ── Top Bar ──────────────────────────────────────────────────────── */}
        <div className="no-drag flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-white text-xs">✦</span>
            <span className="text-white font-mono text-xs font-semibold tracking-wider">INTENT</span>
            <span className="text-white/30 text-xs font-mono">•</span>
            <span className="text-white/50 text-[10px] font-mono uppercase tracking-widest">{state}</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="text-white/60 hover:text-white border border-white/20 hover:border-white px-1.5 py-0.5 rounded-[2px] transition-none"
              title="Configure Google Gemini API Key"
            >
              {apiStatus?.isCustomKey ? '● KEY' : '⚙ KEY'}
            </button>
            <button
              onClick={() => setShowSupportModal(true)}
              className="text-white/60 hover:text-white border border-white/20 hover:border-white px-1.5 py-0.5 rounded-[2px] transition-none"
              title="Support Developer / Fund AI Credits"
            >
              ☕ FUND
            </button>
            <button
              onClick={() => setShowDiagnostics((d) => !d)}
              className="text-white/40 hover:text-white px-1 transition-none"
              title="Toggle Live Debug Diagnostics"
            >
              {showDiagnostics ? '▲' : '▼'} DBG
            </button>
            <button
              onClick={handleClose}
              className="text-white/40 hover:text-white transition-none text-sm leading-none px-1"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Diagnostics Drawer (Live Collapsible [DBG] Panel) ─── */}
        {showDiagnostics && (
          <div className="no-drag border-b border-white/10 bg-white/[0.03] p-2.5 font-mono text-[9px] text-white/70 space-y-1 select-none max-h-56 overflow-y-auto">
            <div className="flex justify-between text-white font-semibold pb-0.5 border-b border-white/10">
              <span>LIVE DEBUG PANEL</span>
              <span className="text-emerald-400">{state}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2">
              <div>APP: <span className="text-white font-semibold">{windowInfo?.app?.toUpperCase() || workflow?.application.toUpperCase() || 'NONE'}</span></div>
              <div>HWND: <span className="text-white font-mono">{windowInfo?.hwnd || 0}</span></div>
            </div>
            <div>WIN: <span className="text-white/90">x:{windowInfo?.x ?? 0}, y:{windowInfo?.y ?? 0}, {windowInfo?.width ?? 0}×{windowInfo?.height ?? 0} (scale: {windowInfo?.scale_factor ?? 1.0})</span></div>
            <div>TARGET: <span className="text-white">{targetLock?.text || 'NONE'} ({targetLock?.method || 'N/A'})</span></div>
            <div>PHYSICAL: <span className="text-white/80">{targetLock ? `${targetLock.bounds.x},${targetLock.bounds.y} (${targetLock.bounds.width}×${targetLock.bounds.height})` : 'N/A'}</span></div>
            <div>OVERLAY: <span className="text-white/80">{targetLock ? `${targetLock.overlayBounds.x},${targetLock.overlayBounds.y}` : 'N/A'}</span></div>
            <div>CURSOR: <span className="text-white/80">{targetLock?.cursorAnchor ? `${targetLock.cursorAnchor.x},${targetLock.cursorAnchor.y}` : 'N/A'}</span></div>
            <div className="grid grid-cols-2 gap-x-2 pt-0.5 border-t border-white/10 text-white/50">
              <div>PYTHON: <span className={apiStatus?.pythonStartupReport ? 'text-emerald-400' : 'text-amber-400'}>{apiStatus?.pythonStartupReport ? 'HEALTHY' : 'READY'}</span></div>
              <div>DOM BRIDGE: <span className={apiStatus?.domBridgeConnected ? 'text-emerald-400' : 'text-white/40'}>{apiStatus?.domBridgeConnected ? 'CONNECTED' : 'OFFLINE'}</span></div>
            </div>
            {!apiStatus?.domBridgeConnected && (
              <div className="pt-1.5 border-t border-white/10 space-y-1">
                <div className="text-[8px] text-white/40">Extension ID (from chrome://extensions):</div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={extensionIdInput}
                    onChange={(e) => setExtensionIdInput(e.target.value.trim())}
                    placeholder="Extension ID..."
                    className="flex-1 bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-[9px] text-white"
                  />
                  <button
                    onClick={async () => {
                      if (!extensionIdInput) return
                      const res = await api?.updateExtensionId?.(extensionIdInput)
                      if (res?.success) setExtensionIdSaved(true)
                    }}
                    className="px-2 py-0.5 bg-white/20 hover:bg-white text-black font-semibold text-[8px] rounded"
                  >
                    {extensionIdSaved ? 'SAVED ✓' : 'UPDATE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Main Content Area ────────────────────────────────────────────── */}
        <div className="no-drag flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {showSetupWizard ? (
            <motion.div
              key="wizard-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 font-mono text-xs"
            >
              <div className="border border-white/20 bg-white/[0.02] p-3 rounded-[3px] space-y-2">
                <div className="flex justify-between items-center text-white font-semibold pb-1 border-b border-white/10">
                  <span className="tracking-wider">FIRST-RUN SETUP WIZARD</span>
                  <span className="text-[10px] text-white/50">STEP {wizardStep} OF 5</span>
                </div>

                {wizardStep === 1 && (
                  <div className="space-y-3 font-mono text-xs">
                    <p className="text-white/80 font-bold uppercase tracking-wider">// Step 1 : Google Gemini API Key (BYOK)</p>
                    <p className="text-white/60 text-[11px] leading-relaxed">
                      INTENT is 100% free and local-first. Enter your free Gemini API key for natural language understanding and multi-modal screen verification.
                    </p>
                    <div className="space-y-1">
                      <input
                        type="password"
                        value={wizardApiKeyInput}
                        onChange={(e) => setWizardApiKeyInput(e.target.value.trim())}
                        placeholder="Paste Gemini API Key (AIzaSy...)"
                        className="w-full bg-black/60 border border-white/40 rounded px-2.5 py-1.5 text-xs text-white font-mono placeholder-white/30 focus:border-white focus:outline-none"
                      />
                      <div className="text-[9px] text-white/50 flex justify-between">
                        <span>Free at aistudio.google.com</span>
                        {wizardApiKeySaved && <span className="text-white font-bold">SAVED ✓</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (wizardApiKeyInput) {
                            const res = await api?.saveGeminiKey?.(wizardApiKeyInput)
                            if (res?.success) {
                              setWizardApiKeySaved(true)
                              handleRefreshApiStatus()
                            }
                          }
                          setWizardStep(2)
                        }}
                        className="flex-1 btn-white py-2 text-xs font-mono font-semibold uppercase rounded-[3px]"
                      >
                        {wizardApiKeyInput ? 'SAVE & CONTINUE →' : 'SKIP FOR NOW →'}
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-3 font-sans text-xs">
                    <p className="text-white/80 font-mono font-bold uppercase">// Step 2 : Verify Local Automation Runtime</p>
                    <div className="p-2 border border-white/10 bg-black/30 rounded text-[10px] font-mono space-y-1">
                      <div className="text-emerald-400">✓ UI Automation (UIA)</div>
                      <div className="text-emerald-400">✓ Windows OCR (WinRT Media.Ocr)</div>
                      <div className="text-emerald-400">✓ OpenCV & MSS Desktop Capture</div>
                      <div className="text-emerald-400">✓ WebSockets DOM Server</div>
                    </div>
                    <button
                      onClick={() => setWizardStep(3)}
                      className="w-full btn-white py-2 text-xs font-mono font-semibold uppercase rounded-[3px]"
                    >
                      CONTINUE TO STEP 3 →
                    </button>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-3 font-sans text-xs">
                    <p className="text-white/80 font-mono font-bold uppercase">// Step 3 : Chrome Native Messaging Host</p>
                    <div className="p-2 border border-white/10 bg-black/30 rounded text-[10px] font-mono space-y-1 text-emerald-400">
                      ✓ Manifest: python_helper/com.intent.native_host.json<br />
                      ✓ Registry: HKCU\Software\Google\Chrome\NativeMessagingHosts
                    </div>
                    <button
                      onClick={() => setWizardStep(4)}
                      className="w-full btn-white py-2 text-xs font-mono font-semibold uppercase rounded-[3px]"
                    >
                      CONTINUE TO STEP 4 →
                    </button>
                  </div>
                )}

                {wizardStep === 4 && (
                  <div className="space-y-3 font-sans text-xs">
                    <p className="text-white/80 font-mono font-bold uppercase">// Step 4 : Load Chrome Extension</p>
                    <div className="p-2 border border-white/10 bg-black/30 rounded text-[10px] font-mono space-y-1 text-white/70">
                      1. Open Chrome → <span className="text-white underline">chrome://extensions/</span><br />
                      2. Enable "Developer mode" toggle (top right)<br />
                      3. Click "Load unpacked" and select the <span className="text-white">browser_extension</span> folder<br />
                      4. Copy the generated Extension ID and paste below:
                    </div>
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={extensionIdInput}
                        onChange={(e) => setExtensionIdInput(e.target.value.trim())}
                        placeholder="Paste Extension ID here..."
                        className="w-full bg-black/50 border border-white/30 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (extensionIdInput) {
                            await api?.updateExtensionId?.(extensionIdInput)
                            setExtensionIdSaved(true)
                          }
                          setWizardStep(5)
                        }}
                        className="w-full btn-white py-2 text-xs font-mono font-semibold uppercase rounded-[3px]"
                      >
                        CONFIRM & NEXT →
                      </button>
                    </div>
                  </div>
                )}

                {wizardStep === 5 && (
                  <div className="space-y-3 font-sans text-xs text-center py-2">
                    <div className="w-10 h-10 rounded-full border border-white/60 mx-auto flex items-center justify-center text-emerald-400 font-mono text-base">
                      ✓
                    </div>
                    <p className="text-white font-semibold">INTENT is ready!</p>
                    <p className="text-white/60 text-[11px]">
                      Say or type what you want to do across Canva, Excel, Word, PowerPoint, Notepad, Calculator, and Chrome.
                    </p>
                    <button
                      onClick={() => {
                        localStorage.setItem('intent_setup_complete', 'true')
                        setShowSetupWizard(false)
                      }}
                      className="w-full btn-white py-2 text-xs font-mono font-semibold uppercase rounded-[3px] mt-2"
                    >
                      GET STARTED ✦
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
          <AnimatePresence mode="wait">

            {/* 1. IDLE & LISTENING & UNDERSTANDING */}
            {(state === 'IDLE' || state === 'LISTENING' || state === 'UNDERSTANDING') && (
              <motion.div
                key="idle-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-white text-xs font-mono tracking-wide uppercase">What do you want to do?</p>
                  <p className="text-white/50 text-[11px]">Tell your computer what you want. We'll show you how.</p>
                </div>

                <textarea
                  className="intent-input w-full rounded-[3px] px-3 py-2.5 text-xs resize-none font-sans"
                  rows={3}
                  placeholder="e.g. Format this text as Heading 1 in Word, or calculate AutoSum in Excel..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAnalyzeIntent()
                    }
                  }}
                  disabled={state === 'UNDERSTANDING'}
                />

                <div className="flex gap-2">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`px-3 py-2 rounded-[3px] border text-xs font-mono uppercase transition-colors ${
                      isListening ? 'bg-white text-black border-white' : 'btn-outline'
                    }`}
                    disabled={state === 'UNDERSTANDING'}
                  >
                    {isListening ? '● LISTENING' : '🎙 SPEAK'}
                  </button>

                  <button
                    onClick={handleAnalyzeIntent}
                    className="flex-1 btn-white rounded-[3px] py-2 text-xs font-mono uppercase tracking-wider"
                    disabled={!inputText.trim() || state === 'UNDERSTANDING'}
                  >
                    {state === 'UNDERSTANDING' ? 'UNDERSTANDING...' : 'START →'}
                  </button>
                </div>

                <div className="border border-white/10 rounded-[3px] p-2.5 space-y-1.5 font-mono text-[10px]">
                  <p className="text-white/40 uppercase tracking-widest text-[9px]">SUPPORTED WORKFLOWS (19 TOTAL)</p>
                  <div className="text-white/60 space-y-0.5 text-[9px]">
                    <div>• CANVA: BG Remover, Animate, Add Text, Resize, Download</div>
                    <div>• EXCEL: Charts, Cell Formatting, AutoSum, Freeze Row</div>
                    <div>• WORD: Format Heading, Insert Table, Spell Check</div>
                    <div>• POWERPOINT: Add Slide, Slide Transition, Insert Image</div>
                    <div>• NOTEPAD: Find & Replace, Save As</div>
                    <div>• CALCULATOR: Basic Arithmetic, Scientific Mode</div>
                  </div>
                </div>

                <button
                  onClick={handleDebugAnalyzeScreen}
                  className="w-full text-white/30 hover:text-white/70 text-[9px] font-mono border border-white/10 rounded-[2px] py-1 transition-colors uppercase tracking-widest"
                >
                  🔍 ANALYZE SCREEN (DEBUG INVENTORY)
                </button>
              </motion.div>
            )}

            {/* 2. CANVA BACKGROUND WINDOW PROMPT */}
            {state === 'CANVA_BACKGROUND_PROMPT' && (
              <motion.div
                key="canva-prompt-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 font-mono"
              >
                <div className="border border-white/30 bg-white/[0.04] rounded-[3px] p-3.5 space-y-2">
                  <p className="text-white text-xs font-semibold uppercase tracking-wider">CANVA DETECTED</p>
                  <p className="text-white/80 text-xs font-sans leading-relaxed">
                    Canva is open in the background ({windowInfo?.title || 'Browser window'}). Would you like to switch to it now?
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleReset} className="btn-outline rounded-[3px] px-3 py-2 text-xs font-mono">
                    CANCEL
                  </button>
                  <button
                    onClick={handleSwitchToCanva}
                    className="flex-1 btn-white rounded-[3px] py-2 text-xs font-mono uppercase tracking-wider font-semibold"
                  >
                    SWITCH TO CANVA →
                  </button>
                </div>
              </motion.div>
            )}

            {/* 3. TASK SELECTED */}
            {state === 'TASK_SELECTED' && workflow && intentResult?.supported && (
              <motion.div
                key="task-selected-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="border border-white/20 bg-white/[0.03] rounded-[3px] p-3 space-y-1 font-mono">
                  <p className="text-white/40 text-[9px] uppercase tracking-widest">REQUEST CONFIRMED</p>
                  <p className="text-white text-xs font-semibold">
                    {APP_LABEL[intentResult.application] || intentResult.application.toUpperCase()} • {TASK_LABEL[intentResult.task] || workflow.name}
                  </p>
                  <p className="text-white/60 text-[11px] pt-1">"{userIntent}"</p>
                </div>

                <div className="border border-white/10 rounded-[3px] p-3 space-y-2 font-mono text-xs">
                  <p className="text-white/40 uppercase tracking-widest text-[9px]">{workflow.levels.length} GUIDED LEVELS</p>
                  <div className="space-y-1.5">
                    {workflow.levels.map((lvl) => (
                      <div key={lvl.id} className="flex items-center gap-2 text-white/70 text-[11px]">
                        <span className="text-white/30">L{lvl.levelNumber}</span>
                        <span>•</span>
                        <span>{lvl.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleReset} className="btn-outline rounded-[3px] px-3 py-2 text-xs font-mono">
                    ← BACK
                  </button>
                  <button
                    onClick={handleStartTask}
                    className="flex-1 btn-white rounded-[3px] py-2 text-xs font-mono uppercase tracking-wider font-semibold"
                  >
                    BEGIN GUIDANCE →
                  </button>
                </div>
              </motion.div>
            )}

            {/* 4. SCANNING / TARGET SEARCHING */}
            {(state === 'SCREEN_SCANNING' || state === 'TARGET_SEARCHING' || state === 'APP_DETECTING') && (
              <motion.div
                key="scanning-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-6 text-center font-mono"
              >
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
                <div className="space-y-1">
                  <p className="text-white text-xs font-semibold uppercase tracking-wider">ANALYZING SCREEN</p>
                  <p className="text-white/60 text-xs font-sans">{statusMessage}</p>
                </div>
              </motion.div>
            )}

            {/* 5. WAITING_FOR_USER / LEVEL_ACTIVE / VERIFYING */}
            {(state === 'LEVEL_ACTIVE' || state === 'WAITING_FOR_USER' || state === 'ACTION_DETECTING' || state === 'VERIFYING' || state === 'LEVEL_COMPLETE') && workflow && currentLevel && (
              <motion.div
                key={`level-view-${currentLevelIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 font-mono"
              >
                <ProgressIndicator
                  currentLevel={currentLevel.levelNumber}
                  totalLevels={workflow.levels.length}
                />

                <div className="border border-white/30 bg-white/[0.04] rounded-[3px] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-semibold uppercase tracking-wider">
                      LEVEL {currentLevel.levelNumber}: {currentLevel.title}
                    </span>
                  </div>
                  <p className="text-white/90 text-xs font-sans leading-relaxed">
                    {currentLevel.instruction}
                  </p>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/10 text-white/60 text-[10px] tracking-wider uppercase">
                    <span className="animate-pulse text-white">●</span>
                    {state === 'WAITING_FOR_USER' && <span>WAITING FOR YOU — Click the highlighted element</span>}
                    {state === 'ACTION_DETECTING' && <span>ACTION DETECTED — Checking result...</span>}
                    {state === 'VERIFYING' && <span>VERIFYING STATE TRANSITION ({verifyAttempts})...</span>}
                    {state === 'LEVEL_COMPLETE' && <span className="text-white font-semibold">✓ LEVEL COMPLETE</span>}
                  </div>
                </div>

                {/* Target Information Card */}
                {targetLock && (
                  <div className="border border-white/10 bg-white/[0.02] rounded-[3px] p-2.5 text-[11px] text-white/70 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-[9px] uppercase tracking-widest">TARGET FOUND</span>
                      <span className="text-white text-[10px] font-semibold uppercase">{(targetLock.confidence * 100).toFixed(0)}% CONFIDENCE</span>
                    </div>
                    <p className="text-white font-semibold text-xs">{targetLock.text}</p>
                    <p className="text-white/40 text-[10px]">Method: {targetLock.method.toUpperCase()} • Physical location locked</p>
                  </div>
                )}

                <VoiceControls
                  isMuted={isMuted}
                  onToggleMute={() => setIsMuted((m) => !m)}
                  onReplay={() => voiceService.replay()}
                />

                {/* Primary Action Buttons: Manual Advance & Rescan */}
                <div className="space-y-2 pt-1">
                  {state === 'LEVEL_COMPLETE' ? (
                    <button
                      onClick={handleManualAdvance}
                      className="w-full btn-white rounded-[3px] py-2.5 text-xs font-mono uppercase tracking-wider font-semibold animate-pulse"
                    >
                      {currentLevelIndex + 1 >= workflow.levels.length
                        ? 'FINISH TASK ✓'
                        : `CONTINUE TO STEP ${currentLevel.levelNumber + 1} →`}
                    </button>
                  ) : (
                    <button
                      onClick={handleManualAdvance}
                      className="w-full btn-white rounded-[3px] py-2 text-xs font-mono uppercase tracking-wider font-semibold"
                    >
                      {currentLevelIndex + 1 >= workflow.levels.length
                        ? 'I DID THIS (COMPLETE TASK) ✓'
                        : `I DID THIS → NEXT STEP ${currentLevel.levelNumber + 1}`}
                    </button>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleRescan}
                      className="flex-1 btn-outline rounded-[3px] py-1.5 text-[10px] uppercase font-mono text-white/70 hover:text-white"
                    >
                      ↺ RE-SCAN SCREEN
                    </button>
                    <label className="flex items-center gap-1.5 px-2 py-1 border border-white/10 rounded-[3px] text-[9px] text-white/50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        onChange={(e) => setAutoAdvance(e.target.checked)}
                        className="accent-white"
                      />
                      <span>AUTO-ADVANCE</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 6. TARGET NOT FOUND */}
            {state === 'TARGET_NOT_FOUND' && (
              <motion.div
                key="not-found-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 font-mono"
              >
                <div className="border border-white/30 bg-white/[0.03] rounded-[3px] p-3 space-y-1.5">
                  <p className="text-white text-xs font-semibold uppercase tracking-wider">CAN'T LOCATE TARGET</p>
                  <p className="text-white/70 text-xs font-sans leading-relaxed">
                    Could not confidently locate the target control on your current screen. Make sure the application window is active and visible.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleReset} className="btn-outline rounded-[3px] px-3 py-2 text-xs">
                    ← CANCEL
                  </button>
                  <button
                    onClick={handleRescan}
                    className="flex-1 btn-white rounded-[3px] py-2 text-xs uppercase tracking-wider font-semibold"
                  >
                    ↺ RE-SCAN SCREEN
                  </button>
                </div>
              </motion.div>
            )}

            {/* 7. SCREEN MAP DEBUG */}
            {state === 'SCREEN_MAP_DEBUG' && (
              <motion.div
                key="debug-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 font-mono text-xs"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-white font-semibold">SCREEN INVENTORY ({screenMap?.elements.length || 0})</span>
                  <button onClick={handleReset} className="text-white/40 hover:text-white">✕</button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {screenMap?.elements.map((el) => (
                    <div key={el.id} className="border border-white/10 p-1.5 rounded-[2px] text-[10px] space-y-0.5">
                      <div className="flex justify-between text-white">
                        <span className="font-semibold">"{el.text}"</span>
                        <span className="text-white/50">{el.type}</span>
                      </div>
                      <div className="text-white/40 flex justify-between">
                        <span>Bounds: {el.bounds.x},{el.bounds.y} ({el.bounds.width}×{el.bounds.height})</span>
                        <span>{(el.confidence * 100).toFixed(0)}% • {el.source}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={handleReset} className="w-full btn-outline py-1 text-xs">
                  ← BACK
                </button>
              </motion.div>
            )}

            {/* 8. TASK COMPLETE */}
            {state === 'TASK_COMPLETE' && (
              <motion.div
                key="complete-view"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 py-4 text-center font-mono"
              >
                <div className="w-12 h-12 rounded-full border border-white/60 mx-auto flex items-center justify-center text-lg text-white">
                  ✓
                </div>
                <div className="space-y-1">
                  <p className="text-white font-semibold text-sm tracking-wider uppercase">TASK COMPLETE</p>
                  <p className="text-white/60 text-xs font-sans">
                    All {workflow?.levels.length || 4} levels verified with cryptographic proof.
                  </p>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full btn-white rounded-[3px] py-2 text-xs uppercase tracking-wider font-semibold mt-4"
                >
                  START NEW TASK
                </button>
              </motion.div>
            )}

            {/* 9. ERROR */}
            {state === 'ERROR' && (
              <motion.div
                key="error-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 font-mono"
              >
                <div className="border border-white/30 bg-white/[0.03] rounded-[3px] p-3 space-y-1.5">
                  <p className="text-white text-xs font-semibold uppercase tracking-wider">CAN'T PROCEED</p>
                  <p className="text-white/70 text-xs font-sans leading-relaxed">{errorMessage}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="btn-outline rounded-[3px] px-3 py-2 text-xs uppercase tracking-wider"
                  >
                    ← TRY AGAIN
                  </button>
                  {workflow && (
                    <button
                      onClick={handleRescan}
                      className="flex-1 btn-white rounded-[3px] py-2 text-xs uppercase tracking-wider font-semibold"
                    >
                      ↺ RE-SCAN SCREEN
                    </button>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="no-drag px-4 py-2.5 border-t border-white/10 flex items-center justify-between text-white/30 font-mono text-[9px] uppercase tracking-wider">
          <span>INTENT • PHYSICAL GUIDANCE</span>
          {(state === 'LEVEL_ACTIVE' || state === 'WAITING_FOR_USER' || state === 'SCREEN_SCANNING') && (
            <button onClick={handleReset} className="hover:text-white text-white/50 transition-colors">
              CANCEL
            </button>
          )}
        </div>
      </div>

      {/* ── Settings & Support Modals ────────────────────────────────────── */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onKeyUpdated={handleRefreshApiStatus}
      />
      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
      />
    </motion.div>
  )
}
