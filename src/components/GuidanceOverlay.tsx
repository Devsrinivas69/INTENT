import { useEffect, useState, useCallback } from 'react'
import { IntentCursor } from './IntentCursor'
import type { OverlayPayload } from '../types/screenMap'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

// ─── Guidance Overlay ─────────────────────────────────────────────────────────
// Full-screen transparent, click-through overlay hosting the Intent Cursor.

export function GuidanceOverlay() {
  const [data, setData] = useState<OverlayPayload | null>(null)

  const handleUpdate = useCallback((raw: unknown) => {
    setData(raw as OverlayPayload)
  }, [])

  useEffect(() => {
    if (!api?.onOverlayUpdate) return
    const cleanup = api.onOverlayUpdate(handleUpdate)
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [handleUpdate])

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
        targetText={data.targetText}
        levelNumber={data.levelNumber}
        totalLevels={data.totalLevels}
        status={data.status}
        method={data.method}
        confidence={data.confidence}
      />
    </div>
  )
}
