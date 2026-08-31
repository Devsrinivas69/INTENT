import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).electronAPI

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onKeyUpdated?: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onKeyUpdated,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [maskedKey, setMaskedKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [isCustomKey, setIsCustomKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      const s = await api?.getSettings?.()
      if (s) {
        setHasKey(s.hasKey)
        setIsCustomKey(s.isCustomKey)
        setMaskedKey(s.maskedKey || '')
        if (s.rawKey) {
          setApiKeyInput(s.rawKey)
        }
      }
    } catch (e) {
      console.warn('[Settings] Failed to load settings:', e)
    }
  }

  const handleSave = async () => {
    if (!apiKeyInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid Gemini API key.' })
      return
    }

    setLoading(true)
    setStatusMessage({ type: 'info', text: 'Testing & validating API key with Google Gemini...' })

    try {
      const res = await api?.saveGeminiKey?.(apiKeyInput.trim())
      if (res?.success) {
        setStatusMessage({ type: 'success', text: 'API Key verified and saved successfully.' })
        setHasKey(true)
        setIsCustomKey(true)
        onKeyUpdated?.()
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Validation failed. Please check the key.' })
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Error saving key.' })
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    setLoading(true)
    try {
      await api?.clearGeminiKey?.()
      setApiKeyInput('')
      setMaskedKey('')
      setHasKey(false)
      setIsCustomKey(false)
      setStatusMessage({ type: 'info', text: 'Key removed. App using fallback local detectors.' })
      onKeyUpdated?.()
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Error clearing key.' })
    } finally {
      setLoading(false)
    }
  }

  const openAiStudio = () => {
    window.open('https://aistudio.google.com/app/apikey', '_blank', 'noopener,noreferrer')
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-none font-mono">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="w-full max-w-md bg-black border border-white text-white p-5 space-y-4 shadow-none"
        >
          {/* Header */}
          <div className="flex justify-between items-center pb-2 border-b border-white">
            <span className="text-xs font-bold tracking-widest uppercase">
              // SETTINGS : GEMINI API KEY
            </span>
            <button
              onClick={onClose}
              className="text-[11px] px-2 py-0.5 border border-white/40 hover:border-white hover:bg-white hover:text-black uppercase transition-none"
            >
              [ ESC / CLOSE ]
            </button>
          </div>

          {/* Philosophy Note */}
          <div className="text-[11px] leading-relaxed text-white/80 border-l border-white/40 pl-3">
            INTENT is 100% local-first and subscription-free. Enter your free Google Gemini API key to activate semantic natural-language classification and multi-modal screen verification.
          </div>

          {/* Current Status */}
          <div className="flex justify-between items-center text-[10px] bg-white/[0.05] border border-white/20 p-2">
            <span>STATUS:</span>
            <span className={hasKey ? 'text-white font-bold' : 'text-white/50'}>
              {hasKey
                ? isCustomKey
                  ? '[ CUSTOM KEY ACTIVE ]'
                  : '[ ENV KEY DETECTED ]'
                : '[ NOT CONFIGURED // RUNNING LOCAL ONLY ]'}
            </span>
          </div>

          {/* Key Input */}
          <div className="space-y-1.5">
            <label className="block text-[10px] text-white/70 tracking-wider">
              GOOGLE GEMINI API KEY:
            </label>
            <div className="relative flex">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value.trim())}
                placeholder="AIzaSy..."
                className="w-full bg-black border border-white px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:bg-white/10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="px-2.5 border-y border-r border-white text-[9px] uppercase hover:bg-white hover:text-black"
              >
                {showKey ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            {maskedKey && !showKey && (
              <p className="text-[9px] text-white/40">Stored: {maskedKey}</p>
            )}
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-2 text-[10px] border ${
                statusMessage.type === 'success'
                  ? 'border-white bg-white/10 text-white'
                  : statusMessage.type === 'error'
                  ? 'border-white/80 bg-white/5 text-white/90 underline'
                  : 'border-white/30 text-white/70'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={loading}
              className="py-2 px-3 border border-white bg-white text-black font-bold text-xs uppercase hover:bg-black hover:text-white transition-none disabled:opacity-50"
            >
              {loading ? '[ VERIFYING... ]' : '[ SAVE & VERIFY ]'}
            </button>
            <button
              onClick={handleClear}
              disabled={loading || !hasKey}
              className="py-2 px-3 border border-white/40 text-white text-xs uppercase hover:border-white hover:bg-white hover:text-black transition-none disabled:opacity-30"
            >
              [ CLEAR KEY ]
            </button>
          </div>

          {/* Get Free Key Instructions */}
          <div className="border-t border-white/20 pt-3 space-y-2 text-[10px]">
            <div className="text-white font-bold tracking-wider uppercase">
              How to obtain a free key (10 seconds):
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-white/70">
              <li>Open Google AI Studio at <span className="text-white">aistudio.google.com</span></li>
              <li>Sign in with your Google account (no credit card required)</li>
              <li>Click &quot;Create API Key&quot; and paste it into the field above</li>
            </ol>
            <button
              onClick={openAiStudio}
              className="w-full py-1.5 border border-dashed border-white/60 text-white text-[10px] uppercase hover:border-solid hover:bg-white hover:text-black"
            >
              [ OPEN GOOGLE AI STUDIO ↗ ]
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
