import { voiceService } from '../services/voice'

interface Props {
  isMuted: boolean
  onToggleMute: () => void
  onReplay: () => void
  className?: string
}

// ─── Minimal Voice Controls ───────────────────────────────────────────────────

export function VoiceControls({ isMuted, onToggleMute, onReplay, className }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {/* Mute */}
      <button
        onClick={onToggleMute}
        className={`px-2 py-1 rounded-[2px] border text-xxs font-mono uppercase tracking-wider transition-colors ${
          isMuted
            ? 'bg-white/20 border-white/40 text-white'
            : 'bg-transparent border-white/20 text-white/60 hover:text-white hover:border-white/50'
        }`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? 'MUTED' : 'VOICE ON'}
      </button>

      {/* Replay */}
      <button
        onClick={() => {
          onReplay()
          voiceService.replay()
        }}
        className="px-2 py-1 rounded-[2px] border border-white/20 text-white/60 hover:text-white hover:border-white/50 text-xxs font-mono uppercase tracking-wider transition-colors"
        title="Replay instruction"
      >
        REPLAY
      </button>
    </div>
  )
}
