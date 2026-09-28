import { motion } from 'framer-motion'
import type { TargetCandidate } from '../types/screenMap'

interface CandidatePickerProps {
  candidates: TargetCandidate[]
  targetText: string
  onSelectCandidate: (candidate: TargetCandidate) => void
  onCancel: () => void
}

export function CandidatePicker({
  candidates,
  targetText,
  onSelectCandidate,
  onCancel,
}: CandidatePickerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="p-3 bg-slate-900/95 border border-amber-500/40 rounded-xl shadow-2xl backdrop-blur-md text-left"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">
            Target Disambiguation
          </span>
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
            Offline Mode
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-200 text-xs px-1"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-slate-300 mb-2.5">
        Multiple buttons match <span className="font-semibold text-white">"{targetText}"</span>. Please choose the correct control:
      </p>

      <div className="space-y-1.5">
        {candidates.map((c, idx) => (
          <button
            key={c.id || idx}
            onClick={() => onSelectCandidate(c)}
            className="w-full text-left p-2 rounded-lg bg-slate-800/90 hover:bg-indigo-950/70 border border-slate-700 hover:border-indigo-500 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-700 group-hover:bg-indigo-600 text-white font-mono text-[11px] flex items-center justify-center font-bold">
                {idx + 1}
              </span>
              <div>
                <div className="text-xs font-medium text-slate-100 group-hover:text-white">
                  {c.text || targetText}
                </div>
                <div className="text-[10px] text-slate-400">
                  Position: ({c.x}, {c.y}) · Source: {c.source}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-indigo-400 font-medium group-hover:text-indigo-300">
              Select →
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
