import { motion } from 'framer-motion'

interface OfflineBannerProps {
  onCheckConnection?: () => void
  onBrowseWorkflows?: () => void
}

export function OfflineBanner({ onCheckConnection, onBrowseWorkflows }: OfflineBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between text-[11px]"
    >
      <div className="flex items-center gap-1.5 text-slate-300">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <span><strong className="text-slate-100 font-semibold">Offline Mode</strong> — Local guidance active</span>
      </div>
      <div className="flex items-center gap-2">
        {onBrowseWorkflows && (
          <button
            onClick={onBrowseWorkflows}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
          >
            All Workflows
          </button>
        )}
        {onCheckConnection && (
          <button
            onClick={onCheckConnection}
            className="text-[10px] text-slate-400 hover:text-slate-200"
          >
            Reconnect
          </button>
        )}
      </div>
    </motion.div>
  )
}
