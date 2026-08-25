// ─── Voice Speed ──────────────────────────────────────────────────────────────

export type VoiceSpeed = 0.75 | 1 | 1.25 | 1.5

export const VOICE_SPEEDS: VoiceSpeed[] = [0.75, 1, 1.25, 1.5]
export const VOICE_SPEED_LABELS: Record<VoiceSpeed, string> = {
  0.75: '0.75×',
  1: '1×',
  1.25: '1.25×',
  1.5: '1.5×',
}

// ─── Voice Service ────────────────────────────────────────────────────────────

export class VoiceService {
  private _muted = false
  private _speed: VoiceSpeed = 1
  private _lastText = ''

  /** Speak a string using the browser's SpeechSynthesis API */
  speak(text: string): void {
    this._lastText = text
    if (this._muted) return

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = this._speed
    utterance.volume = 1
    utterance.pitch = 1

    // Prefer a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')),
    )
    if (preferred) utterance.voice = preferred

    window.speechSynthesis.speak(utterance)
  }

  /** Replay the last spoken text */
  replay(): void {
    if (this._lastText) this.speak(this._lastText)
  }

  /** Stop any current speech */
  stop(): void {
    window.speechSynthesis.cancel()
  }

  setMuted(muted: boolean): void {
    this._muted = muted
    if (muted) this.stop()
  }

  setSpeed(speed: VoiceSpeed): void {
    this._speed = speed
  }

  get muted(): boolean {
    return this._muted
  }

  get speed(): VoiceSpeed {
    return this._speed
  }
}

export const voiceService = new VoiceService()
