import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ProgressIndicator } from './ProgressIndicator'
import { VoiceControls } from './VoiceControls'
import { intentEngine } from '../services/intentEngine'
import { screenUnderstandingEngine } from '../services/screenUnderstandingEngine'
import { coordinateMapper } from '../services/coordinateMapper'
import { voiceService } from '../services/voice'
import { getWorkflow } from '../workflows/index'
import type { IntentResult } from '../types/intent'
import type { Workflow, WorkflowLevel } from '../types/workflow'
import type { WindowInfo, TargetLock, ScreenMap } from '../types/screenMap'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

type PanelState =
  | 'IDLE'
  | 'LISTENING'
  | 'UNDERSTANDING'
  | 'CANVA_BACKGROUND_PROMPT'
  | 'TASK_SELECTED'
  | 'SCANNING'
  | 'LEVEL_ACTIVE'
  | 'WAITING_FOR_USER'
  | 'VERIFICATION_UNCERTAIN'
  | 'TARGET_NOT_FOUND'
  | 'TASK_COMPLETE'
  | 'SCREEN_MAP_DEBUG'
  | 'ERROR'

const APP_LABEL: Record<string, string> = {
  canva: 'CANVA',
  excel: 'MICROSOFT EXCEL',
}

const TASK_LABEL: Record<string, string> = {
  remove_background: 'Remove Image Background',
  add_animation: 'Add Animation to Element',
  create_chart: 'Create Basic Chart',
}

