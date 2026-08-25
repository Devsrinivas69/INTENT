import { motion, AnimatePresence } from 'framer-motion'
import type { DesktopBounds } from '../types/screenMap'

interface Props {
  bounds: DesktopBounds | null
  cursorAnchor: { x: number; y: number } | null
  targetText?: string
  levelNumber: number
  totalLevels: number
  status: 'SCANNING' | 'GUIDING' | 'WAITING' | 'VERIFYING' | 'COMPLETE' | 'NOT_FOUND'
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
  const boxX = bounds.x - PADDING
  const boxY = bounds.y - PADDING
  const boxW = bounds.width + PADDING * 2
  const boxH = bounds.height + PADDING * 2

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
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
                border: '1.5px solid rgba(255, 255, 255, 0.9)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.75)',
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
              className="absolute -top-6 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-black/90 border border-white/30 text-white font-mono text-[10px] tracking-wider whitespace-nowrap"
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}
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
          damping: 28,
          stiffness: 280,
          mass: 0.6,
        }}
        className="absolute top-0 left-0"
        style={{ pointerEvents: 'none' }}
      >
        <div className="relative -top-3 -left-3 flex flex-col items-center">
          {/* Outer Black Contrast Reticle */}
          <div
            className="w-7 h-7 rounded-full bg-black/80 border border-white/80 flex items-center justify-center"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0,0,0,0.9)',
            }}
          >
            {/* Inner Precision White Dot */}
            <motion.div
              className="w-2 h-2 rounded-full bg-white"
              animate={
                status === 'WAITING'
                  ? { scale: [1, 1.3, 1], opacity: [0.9, 1, 0.9] }
                  : { scale: 1 }
              }
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Guide Line to Target Box */}
          <div
            className="w-[1px] h-3 bg-white/70"
            style={{ boxShadow: '0 0 1px rgba(0,0,0,0.8)' }}
          />

          {/* State Tag under Cursor */}
          <div
            className="mt-1 px-2 py-0.5 rounded-[2px] bg-black/90 border border-white/20 text-white font-mono text-[9px] uppercase tracking-widest whitespace-nowrap"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}
          >
            {status === 'WAITING' && 'WAITING FOR YOU'}
            {status === 'VERIFYING' && 'VERIFYING...'}
            {status === 'GUIDING' && `LEVEL ${levelNumber}/${totalLevels}`}
            {status === 'COMPLETE' && '✓ VERIFIED'}
          </div>
        </div>
      </motion.div>

      {/* ── 3. Developer Diagnostics HUD (Bottom Right of Desktop) ─────────── */}
      <div
        className="absolute bottom-6 right-6 p-2.5 rounded-[3px] bg-black/90 border border-white/20 font-mono text-[9px] text-white/70 space-y-1 select-none"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between text-white font-semibold border-b border-white/10 pb-1">
          <span>INTENT ENGINE v3</span>
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
