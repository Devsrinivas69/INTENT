import { motion, AnimatePresence } from 'framer-motion'

interface TargetBounds {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  target: TargetBounds | null
  visible: boolean
  isDemoMode?: boolean
}

// ─── Target Highlight ─────────────────────────────────────────────────────────
// Renders a glowing highlight rectangle at the target coordinates.
// Positioned absolutely relative to the full-screen overlay window.

export function TargetHighlight({ target, visible, isDemoMode }: Props) {
  if (!target) return null

  const PADDING = 8
  const x = target.x - PADDING
  const y = target.y - PADDING
  const w = target.width + PADDING * 2
  const h = target.height + PADDING * 2

  const accentColor = isDemoMode ? '#f97316' : '#7c6ff7'
  const accentColorDim = isDemoMode ? 'rgba(249, 115, 22, 0.15)' : 'rgba(124, 111, 247, 0.12)'

  return (
    <AnimatePresence>
      {visible && target && (
        <motion.div
          key={`${target.x}-${target.y}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: h,
            pointerEvents: 'none',
          }}
        >
          {/* Glow fill */}
          <div
            className="absolute inset-0 rounded-lg"
            style={{ background: accentColorDim }}
          />

          {/* Border ring */}
          <motion.div
            className="absolute inset-0 rounded-lg"
            style={{
              border: `2px solid ${accentColor}`,
              boxShadow: `0 0 0 3px ${accentColor}22, 0 0 20px ${accentColor}66, 0 0 50px ${accentColor}33`,
            }}
            animate={{
              boxShadow: [
                `0 0 0 3px ${accentColor}22, 0 0 20px ${accentColor}44, 0 0 40px ${accentColor}22`,
                `0 0 0 5px ${accentColor}33, 0 0 30px ${accentColor}88, 0 0 60px ${accentColor}44`,
                `0 0 0 3px ${accentColor}22, 0 0 20px ${accentColor}44, 0 0 40px ${accentColor}22`,
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Corner accents */}
          {[
            { top: -1, left: -1, rotate: 0 },
            { top: -1, right: -1, rotate: 90 },
            { bottom: -1, right: -1, rotate: 180 },
            { bottom: -1, left: -1, rotate: 270 },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                ...pos,
                width: 12,
                height: 12,
                borderTop: i < 2 ? `2px solid ${accentColor}` : 'none',
                borderBottom: i >= 2 ? `2px solid ${accentColor}` : 'none',
                borderLeft: i === 0 || i === 3 ? `2px solid ${accentColor}` : 'none',
                borderRight: i === 1 || i === 2 ? `2px solid ${accentColor}` : 'none',
                borderRadius: [
                  '3px 0 0 0',
                  '0 3px 0 0',
                  '0 0 3px 0',
                  '0 0 0 3px',
                ][i],
              }}
            />
          ))}

          {/* Pointer arrow above the element */}
          <motion.div
            className="absolute flex flex-col items-center"
            style={{
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 8,
            }}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div
              style={{
                fontSize: 18,
                color: accentColor,
                filter: `drop-shadow(0 0 8px ${accentColor})`,
                lineHeight: 1,
              }}
            >
              ▼
            </div>
          </motion.div>

          {/* Demo mode badge */}
          {isDemoMode && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-7 left-0"
            >
              <span
                className="status-badge text-white/80"
                style={{
                  background: 'rgba(249, 115, 22, 0.25)',
                  border: '1px solid rgba(249, 115, 22, 0.5)',
                  whiteSpace: 'nowrap',
                }}
              >
                ◈ DEMO MODE
              </span>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
