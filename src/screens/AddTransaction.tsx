/**
 * Lightning-fast entry: amount → category → done. Big number pad, giant
 * amount display, category grid one tap away. Also quick-adds income.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { NumberPad } from '../components/ui/NumberPad'
import { useAmountEntry } from '../components/ui/useAmountEntry'
import { Button3D } from '../components/ui/Button3D'
import { CategoryBadge } from '../components/ui/CategoryBadge'
import type { IncomeSource } from '../lib/data/types'

type Mode = 'expense' | 'income'

const INCOME_SOURCES: { id: IncomeSource; label: string; icon: string }[] = [
  { id: 'salary', label: 'Salary', icon: '💼' },
  { id: 'freelance', label: 'Freelance', icon: '🛠️' },
  { id: 'dividends', label: 'Dividends', icon: '📈' },
  { id: 'refund', label: 'Refund', icon: '↩️' },
  { id: 'gift', label: 'Gift', icon: '🎁' },
  { id: 'other', label: 'Other', icon: '✨' },
]

export function AddTransaction() {
  const navigate = useNavigate()
  const categories = useAppStore((s) => s.data.categories)
  const addExpense = useAppStore((s) => s.addExpense)
  const addIncome = useAppStore((s) => s.addIncome)

  const [mode, setMode] = useState<Mode>('expense')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const amount = useAmountEntry()

  const ready = amount.amountCents > 0

  async function saveExpense(categoryId: string) {
    if (!ready || busy) return
    setBusy(true)
    await addExpense({ amountCents: amount.amountCents, categoryId, note: note.trim() || undefined })
    navigate('/')
  }

  async function saveIncome(source: IncomeSource) {
    if (!ready || busy) return
    setBusy(true)
    await addIncome({ amountCents: amount.amountCents, source, note: note.trim() || undefined })
    navigate('/')
  }

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Screen withTabBar={false} className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     font-display font-extrabold active:translate-y-[2px] active:border-b"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flex rounded-2xl bg-bg-deep border border-edge p-1 gap-1">
          {(['expense', 'income'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'px-4 py-1.5 rounded-xl font-display font-extrabold text-sm transition-colors',
                mode === m
                  ? m === 'expense'
                    ? 'bg-gradient-to-b from-[#ff8ba0] to-coral text-white'
                    : 'bg-gradient-to-b from-lime to-lime-deep text-[#1a2e05]'
                  : 'text-ink-faint',
              ].join(' ')}
            >
              {m === 'expense' ? 'Spend' : 'Money in'}
            </button>
          ))}
        </div>
        <span className="w-10" />
      </header>

      {/* Amount display */}
      <motion.div
        key={mode}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center py-4"
      >
        <span
          className={`font-display font-extrabold text-5xl ${
            mode === 'expense' ? 'text-coral' : 'text-gradient-win'
          }`}
        >
          {amount.display}
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note (optional)"
          className="block mx-auto mt-2 bg-transparent text-center text-sm text-ink-soft
                     placeholder:text-ink-faint outline-none font-semibold w-56"
          maxLength={60}
        />
      </motion.div>

      <NumberPad onDigit={amount.digit} onBackspace={amount.backspace} onDecimal={amount.decimal} />

      {/* Category / source grid */}
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-faint mb-2">
          {mode === 'expense' ? 'Tap a category to save' : 'Tap a source to save'}
        </p>
        {mode === 'expense' ? (
          <div className={`grid grid-cols-4 gap-2.5 ${ready ? '' : 'opacity-40 pointer-events-none'}`}>
            {sorted.map((cat) => (
              <button
                key={cat.id}
                onClick={() => void saveExpense(cat.id)}
                className="flex flex-col items-center gap-1 py-2 rounded-2xl active:scale-90 transition-transform"
              >
                <CategoryBadge category={cat} size={46} />
                <span className="text-[10px] font-bold text-ink-soft leading-tight text-center">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={`grid grid-cols-3 gap-2.5 ${ready ? '' : 'opacity-40 pointer-events-none'}`}>
            {INCOME_SOURCES.map((source) => (
              <Button3D
                key={source.id}
                variant="ghost"
                size="sm"
                onClick={() => void saveIncome(source.id)}
                className="!py-3"
              >
                {source.icon} {source.label}
              </Button3D>
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}
