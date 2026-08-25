import { motion } from 'framer-motion'
import { useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

// ─── Floating Trigger Button ──────────────────────────────────────────────────
// Minimal, technical monochrome button on user desktop.

export function FloatingButton() {
  const [isPressed, setIsPressed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleClick = async () => {
    setIsPressed(true)
    await api.togglePanel()
    setTimeout(() => setIsPressed(false), 200)
  }

  return (
    <div className="drag-region w-full h-full flex items-center justify-center">
      <motion.button
        className="no-drag relative flex items-center justify-center w-12 h-12 rounded-full intent-trigger cursor-pointer select-none"
        onClick={handleClick}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        animate={{
          scale: isPressed ? 0.92 : isHovered ? 1.05 : 1,
        }}
        transition={{ type: 'spring', stiffness: 450, damping: 28 }}
        title="INTENT — Click to open"
      >
        {/* Minimal White ✦ Glyph */}
        <span className="text-white text-base font-light select-none leading-none">
          ✦
        </span>
      </motion.button>
    </div>
  )
}
