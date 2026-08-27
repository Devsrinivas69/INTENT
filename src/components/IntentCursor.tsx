import { motion, AnimatePresence } from 'framer-motion'
import type { DesktopBounds } from '../types/screenMap'

interface Props {
  bounds: DesktopBounds | null
  cursorAnchor: { x: number; y: number } | null
  targetText?: string
  levelNumber: number
  totalLevels: number
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'ACTION_DETECTED' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
  method?: string
  confidence?: number
}

// ─── The Second Cursor ("Intent Cursor") ──────────────────────────────────────
// Independent precision AI navigation pointer rendered on overlayWin.
// Real mouse is 100% independent.

export function IntentCursor({
  bounds,
  cursorAnchor,
  targetText,
  levelNumber,
  totalLevels,
  status,
  method = 'UIA',
  confidence = 0.95,
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
  const boxW = Math.max(30, bounds.width + PADDING * 2)
  const boxH = Math.max(20, bounds.height + PADDING * 2)

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" style={{ zIndex: 99999 }}>
      {/* ── 1. Target Bounding Box ────────────────────────────────────────── */}
      <AnimatePresence>
        {bounds && (
          <motion.div
            key={`box-${bounds.x}-${bounds.y}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
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
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.85), 0 0 8px rgba(255, 255, 255, 0.2)',
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
          <span>INTENT ENGINE v4.0</span>
          <span className="text-white/50">{status}</span>
        </div>
        <div>METHOD: <span className="text-white font-semibold uppercase">{method}</span></div>
        <div>CONFIDENCE: <span className="text-white">{(confidence * 100).toFixed(0)}%</span></div>
        <div>BOUNDS: <span className="text-white/80">{bounds.x},{bounds.y},{bounds.width},{bounds.height}</span></div>
        <div>CURSOR: <span className="text-white/80">{cursorAnchor.x},{cursorAnchor.y}</span></div>
      </div>
    </div>
  )
}
