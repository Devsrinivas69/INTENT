import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { workflows } from '../workflows/index'
import type { Workflow } from '../types/workflow'

interface WorkflowSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectWorkflow: (wf: Workflow) => void
}

const APP_GROUPS: Record<string, string> = {
  excel: 'Microsoft Excel',
  word: 'Microsoft Word',
  powerpoint: 'PowerPoint',
  canva: 'Canva',
  calculator: 'Calculator',
  notepad: 'Notepad',
  chrome: 'Google Chrome',
  chrome_gmail: 'Gmail',
  chrome_youtube: 'YouTube',
}

export function WorkflowSelectorModal({
  isOpen,
  onClose,
  onSelectWorkflow,
}: WorkflowSelectorModalProps) {
  const [filter, setFilter] = useState('')
  const [selectedApp, setSelectedApp] = useState<string>('all')

  if (!isOpen) return null

  const filtered = workflows.filter((wf) => {
    const matchesApp = selectedApp === 'all' || wf.application === selectedApp
    const matchesText =
      !filter ||
      wf.name.toLowerCase().includes(filter.toLowerCase()) ||
      wf.description.toLowerCase().includes(filter.toLowerCase()) ||
      wf.application.toLowerCase().includes(filter.toLowerCase())
    return matchesApp && matchesText
  })

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-left"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Select a Workflow</h2>
              <p className="text-[11px] text-slate-400">All 29 workflows are available offline</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm"
            >
              ✕
            </button>
          </div>

          {/* Search & App Filter */}
          <div className="p-3 border-b border-slate-800/80 space-y-2">
            <input
              type="text"
              placeholder="Search workflows (e.g., autosum, chart, table)..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex gap-1 overflow-x-auto pb-1 text-[10px] scrollbar-none">
              <button
                onClick={() => setSelectedApp('all')}
                className={`px-2 py-0.5 rounded-full whitespace-nowrap ${
                  selectedApp === 'all'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Apps
              </button>
              {Object.entries(APP_GROUPS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSelectedApp(key)}
                  className={`px-2 py-0.5 rounded-full whitespace-nowrap ${
                    selectedApp === key
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Workflow List */}
          <div className="p-3 overflow-y-auto space-y-2 flex-1">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No workflows match your search.
              </div>
            ) : (
              filtered.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => {
                    onSelectWorkflow(wf)
                    onClose()
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/60 transition-all text-left flex items-start justify-between group"
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                        {APP_GROUPS[wf.application] || wf.application}
                      </span>
                      <span className="text-xs font-semibold text-slate-100 group-hover:text-white">
                        {wf.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {wf.description}
                    </p>
                    <div className="text-[10px] text-indigo-400">
                      {wf.levels.length} step{wf.levels.length > 1 ? 's' : ''} · Guided visually
                    </div>
                  </div>
                  <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform text-sm pt-1">
                    →
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
