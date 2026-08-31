import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SupportModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Tier {
  id: string
  amount: string
  name: string
  desc: string
}

const TIERS: Tier[] = [
  {
    id: 'coffee',
    amount: '$3',
    name: 'COFFEE BOOST',
    desc: 'Fuel open-source engineering & day-to-day maintenance.',
  },
  {
    id: 'credits',
    amount: '$10',
    name: 'AI COMPUTE CREDITS',
    desc: 'Fund multi-modal vision testing & prompt dataset generation.',
  },
  {
    id: 'sponsor',
    amount: '$25',
    name: 'PROJECT SPONSOR',
    desc: 'Support ongoing Windows automation research & prioritized feature requests.',
  },
]

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [selectedTier, setSelectedTier] = useState<string>('credits')

  // Payment links (can be customized by the developer)
  const SUPPORT_URLS = {
    buymeacoffee: 'https://buymeacoffee.com',
    github: 'https://github.com/sponsors',
    kofi: 'https://ko-fi.com',
  }

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
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
              // SUPPORT : FUND DEVELOPER AI CREDITS
            </span>
            <button
              onClick={onClose}
              className="text-[11px] px-2 py-0.5 border border-white/40 hover:border-white hover:bg-white hover:text-black uppercase transition-none"
            >
              [ ESC / CLOSE ]
            </button>
          </div>

          {/* Description */}
          <div className="text-[11px] leading-relaxed text-white/80 border-l border-white/40 pl-3">
            INTENT is 100% free and open-source. If INTENT saved you time, you can support continuous research, Windows automation testing, and model evaluation datasets.
          </div>

          {/* Tier Selection */}
          <div className="space-y-2">
            <div className="text-[10px] text-white/60 uppercase tracking-wider">
              SELECT CONTRIBUTION TIER:
            </div>
            <div className="space-y-1.5">
              {TIERS.map((tier) => {
                const isSelected = selectedTier === tier.id
                return (
                  <div
                    key={tier.id}
                    onClick={() => setSelectedTier(tier.id)}
                    className={`cursor-pointer p-2.5 border transition-none ${
                      isSelected
                        ? 'border-white bg-white/10 text-white'
                        : 'border-white/20 text-white/70 hover:border-white/60 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>{isSelected ? '● ' : '○ '}{tier.name}</span>
                      <span className="border border-white/40 px-1.5 py-0.5 text-[10px]">
                        {tier.amount}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/60 mt-1 pl-3.5">
                      {tier.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Payment Gateways */}
          <div className="space-y-2 pt-1 border-t border-white/20">
            <div className="text-[10px] text-white/60 uppercase tracking-wider">
              PROCEED VIA PREFERRED PLATFORM:
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleOpenLink(SUPPORT_URLS.buymeacoffee)}
                className="py-2 px-2 border border-white bg-white text-black font-bold text-[10px] uppercase hover:bg-black hover:text-white transition-none text-center"
              >
                BUY ME A COFFEE ↗
              </button>
              <button
                onClick={() => handleOpenLink(SUPPORT_URLS.kofi)}
                className="py-2 px-2 border border-white/40 text-white font-bold text-[10px] uppercase hover:border-white hover:bg-white hover:text-black transition-none text-center"
              >
                KO-FI ↗
              </button>
              <button
                onClick={() => handleOpenLink(SUPPORT_URLS.github)}
                className="py-2 px-2 border border-white/40 text-white font-bold text-[10px] uppercase hover:border-white hover:bg-white hover:text-black transition-none text-center"
              >
                GH SPONSORS ↗
              </button>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-[9px] text-white/40 text-center pt-1">
            ALL CONTRIBUTIONS DIRECTLY SUPPORT INDEPENDENT SOFTWARE DEVELOPMENT.
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
