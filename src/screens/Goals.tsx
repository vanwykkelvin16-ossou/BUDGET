/**
 * Savings & goals: named goals with progress rings, contributions,
 * monthly auto-allocation and milestone celebrations.
 */

import { useState } from 'react'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { ProgressRing } from '../components/ui/ProgressRing'
import { Sheet } from '../components/ui/Sheet'
import { EmptyState } from '../components/ui/EmptyState'
import { NumberPad } from '../components/ui/NumberPad'
import { useAmountEntry } from '../components/ui/useAmountEntry'
import { formatRands, formatZAR, randsToCents } from '../lib/money'
import type { Goal } from '../lib/data/types'

const GOAL_ICONS = ['🛟', '🏖️', '💻', '🚗', '🏠', '💍', '🎓', '👶', '🐶', '✈️', '🎸', '🎁']
const GOAL_COLORS = ['#22D3EE', '#FB923C', '#8B5CF6', '#A3E635', '#FF5C7A', '#FACC15']

export function Goals() {
  const goals = useAppStore((s) => s.data.goals)
  const [addOpen, setAddOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [contributeTo, setContributeTo] = useState<Goal | null>(null)

  const active = goals.filter((g) => !g.achievedAt)
  const achieved = goals.filter((g) => g.achievedAt)

  return (
    <Screen>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-extrabold text-2xl">Goals 🏆</h1>
        <Button3D size="sm" onClick={() => setAddOpen(true)}>
          + New goal
        </Button3D>
      </div>

      {goals.length === 0 && (
        <EmptyState
          mood="happy"
          title="Dream a little!"
          message="Emergency fund? Holiday? New laptop? Give your savings a name and watch the ring fill up."
          action={<Button3D onClick={() => setAddOpen(true)}>Create my first goal</Button3D>}
        />
      )}

      <div className="flex flex-col gap-3">
        {active.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={() => setEditGoal(goal)}
            onContribute={() => setContributeTo(goal)}
          />
        ))}
      </div>

      {achieved.length > 0 && (
        <>
          <h2 className="font-display font-extrabold text-lg mt-6 mb-2">Achieved 🎉</h2>
          <div className="flex flex-col gap-3">
            {achieved.map((goal) => (
              <GoalCard key={goal.id} goal={goal} achieved onEdit={() => setEditGoal(goal)} />
            ))}
          </div>
        </>
      )}

      <AddGoalSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <EditGoalSheet goal={editGoal} onClose={() => setEditGoal(null)} />
      <ContributeSheet goal={contributeTo} onClose={() => setContributeTo(null)} />
    </Screen>
  )
}

function GoalCard({
  goal,
  achieved = false,
  onEdit,
  onContribute,
}: {
  goal: Goal
  achieved?: boolean
  onEdit?: () => void
  onContribute?: () => void
}) {
  const pct = goal.targetCents > 0 ? goal.savedCents / goal.targetCents : 0
  return (
    <Card glow={achieved ? 'gold' : 'none'} className="flex items-center gap-4">
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-4 flex-1 min-w-0 text-left active:scale-[0.99] transition-transform"
      >
        <ProgressRing pct={pct} size={84} stroke={10} colors={[goal.color, `${goal.color}99`]}>
          <span className="text-2xl">{goal.icon}</span>
          <span className="font-display font-extrabold text-[10px] text-ink-soft">
            {Math.min(100, Math.round(pct * 100))}%
          </span>
        </ProgressRing>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-extrabold truncate">{goal.name}</h3>
          <p className="text-xs text-ink-soft">
            <b style={{ color: goal.color }}>{formatRands(goal.savedCents)}</b> of{' '}
            {formatRands(goal.targetCents)}
          </p>
          {goal.autoAllocateCents > 0 && !achieved && (
            <p className="text-[10px] text-ink-faint font-bold mt-0.5">
              ⚙️ Auto: {formatRands(goal.autoAllocateCents)}/cycle
            </p>
          )}
          {/* milestone pips */}
          <div className="flex gap-1 mt-1.5">
            {[25, 50, 75, 100].map((m) => (
              <span
                key={m}
                className={`h-1.5 flex-1 rounded-full ${
                  pct * 100 >= m ? '' : 'bg-edge'
                }`}
                style={pct * 100 >= m ? { background: goal.color } : undefined}
              />
            ))}
          </div>
        </div>
      </button>
      {!achieved && onContribute && (
        <Button3D size="sm" variant="aqua" onClick={onContribute}>
          Add
        </Button3D>
      )}
      {achieved && <span className="text-2xl">👑</span>}
    </Card>
  )
}

function AddGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addGoal = useAppStore((s) => s.addGoal)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(GOAL_ICONS[0])
  const [color, setColor] = useState(GOAL_COLORS[0])
  const [target, setTarget] = useState('')
  const [auto, setAuto] = useState('')

  async function save() {
    const targetCents = randsToCents(target)
    if (!name.trim() || targetCents <= 0) return
    await addGoal({
      name,
      icon,
      color,
      targetCents,
      autoAllocateCents: Math.max(0, randsToCents(auto)),
    })
    setName('')
    setTarget('')
    setAuto('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="New goal">
      <div className="flex flex-col gap-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Goal name (Emergency Fund…)"
          className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-semibold placeholder:text-ink-faint focus:border-accent"
          maxLength={30}
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-2">Icon</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`w-11 h-11 rounded-2xl text-xl border-2 ${
                  icon === i ? 'border-accent bg-accent/15' : 'border-edge bg-bg-deep'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-2">Colour</p>
          <div className="flex gap-2">
            {GOAL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`colour ${c}`}
                className={`w-9 h-9 rounded-full border-4 ${
                  color === c ? 'border-ink' : 'border-transparent'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Target (R)
          </p>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            placeholder="30 000"
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-display font-extrabold text-lg focus:border-accent"
          />
        </label>
        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Auto-save from Savings each cycle (R, optional)
          </p>
          <input
            value={auto}
            onChange={(e) => setAuto(e.target.value)}
            inputMode="decimal"
            placeholder="1 500"
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-display font-extrabold text-lg focus:border-accent"
          />
        </label>
        <Button3D full size="lg" onClick={() => void save()}>
          Create goal
        </Button3D>
      </div>
    </Sheet>
  )
}

function EditGoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const updateGoal = useAppStore((s) => s.updateGoal)
  const deleteGoal = useAppStore((s) => s.deleteGoal)

  const [name, setName] = useState('')
  const [icon, setIcon] = useState(GOAL_ICONS[0])
  const [color, setColor] = useState(GOAL_COLORS[0])
  const [target, setTarget] = useState('')
  const [auto, setAuto] = useState('')

  const [lastId, setLastId] = useState<string | null>(null)
  if (goal && goal.id !== lastId) {
    setLastId(goal.id)
    setName(goal.name)
    setIcon(goal.icon)
    setColor(goal.color)
    setTarget(String(Math.round(goal.targetCents / 100)))
    setAuto(goal.autoAllocateCents > 0 ? String(Math.round(goal.autoAllocateCents / 100)) : '')
  }
  if (!goal && lastId !== null) {
    setLastId(null)
  }

  async function save() {
    if (!goal) return
    const targetCents = randsToCents(target)
    if (!name.trim() || targetCents <= 0) return
    await updateGoal(goal.id, {
      name: name.trim(),
      icon,
      color,
      targetCents,
      autoAllocateCents: Math.max(0, randsToCents(auto)),
    })
    onClose()
  }

  return (
    <Sheet open={goal !== null} onClose={onClose} title={goal ? `Edit ${goal.icon} ${goal.name}` : ''}>
      <div className="flex flex-col gap-4 pb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Goal name (Emergency Fund…)"
          className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-semibold placeholder:text-ink-faint focus:border-accent"
          maxLength={30}
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-2">Icon</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`w-11 h-11 rounded-2xl text-xl border-2 ${
                  icon === i ? 'border-accent bg-accent/15' : 'border-edge bg-bg-deep'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-2">Colour</p>
          <div className="flex gap-2">
            {GOAL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`colour ${c}`}
                className={`w-9 h-9 rounded-full border-4 ${
                  color === c ? 'border-ink' : 'border-transparent'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Target (R)
          </p>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            placeholder="30 000"
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-display font-extrabold text-lg focus:border-accent"
          />
        </label>
        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Auto-save from Savings each cycle (R, optional)
          </p>
          <input
            value={auto}
            onChange={(e) => setAuto(e.target.value)}
            inputMode="decimal"
            placeholder="1 500"
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-display font-extrabold text-lg focus:border-accent"
          />
        </label>
        {goal && goal.savedCents > 0 && (
          <p className="text-xs text-ink-faint">
            Already saved: <b style={{ color: goal.color }}>{formatRands(goal.savedCents)}</b>
          </p>
        )}
        <Button3D
          full
          size="lg"
          disabled={!name.trim() || randsToCents(target) <= 0}
          onClick={() => void save()}
        >
          Save changes
        </Button3D>
        <Button3D
          full
          variant="ghost"
          onClick={() => {
            if (!goal) return
            void deleteGoal(goal.id)
            onClose()
          }}
        >
          🗑️ Delete goal
        </Button3D>
      </div>
    </Sheet>
  )
}

function ContributeSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const contributeToGoal = useAppStore((s) => s.contributeToGoal)
  const amount = useAmountEntry()

  async function save(cents: number) {
    if (!goal || cents <= 0) return
    await contributeToGoal(goal.id, cents)
    amount.clear()
    onClose()
  }

  return (
    <Sheet open={goal !== null} onClose={onClose} title={goal ? `Add to ${goal.icon} ${goal.name}` : ''}>
      <div className="flex flex-col gap-4">
        <div className="text-center font-display font-extrabold text-4xl text-gradient-win py-2">
          {amount.display}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[10000, 25000, 50000, 100000].map((cents) => (
            <button
              key={cents}
              onClick={() => void save(cents)}
              className="py-2 rounded-2xl bg-aqua/10 border border-aqua/40 text-aqua
                         font-display font-extrabold text-sm active:scale-95 transition-transform"
            >
              {formatZAR(cents, { showCents: false })}
            </button>
          ))}
        </div>
        <NumberPad onDigit={amount.digit} onBackspace={amount.backspace} onDecimal={amount.decimal} />
        <Button3D
          full
          size="lg"
          variant="aqua"
          disabled={amount.amountCents <= 0}
          onClick={() => void save(amount.amountCents)}
        >
          💰 Contribute
        </Button3D>
      </div>
    </Sheet>
  )
}
