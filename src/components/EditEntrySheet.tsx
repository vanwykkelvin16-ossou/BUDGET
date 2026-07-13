/**
 * Edit / delete a ledger entry (expense, income or savings contribution).
 * Everything derived — safe-to-spend, rings, goal totals, quests, insights,
 * snapshots, XP — reconciles the moment a change is saved.
 */

import { useState } from 'react'
import { useAppStore } from '../state/appStore'
import type { GoalContribution, IncomeEntry, IncomeSource, Transaction } from '../lib/data/types'
import { formatDayLabel, todaySAST } from '../lib/dates'
import { formatZAR, randsToCents } from '../lib/money'
import { Sheet } from './ui/Sheet'
import { Button3D } from './ui/Button3D'
import { CategoryBadge } from './ui/CategoryBadge'

export type LedgerEntry =
  | { type: 'expense'; item: Transaction }
  | { type: 'income'; item: IncomeEntry }
  | { type: 'contribution'; item: GoalContribution }

const SOURCES: { id: IncomeSource; label: string }[] = [
  { id: 'salary', label: '💼 Salary' },
  { id: 'freelance', label: '🛠️ Freelance' },
  { id: 'dividends', label: '📈 Dividends' },
  { id: 'refund', label: '↩️ Refund' },
  { id: 'gift', label: '🎁 Gift' },
  { id: 'other', label: '✨ Other' },
]

export function EditEntrySheet({
  entry,
  onClose,
}: {
  entry: LedgerEntry | null
  onClose: () => void
}) {
  const categories = useAppStore((s) => s.data.categories)
  const goals = useAppStore((s) => s.data.goals)
  const updateExpense = useAppStore((s) => s.updateExpense)
  const deleteExpense = useAppStore((s) => s.deleteExpense)
  const updateIncome = useAppStore((s) => s.updateIncome)
  const deleteIncome = useAppStore((s) => s.deleteIncome)
  const updateContribution = useAppStore((s) => s.updateContribution)
  const deleteContribution = useAppStore((s) => s.deleteContribution)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [source, setSource] = useState<IncomeSource>('other')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-seed the draft whenever a different entry opens.
  const [lastId, setLastId] = useState<string | null>(null)
  if (entry && entry.item.id !== lastId) {
    setLastId(entry.item.id)
    setAmount(String(entry.item.amountCents / 100).replace('.', ','))
    setNote(entry.type === 'contribution' ? '' : (entry.item.note ?? ''))
    setConfirmDelete(false)
    if (entry.type === 'expense') setCategoryId(entry.item.categoryId)
    else if (entry.type === 'income') setSource(entry.item.source)
  }

  if (!entry) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const isExpense = entry.type === 'expense'
  const isContribution = entry.type === 'contribution'
  const goal = isContribution ? goals.find((g) => g.id === entry.item.goalId) : undefined
  const cents = randsToCents(amount)

  async function save() {
    if (cents <= 0 || !entry) return
    if (entry.type === 'expense') {
      await updateExpense(entry.item.id, {
        amountCents: cents,
        categoryId,
        note: note.trim() || undefined,
      })
    } else if (entry.type === 'income') {
      await updateIncome(entry.item.id, {
        amountCents: cents,
        source,
        note: note.trim() || undefined,
      })
    } else {
      await updateContribution(entry.item.id, { amountCents: cents })
    }
    onClose()
  }

  async function remove() {
    if (!entry) return
    if (entry.type === 'expense') await deleteExpense(entry.item.id)
    else if (entry.type === 'income') await deleteIncome(entry.item.id)
    else await deleteContribution(entry.item.id)
    onClose()
  }

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Sheet
      open
      onClose={onClose}
      title={isExpense ? 'Edit expense' : isContribution ? 'Edit savings' : 'Edit income'}
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-xs text-ink-faint font-bold -mt-3">
          Logged {formatDayLabel(entry.item.date, todaySAST())} · currently{' '}
          {formatZAR(entry.item.amountCents)}
          {goal && (
            <>
              {' '}· saved to {goal.icon} {goal.name}
            </>
          )}
        </p>

        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Amount (R)
          </p>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={`w-full px-4 py-3 rounded-2xl bg-bg-deep border outline-none
                       font-display font-extrabold text-2xl text-center focus:border-accent ${
                         cents > 0 ? 'border-edge' : 'border-coral'
                       } ${isExpense ? 'text-coral' : isContribution ? 'text-aqua' : 'text-lime'}`}
          />
        </label>

        {isExpense ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-2">
              Category
            </p>
            <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto no-scrollbar">
              {sorted.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl border-2 transition-all ${
                    categoryId === cat.id ? 'border-accent bg-accent/10' : 'border-transparent'
                  }`}
                >
                  <CategoryBadge category={cat} size={38} />
                  <span className="text-[9px] font-bold text-ink-soft leading-tight text-center">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : entry.type === 'income' ? (
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={`py-2 rounded-2xl text-xs font-display font-extrabold border-2 ${
                  source === s.id
                    ? 'border-accent bg-accent/15 text-accent-soft'
                    : 'border-edge bg-bg-deep text-ink-faint'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        {!isContribution && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note (optional)"
            maxLength={60}
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       text-sm font-semibold placeholder:text-ink-faint focus:border-accent"
          />
        )}

        <Button3D full disabled={cents <= 0} onClick={() => void save()}>
          Save changes
        </Button3D>
        {confirmDelete ? (
          <Button3D full variant="coral" onClick={() => void remove()}>
            Really delete — everything recalculates
          </Button3D>
        ) : (
          <Button3D full variant="ghost" onClick={() => setConfirmDelete(true)}>
            🗑️ Delete this entry
          </Button3D>
        )}
      </div>
    </Sheet>
  )
}
