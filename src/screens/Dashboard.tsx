/**
 * Dashboard — home screen. Safe-to-Spend hero, bucket rings, Fun Fund,
 * month totals and the recent transaction feed.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import {
  alreadyMarkedNoSpend,
  computeCycleInfo,
  noExpensesToday,
  pendingSweepOffer,
} from '../state/selectors'
import { displayStreak } from '../lib/gamification/streaks'
import { formatRands, formatZAR } from '../lib/money'
import { formatDateLong, formatDayLabel, formatWeekdayLong, todaySAST } from '../lib/dates'
import { daysElapsed, daysInCycle } from '../lib/engine/cycle'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { CountUp } from '../components/ui/CountUp'
import { ProgressRing } from '../components/ui/ProgressRing'
import { XPBar } from '../components/ui/XPBar'
import { StreakFlame } from '../components/ui/StreakFlame'
import { CategoryBadge } from '../components/ui/CategoryBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { Sheet } from '../components/ui/Sheet'
import { SectionTitle } from '../components/ui/SectionTitle'
import { EditEntrySheet, type LedgerEntry } from '../components/EditEntrySheet'
import type { Bucket } from '../lib/data/types'

const BUCKET_RING: Record<Bucket, { label: string; colors: [string, string] }> = {
  need: { label: 'Needs', colors: ['#A78BFA', '#7C3AED'] },
  want: { label: 'Wants', colors: ['#FF8BA0', '#FF5C7A'] },
  saving: { label: 'Savings', colors: ['#67E8F9', '#22D3EE'] },
}

const RECENT_FEED_INITIAL = 5
const RECENT_FEED_STEP = 5

export function Dashboard() {
  const data = useAppStore((s) => s.data)
  const markNoSpendDay = useAppStore((s) => s.markNoSpendDay)
  const sweepToGoal = useAppStore((s) => s.sweepToGoal)
  const [sweepOpen, setSweepOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [recentVisible, setRecentVisible] = useState(RECENT_FEED_INITIAL)

  const today = todaySAST()
  const info = useMemo(() => computeCycleInfo(data, today), [data, today])
  const sweep = useMemo(() => pendingSweepOffer(data, today), [data, today])
  const profile = data.profile
  if (!profile || !info) return null

  const streak = displayStreak(profile, today)
  const canMarkNoSpend = noExpensesToday(data, today) && !alreadyMarkedNoSpend(data, today)

  const sts = info.sts
  const heroClass =
    sts.status === 'winning'
      ? 'text-gradient-win animate-pulse-win'
      : sts.status === 'close'
        ? 'text-gradient-gold animate-shake-warn'
        : 'text-coral animate-shake-warn'

  const feed = useMemo(
    () =>
      [
        ...data.transactions.map((t) => ({ type: 'expense' as const, item: t })),
        ...data.incomes.map((i) => ({ type: 'income' as const, item: i })),
      ].sort((a, b) =>
        (b.item.date + b.item.createdAt).localeCompare(a.item.date + a.item.createdAt),
      ),
    [data.transactions, data.incomes],
  )
  const visibleFeed = feed.slice(0, recentVisible)
  const hasMoreRecent = recentVisible < feed.length

  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const sortedGoals = [...data.goals].filter((g) => !g.achievedAt)

  return (
    <Screen>
      <header className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-xl truncate">
              Hi {profile.displayName.split(' ')[0]} 👋
              {profile.isDemo && (
                <span className="ml-2 text-[10px] align-middle px-2 py-0.5 rounded-full bg-aqua/20 text-aqua font-bold uppercase tracking-wider">
                  demo
                </span>
              )}
            </h1>
            <p className="text-[11px] text-ink-faint font-bold">
              {formatWeekdayLong(today)} {formatDateLong(today)} · cycle day{' '}
              {daysElapsed(today, info.cycle) + 1} of {daysInCycle(info.cycle)}
            </p>
          </div>
          <StreakFlame
            count={streak.count}
            aliveToday={streak.aliveToday}
            atRisk={streak.atRisk}
            freezes={profile.streakFreezes}
          />
        </div>
        <XPBar />
      </header>

      {/* Sweep prompt for last cycle's leftovers */}
      {sweep && (
        <Card glow="aqua" className="mb-4 flex items-center gap-3">
          <span className="text-3xl">🧹</span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-sm">
              {formatRands(sweep.amountCents)} of Wants survived last month!
            </p>
            <p className="text-xs text-ink-soft">Sweep it into a savings goal?</p>
          </div>
          <Button3D size="sm" variant="aqua" onClick={() => setSweepOpen(true)}>
            Sweep
          </Button3D>
        </Card>
      )}

      {/* Hero: Safe-to-Spend — Randy perched on the gradient rim */}
      <div className="relative mb-4">
        <div className="flex justify-center relative z-10 pointer-events-none">
          <img
            src="/randy-logo.png"
            alt="Randy"
            width={116}
            height={116}
            className="w-[7.25rem] h-[7.25rem] object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
            draggable={false}
          />
        </div>
        <div className="relative rounded-[26px] p-[2px] overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-[-150%] animate-[gb-spin_9s_linear_infinite]"
            style={{
              background:
                'conic-gradient(from 0deg, #7c3aed, #22d3ee, #a3e635, #fb923c, #ff5c7a, #7c3aed)',
              opacity: sts.status === 'winning' ? 0.9 : 0.45,
            }}
          />
          <Card
            glow={sts.status === 'winning' ? 'lime' : 'none'}
            className="text-center py-6 relative overflow-hidden !border-transparent"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">
              Safe to spend today
            </p>
            <div className={`font-display font-extrabold text-[56px] leading-tight ${heroClass}`}>
              <CountUp value={sts.dailyCents} format={(v) => formatZAR(v)} />
            </div>
            <p className="text-sm text-ink-soft font-semibold">
              {sts.status === 'over' ? (
                <>Wants budget is done for this cycle — breathe, then recover 💪</>
              ) : (
                <>
                  {formatRands(sts.weekCents)} this week ·{' '}
                  {formatRands(Math.max(0, sts.remainingCents))} left · {info.daysRemaining} day
                  {info.daysRemaining === 1 ? '' : 's'} to payday
                </>
              )}
            </p>
            {canMarkNoSpend && (
              <button
                onClick={() => void markNoSpendDay()}
                className="mt-3 px-4 py-1.5 rounded-full text-xs font-display font-extrabold
                           bg-lime/15 text-lime border border-lime/40 active:scale-95 transition-transform"
              >
                🙅 No-spend day so far — bank +75 XP
              </button>
            )}
          </Card>
        </div>
      </div>

      {/* Bucket rings */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {(Object.keys(BUCKET_RING) as Bucket[]).map((bucket) => {
          const allocated = info.allocated[bucket]
          const used = bucket === 'saving' ? info.savedCents : info.spent[bucket]
          const pct = allocated > 0 ? used / allocated : 0
          return (
            <Card key={bucket} className="flex flex-col items-center py-3 px-1">
              <ProgressRing
                pct={pct}
                size={76}
                stroke={9}
                colors={BUCKET_RING[bucket].colors}
                overColor={bucket === 'saving' ? undefined : '#FF5C7A'}
              >
                <span className="font-display font-extrabold text-sm">
                  {Math.round(pct * 100)}%
                </span>
              </ProgressRing>
              <p className="font-display font-extrabold text-xs mt-2">{BUCKET_RING[bucket].label}</p>
              <p className="text-[10px] text-ink-faint font-bold text-center leading-tight">
                {formatRands(used)}
                <br />
                of {formatRands(allocated)}
              </p>
            </Card>
          )
        })}
      </div>

      {/* Fun fund — first-class citizen */}
      <Card glow="ember" className="flex items-center gap-4 mb-4">
        <ProgressRing
          pct={info.funFund.budgetCents > 0 ? info.funFund.spentCents / info.funFund.budgetCents : 0}
          size={72}
          stroke={9}
          colors={['#FF8BA0', '#FF5C7A']}
          overColor="#E11D48"
        >
          <span className="text-xl">❤️</span>
        </ProgressRing>
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold">
            <span className="text-gradient-gold">{formatRands(info.funFund.remainingCents)}</span>{' '}
            left for {profile.funFundName}
          </p>
          <p className="text-xs text-ink-soft">
            {profile.funFundNote} · {formatRands(info.funFund.spentCents)} of{' '}
            {formatRands(info.funFund.budgetCents)} used this cycle
          </p>
        </div>
      </Card>

      {/* This month */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStat label="Income in" cents={info.incomeCents} tone="text-lime" />
        <MiniStat label="Money out" cents={info.moneyOutCents} tone="text-coral" />
        <MiniStat label="Projected savings" cents={info.projectedSavingsCents} tone="text-aqua" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link to="/months">
          <Card className="text-center py-2.5 px-1">
            <span className="font-display font-extrabold text-xs">📆 Months</span>
          </Card>
        </Link>
        <Link to="/wealth">
          <Card className="text-center py-2.5 px-1">
            <span className="font-display font-extrabold text-xs">💎 Wealth</span>
          </Card>
        </Link>
      </div>

      {/* Feed */}
      <div className="mb-2">
        <SectionTitle>Recent</SectionTitle>
      </div>
      {feed.length === 0 ? (
        <EmptyState
          mood="happy"
          title="Nothing logged yet"
          message="Tap the big + button and log your first expense — it takes 5 seconds, promise."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visibleFeed.map((entry) => (
            <button
              key={entry.item.id}
              onClick={() => setEditing(entry)}
              className="text-left active:scale-[0.99] transition-transform"
              aria-label={`Edit ${entry.type}`}
            >
              {entry.type === 'expense' ? (
                <Card className="flex items-center gap-3 py-2.5">
                  <CategoryBadge
                    category={catById.get(entry.item.categoryId) ?? { icon: '📦', color: '#A8A29E', name: 'Other' }}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {entry.item.note || catById.get(entry.item.categoryId)?.name || 'Expense'}
                    </p>
                    <p className="text-xs text-ink-faint">{formatDayLabel(entry.item.date, today)}</p>
                  </div>
                  <span className="font-display font-extrabold text-coral">
                    −{formatZAR(entry.item.amountCents)}
                  </span>
                </Card>
              ) : (
                <Card className="flex items-center gap-3 py-2.5">
                  <span
                    className="inline-flex items-center justify-center rounded-full w-10 h-10 text-xl
                               bg-lime/15 border-2 border-lime/50"
                  >
                    💰
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {entry.item.note || entry.item.source}
                    </p>
                    <p className="text-xs text-ink-faint">{formatDayLabel(entry.item.date, today)}</p>
                  </div>
                  <span className="font-display font-extrabold text-lime">
                    +{formatZAR(entry.item.amountCents)}
                  </span>
                </Card>
              )}
            </button>
          ))}
          {hasMoreRecent && (
            <Button3D
              variant="ghost"
              size="sm"
              full
              onClick={() => setRecentVisible((n) => Math.min(n + RECENT_FEED_STEP, feed.length))}
            >
              Load more
            </Button3D>
          )}
        </div>
      )}

      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />

      {/* Sweep sheet */}
      <Sheet open={sweepOpen} onClose={() => setSweepOpen(false)} title="Sweep leftovers into…">
        {sweep && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              <b className="text-aqua">{formatRands(sweep.amountCents)}</b> of unspent Wants from last
              cycle. Pick a goal:
            </p>
            {sortedGoals.length === 0 && (
              <p className="text-sm text-ink-faint">
                No goals yet — create one on the Goals tab first! 🏆
              </p>
            )}
            {sortedGoals.map((goal) => (
              <Button3D
                key={goal.id}
                variant="ghost"
                full
                onClick={() => {
                  void sweepToGoal(goal.id)
                  setSweepOpen(false)
                }}
              >
                {goal.icon} {goal.name}
              </Button3D>
            ))}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}

function MiniStat({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <Card className="py-3 px-2 text-center">
      <p className={`font-display font-extrabold text-sm ${tone}`}>
        <CountUp value={cents} format={(v) => formatRands(v)} duration={0.7} />
      </p>
      <p className="text-[10px] text-ink-faint font-bold mt-0.5 leading-tight">{label}</p>
    </Card>
  )
}
