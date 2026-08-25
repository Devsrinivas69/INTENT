interface Props {
  currentLevel: number // 1-indexed (1, 2, 3, 4)
  totalLevels: number
  className?: string
}

// ─── Minimal Monochrome Level Indicator ──────────────────────────────────────

export function ProgressIndicator({ currentLevel, totalLevels, className }: Props) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <div className="flex items-center justify-between text-xxs font-mono uppercase tracking-widest text-white/70">
        <span>LEVEL {currentLevel} / {totalLevels}</span>
        <div className="flex items-center gap-1 text-sm tracking-widest text-white">
          {Array.from({ length: totalLevels }).map((_, i) => (
            <span
              key={i}
              className={i + 1 <= currentLevel ? 'text-white' : 'text-white/20'}
            >
              {i + 1 <= currentLevel ? '●' : '○'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