export function AssistantPanel() {
  const [state, setState] = useState<PanelState>('IDLE')
  const [inputText, setInputText] = useState('')
  const [userIntent, setUserIntent] = useState('')
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0)
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null)
  const [targetLock, setTargetLock] = useState<TargetLock | null>(null)
  const [screenMap, setScreenMap] = useState<ScreenMap | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [screenshotBefore, setScreenshotBefore] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Sync display info with CoordinateMapper ────────────────────────────────
  useEffect(() => {
    api.getDisplayInfo().then((info: any) => {
      if (info) coordinateMapper.setDisplayMeta(info)
    })
  }, [])

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
      api.hideOverlay()
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
        setErrorMessage('Workflow not found.')
        return
      }
      setWorkflow(wf)

      // Check target application window status
      const win = await screenUnderstandingEngine.getWindowInfo(result.application)
      setWindowInfo(win)

      // Canva Scenario 2: Canva is open but in the background
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

  // ── Switch to background Canva window (Scenario 2 Option A) ────────────────
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

  const executeLevel = useCallback(async (wf: Workflow, levelIdx: number) => {
    if (levelIdx >= wf.levels.length) {
      setState('TASK_COMPLETE')
      voiceService.speak('Done. Task finished.')
      await api.hideOverlay()
      return
    }

    const currentLevel = wf.levels[levelIdx]
    setCurrentLevelIndex(levelIdx)
    setState('SCANNING')
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

    // Capture screenshot before user action (for screen diff verification)
    const beforeB64 = await screenUnderstandingEngine.captureCurrentScreenshot(activeWin)
    setScreenshotBefore(beforeB64)

    // 2. Full Screen Scan + Target Finding (two-scan stability check)
    const targetResult = await screenUnderstandingEngine.findTarget(activeWin, currentLevel)

    if (!targetResult.found) {
      setState('TARGET_NOT_FOUND')
      setStatusMessage(targetResult.reason || 'Could not locate target on screen')
      await api.hideOverlay()
      return
    }

    // 3. Target Confirmed & Stable!
    setTargetLock(targetResult)
    setState('LEVEL_ACTIVE')

    // 4. Speak voice instruction once
    voiceService.speak(currentLevel.voiceInstruction)

    // 5. Deploy Intent Cursor on overlayWin
    await api.showOverlay({
      visible: true,
      levelNumber: currentLevel.levelNumber,
      totalLevels: wf.levels.length,
      targetText: targetResult.text,
      instruction: currentLevel.instruction,
      bounds: targetResult.bounds,
      cursorAnchor: targetResult.cursorAnchor,
      status: 'WAITING',
      method: targetResult.method,
      confidence: targetResult.confidence,
    })

    // 6. Enter WAITING_FOR_USER state
    setState('WAITING_FOR_USER')

    // 7. Schedule non-blocking periodic verification check
    scheduleVerification(wf, levelIdx, activeWin, beforeB64)
  }, [windowInfo])

  // ─────────────────────────────────────────────────────────────────────────
  // Step Completion Verification Loop (WAIT ➔ VERIFY ➔ ADVANCE)
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleVerification = useCallback((
    wf: Workflow,
    levelIdx: number,
    win: WindowInfo,
    beforeShot: string | null,
  ) => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)

    verifyTimerRef.current = setTimeout(async () => {
      const currentLevel = wf.levels[levelIdx]
      try {
        const verification = await screenUnderstandingEngine.verifyLevelComplete(
          win,
          currentLevel,
          beforeShot,
        )

        if (verification.completed && verification.confidence >= 0.75) {
          // Action successfully verified!
          voiceService.speak('Good.')
          await executeLevel(wf, levelIdx + 1)
        } else {
          // Keep waiting quietly without advancing
          scheduleVerification(wf, levelIdx, win, beforeShot)
        }
      } catch {
        scheduleVerification(wf, levelIdx, win, beforeShot)
      }
    }, 4000)
  }, [executeLevel])

  const handleStartTask = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    await executeLevel(workflow, 0)
  }, [workflow, executeLevel])

  const handleRescan = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    await executeLevel(workflow, currentLevelIndex)
  }, [workflow, currentLevelIndex, executeLevel])

  // Decision 2 Option A: Manual confirmation if verification is uncertain
  const handleConfirmStep = useCallback(async () => {
    if (!workflow) return
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    voiceService.speak('Good.')
    await executeLevel(workflow, currentLevelIndex + 1)
  }, [workflow, currentLevelIndex, executeLevel])

  // Developer command: Analyze screen and inspect elements
  const handleDebugAnalyzeScreen = useCallback(async () => {
    setState('SCANNING')
    setStatusMessage('Running complete screen analysis...')
    const win = await screenUnderstandingEngine.getWindowInfo('canva') || {
      found: true, app: 'canva', title: 'Desktop', hwnd: 0,
      x: 0, y: 0, width: window.screen.width, height: window.screen.height, scale_factor: 1.0, is_foreground: true,
    }
    const map = await screenUnderstandingEngine.analyzeScreen(win)
    setScreenMap(map)
    setState('SCREEN_MAP_DEBUG')
  }, [])

  const handleReset = useCallback(() => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    voiceService.stop()
    api.hideOverlay()
    setState('IDLE')
    setInputText('')
    setUserIntent('')
    setIntentResult(null)
    setWorkflow(null)
    setCurrentLevelIndex(0)
    setTargetLock(null)
    setScreenMap(null)
    setErrorMessage(null)
  }, [])

  const handleClose = useCallback(() => {
    handleReset()
    api.togglePanel()
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

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="text-white/40 hover:text-white transition-colors text-sm font-mono leading-none px-1"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Main Content Area ────────────────────────────────────────────── */}
        <div className="no-drag flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <AnimatePresence mode="wait">

            {/* 1. IDLE & LISTENING & UNDERSTANDING STATE */}
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
                  placeholder="e.g. Navigate me through removing the background of this image in Canva..."
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
                  <p className="text-white/40 uppercase tracking-widest text-[9px]">SUPPORTED WORKFLOWS</p>
                  <div className="text-white/60 space-y-1">
                    <div>1. CANVA • Remove image background</div>
                    <div>2. CANVA • Add animation to element</div>
                    <div>3. EXCEL • Create chart from data</div>
                  </div>
                </div>

                {/* Developer debug button */}
                <button
                  onClick={handleDebugAnalyzeScreen}
                  className="w-full text-white/30 hover:text-white/70 text-[9px] font-mono border border-white/10 rounded-[2px] py-1 transition-colors uppercase tracking-widest"
                >
                  🔍 ANALYZE SCREEN (DEBUG INVENTORY)
                </button>
              </motion.div>
            )}

            {/* 2. CANVA SCENARIO 2 (BACKGROUND PROMPT) */}
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

            {/* 3. TASK_SELECTED STATE */}
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
                    {APP_LABEL[intentResult.application]} • {TASK_LABEL[intentResult.task]}
                  </p>
                  <p className="text-white/60 text-[11px] pt-1">"{userIntent}"</p>
                </div>

                <div className="border border-white/10 rounded-[3px] p-3 space-y-2 font-mono text-xs">
                  <p className="text-white/40 uppercase tracking-widest text-[9px]">4 GUIDED LEVELS</p>
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

            {/* 4. SCANNING STATE */}
            {state === 'SCANNING' && (
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

            {/* 5. LEVEL_ACTIVE & WAITING_FOR_USER STATE */}
            {(state === 'LEVEL_ACTIVE' || state === 'WAITING_FOR_USER') && workflow && currentLevel && (
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
                    <span>WAITING FOR YOU — Click the highlighted element</span>
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

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleRescan}
                    className="w-full btn-outline rounded-[3px] py-2 text-xs uppercase font-mono"
                  >
                    ↺ RE-SCAN SCREEN
                  </button>
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
                    Could not confidently locate the target control on your current screen. Make sure the relevant window is open and visible.
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

            {/* 7. SCREEN MAP DEBUG INVENTORY VIEW */}
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
                        <span>Bounds: {el.x},{el.y} ({el.width}×{el.height})</span>
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

            {/* 8. TASK_COMPLETE STATE */}
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
                    All levels verified successfully.
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

            {/* 9. ERROR STATE */}
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

                <button
                  onClick={handleReset}
                  className="w-full btn-outline rounded-[3px] py-2 text-xs uppercase tracking-wider"
                >
                  ← TRY AGAIN
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="no-drag px-4 py-2.5 border-t border-white/10 flex items-center justify-between text-white/30 font-mono text-[9px] uppercase tracking-wider">
          <span>INTENT • PHYSICAL GUIDANCE</span>
          {(state === 'LEVEL_ACTIVE' || state === 'WAITING_FOR_USER' || state === 'SCANNING') && (
            <button onClick={handleReset} className="hover:text-white text-white/50 transition-colors">
              CANCEL
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
