import { motion, AnimatePresence } from 'framer-motion'
import type { DesktopBounds, TargetCandidate } from '../types/screenMap'
import { coordinateManager } from '../services/coordinateMapper'

interface Props {
  bounds: DesktopBounds | null
  cursorAnchor: { x: number; y: number } | null
  targetAnchor?: { x: number; y: number } | null
  targetText?: string
  levelNumber: number
  totalLevels: number
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'ACTION_DETECTED' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
  method?: string
  confidence?: number
  debugMode?: boolean
  debugCandidates?: TargetCandidate[]
}

// ─── Source Color Coding (Section 19 of Precision Spec) ─────────────────────
function getCandidateColor(source: string): { border: string; bg: string; text: string } {
  const s = (source || '').toLowerCase()
  if (s.includes('uia')) {
    return { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', text: '#4ade80' } // GREEN = UIA
  }
  if (s.includes('dom')) {
    return { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', text: '#60a5fa' } // BLUE = DOM
  }
  if (s.includes('ocr')) {
    return { border: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', text: '#fde047' } // YELLOW = OCR
  }
  if (s.includes('opencv') || s.includes('cv')) {
    return { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', text: '#f87171' } // RED = OpenCV
  }
  if (s.includes('fused')) {
    return { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc' } // PURPLE = Fused
  }
  return { border: '#ffffff', bg: 'rgba(255, 255, 255, 0.10)', text: '#ffffff' } // WHITE = Final
}

// ─── The Second Cursor ("Intent Cursor") ──────────────────────────────────────
// Independent precision visual guidance pointer rendered on overlayWin.
// Click-through: Real human mouse remains 100% independent.

export function IntentCursor({
  bounds,
  cursorAnchor,
  targetAnchor,
  targetText,
  levelNumber,
  totalLevels,
  status,
  method = 'UIA',
  confidence = 0.95,
  debugMode = false,
  debugCandidates = [],
}: Props) {
  if (!bounds || !cursorAnchor) return null

  // Ensure coordinates are finite numbers before rendering
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(cursorAnchor.x) ||
    !Number.isFinite(cursorAnchor.y)
  ) {
    return null
  }

  const PADDING = 4
  const boxX = Math.max(10, bounds.x - PADDING)
  const boxY = Math.max(10, bounds.y - PADDING)
  const boxW = Math.max(28, bounds.width + PADDING * 2)
  const boxH = Math.max(20, bounds.height + PADDING * 2)

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" style={{ zIndex: 99999 }}>
      {/* ── 0. Developer Debug Candidates Overlay (Ctrl+Shift+D) ──────────── */}
      {debugMode && debugCandidates.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {debugCandidates.map((c, i) => {
            const rawRect = c.rect || { x: c.x, y: c.y, width: c.width, height: c.height }
            const oRect = coordinateManager.screenToOverlayRect(rawRect)
            const colors = getCandidateColor(c.source)

            return (
              <div
                key={`debug-${c.id || i}`}
                style={{
                  position: 'absolute',
                  left: oRect.x,
                  top: oRect.y,
                  width: oRect.width,
                  height: oRect.height,
                  border: `1.5px dashed ${colors.border}`,
                  backgroundColor: colors.bg,
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="absolute -top-4 left-0 px-1 py-0.2 rounded font-mono text-[8px] whitespace-nowrap"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  [{c.source.toUpperCase()}] {c.text ? `"${c.text.slice(0, 16)}"` : ''} {(c.confidence * 100).toFixed(0)}%
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 1. Target Bounding Box ────────────────────────────────────────── */}
      <AnimatePresence>
        {bounds && (
          <motion.div
            key={`box-${bounds.x}-${bounds.y}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: boxX,
              top: boxY,
              width: boxW,
              height: boxH,
            }}
          >
            {/* Dark contrast veil */}
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{ background: 'rgba(0, 0, 0, 0.08)' }}
            />

            {/* Crisp 1.5px White Precision Border with 1px black outline */}
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{
                border: '1.5px solid rgba(255, 255, 255, 0.95)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.85), 0 0 8px rgba(255, 255, 255, 0.25)',
              }}
            />

            {/* Precision Corner Ticks */}
            {[
              { top: -2, left: -2, borderTop: '2px solid #FFFFFF', borderLeft: '2px solid #FFFFFF' },
              { top: -2, right: -2, borderTop: '2px solid #FFFFFF', borderRight: '2px solid #FFFFFF' },
              { bottom: -2, left: -2, borderBottom: '2px solid #FFFFFF', borderLeft: '2px solid #FFFFFF' },
              { bottom: -2, right: -2, borderBottom: '2px solid #FFFFFF', borderRight: '2px solid #FFFFFF' },
            ].map((style, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  ...style,
                  width: 8,
                  height: 8,
                  boxShadow: '0 0 2px rgba(0,0,0,0.9)',
                }}
              />
            ))}

            {/* Target Interaction Center Bullseye (if targetAnchor provided) */}
            {targetAnchor && (
              <div
                className="absolute w-2 h-2 rounded-full bg-white/80 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: targetAnchor.x - boxX,
                  top: targetAnchor.y - boxY,
                  boxShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.6)',
                }}
              />
            )}

            {/* Target Header Tag */}
            <div
              className="absolute -top-6 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-black/90 border border-white/40 text-white font-mono text-[10px] tracking-wider whitespace-nowrap"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.85)' }}
            >
              <span className="text-white/60">L{levelNumber}</span>
              <span>•</span>
              <span className="font-semibold text-white">{targetText || `LEVEL ${levelNumber}`}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2. The Intent Cursor Pointer ──────────────────────────────────── */}
      <motion.div
        animate={{
          x: cursorAnchor.x,
          y: cursorAnchor.y,
        }}
        transition={{
          type: 'spring',
          damping: 26,
          stiffness: 260,
          mass: 0.6,
        }}
        className="absolute top-0 left-0"
        style={{ pointerEvents: 'none', zIndex: 999999 }}
      >
        <div className="relative -top-4 -left-4 flex flex-col items-center">
          {/* Direct Arrow Tip pointing up at target */}
          <div
            className="w-0 h-0 border-x-[6px] border-x-transparent border-b-[8px] border-b-white"
            style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
          />

          {/* Outer Black Contrast Reticle with White Rim */}
          <div
            className="w-8 h-8 rounded-full bg-black/90 border-2 border-white flex items-center justify-center -mt-1"
            style={{
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(0,0,0,0.8)',
            }}
          >
            {/* Inner Precision White Dot */}
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-white"
              animate={
                status === 'WAITING'
                  ? { scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }
                  : { scale: 1 }
              }
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* State Tag under Cursor */}
          <div
            className="mt-1 px-2.5 py-0.5 rounded-[2px] bg-black/95 border border-white/40 text-white font-mono text-[9px] uppercase tracking-widest whitespace-nowrap"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.85)' }}
          >
            {status === 'WAITING' && 'WAITING FOR YOU'}
            {status === 'ACTION_DETECTED' && '● ACTION DETECTED'}
            {status === 'VERIFYING' && 'VERIFYING...'}
            {status === 'GUIDING' && `LEVEL ${levelNumber}/${totalLevels}`}
            {status === 'COMPLETE' && '✓ VERIFIED'}
            {status === 'NOT_FOUND' && 'NOT FOUND — RESCANNING'}
          </div>
        </div>
      </motion.div>

      {/* ── 3. Developer Diagnostics HUD (Bottom Right of Desktop) ─────────── */}
      <div
        className="absolute bottom-6 right-6 p-2.5 rounded-[3px] bg-black/90 border border-white/20 font-mono text-[9px] text-white/70 space-y-1 select-none"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between text-white font-semibold border-b border-white/10 pb-1">
          <span>INTENT ENGINE v4.4</span>
          <span className={debugMode ? 'text-emerald-400' : 'text-white/50'}>
            {debugMode ? 'DEBUG MODE' : status}
          </span>
        </div>
        {debugMode && (
          <div className="text-emerald-400 font-semibold text-[8px]">
            HOTKEY: Ctrl+Shift+D [GREEN=UIA, BLUE=DOM, YELLOW=OCR, PURPLE=FUSED]
          </div>
        )}
        <div>METHOD: <span className="text-white font-semibold uppercase">{method}</span></div>
        <div>CONFIDENCE: <span className="text-white">{(confidence * 100).toFixed(0)}%</span></div>
        <div>BOUNDS: <span className="text-white/80">{bounds.x},{bounds.y},{bounds.width},{bounds.height}</span></div>
        <div>CURSOR: <span className="text-white/80">{cursorAnchor.x},{cursorAnchor.y}</span></div>
      </div>
    </div>
  )
}
