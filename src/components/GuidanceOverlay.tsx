import { useEffect, useState, useCallback } from 'react'
import { IntentCursor } from './IntentCursor'
import type { OverlayPayload } from '../types/screenMap'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

// ─── Guidance Overlay ─────────────────────────────────────────────────────────
// Full-screen transparent, click-through overlay hosting the Intent Cursor.

export function GuidanceOverlay() {
  const [data, setData] = useState<OverlayPayload | null>(null)
  const [debugMode, setDebugMode] = useState<boolean>(false)

  const handleUpdate = useCallback((raw: unknown) => {
    const payload = raw as OverlayPayload
    setData(payload)
    if (payload?.debugMode !== undefined) {
      setDebugMode(Boolean(payload.debugMode))
    }
  }, [])

  // Listen for IPC overlay updates
  useEffect(() => {
    if (!api?.onOverlayUpdate) return
    const cleanup = api.onOverlayUpdate(handleUpdate)
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [handleUpdate])

  // Listen for Ctrl+Shift+D debug mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        setDebugMode(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    let cleanupIpc: (() => void) | undefined
    if (api?.onToggleDebug) {
      cleanupIpc = api.onToggleDebug(() => {
        setDebugMode(prev => !prev)
      })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof cleanupIpc === 'function') cleanupIpc()
    }
  }, [])

  if (!data || !data.bounds || !data.cursorAnchor || !data.visible) {
    return null
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'transparent', pointerEvents: 'none' }}
    >
      <IntentCursor
        bounds={data.bounds}
        cursorAnchor={data.cursorAnchor}
        targetAnchor={data.targetAnchor}
        targetText={data.targetText}
        levelNumber={data.levelNumber}
        totalLevels={data.totalLevels}
        status={data.status}
        method={data.method}
        confidence={data.confidence}
        debugMode={debugMode}
        debugCandidates={data.debugCandidates}
      />
    </div>
  )
}
