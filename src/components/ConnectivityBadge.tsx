import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { connectivityManager } from '../services/connectivityManager'
import type { ConnectivityStatus } from '../types/connectivity'

export function ConnectivityBadge() {
  const [status, setStatus] = useState<ConnectivityStatus>(connectivityManager.getStatus())
  const [isProbing, setIsProbing] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    return connectivityManager.addListener((newStatus) => {
      setStatus(newStatus)
    })
  }, [])

  const handleManualCheck = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isProbing) return
    setIsProbing(true)
    try {
      const res = await connectivityManager.probe()
      setStatus(res)
    } finally {
      setIsProbing(false)
    }
  }

  const getConfig = () => {
    switch (status.state) {
      case 'ONLINE':
        return {
          dotColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
          textColor: 'text-emerald-300',
          label: 'ONLINE',
          desc: status.latencyMs ? `${status.latencyMs}ms latency` : 'Connected',
        }
      case 'DEGRADED':
        return {
          dotColor: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]',
          textColor: 'text-amber-300',
          label: 'DEGRADED',
          desc: 'High latency / retries',
        }
      case 'OFFLINE':
        return {
          dotColor: 'bg-slate-400',
          textColor: 'text-slate-400',
          label: 'OFFLINE',
          desc: 'Local guidance active',
        }
      case 'RECOVERING':
        return {
          dotColor: 'bg-sky-400 animate-ping',
          textColor: 'text-sky-300',
          label: 'RECOVERING',
          desc: 'Testing connection...',
        }
      case 'SYNCING':
        return {
          dotColor: 'bg-indigo-400 animate-pulse',
          textColor: 'text-indigo-300',
          label: 'SYNCING',
          desc: 'Synchronizing tasks...',
        }
    }
  }

  const cfg = getConfig()

  return (
    <div className="relative inline-block">
      <button
        onClick={handleManualCheck}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 transition-colors text-[10px] font-mono tracking-wider"
        title="Click to check connection"
      >
        <span className={`w-2 h-2 rounded-full ${cfg.dotColor} ${isProbing ? 'animate-spin' : ''}`} />
        <span className={`font-semibold ${cfg.textColor}`}>{cfg.label}</span>
      </button>

      {showTooltip && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-0 top-full mt-1.5 z-50 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 shadow-xl text-left min-w-[140px] pointer-events-none"
        >
          <div className="text-[11px] font-medium text-slate-200">{cfg.desc}</div>
          <div className="text-[9px] text-slate-400 mt-0.5">Click badge to re-probe</div>
          {status.offlineReason && (
            <div className="text-[9px] text-amber-400/90 mt-1 border-t border-slate-800 pt-1">
              {status.offlineReason}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
