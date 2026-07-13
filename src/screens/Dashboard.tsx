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
import {
  addDays,
  formatDateLong,
  formatDayLabel,
  formatWeekdayLong,
  parseISO,
  todaySAST,
  weekBounds,
} from '../lib/dates'
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
import type { Bucket, GoalContribution } from '../lib/data/types'

const BUCKET_RING: Record<Bucket, { label: string; colors: [string, string] }> = {
  need: { label: 'Must-haves', colors: ['#A78BFA', '#7C3AED'] },
  want: { label: 'Fun stuff', colors: ['#FF8BA0', '#FF5C7A'] },
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
        ...data.contributions.map((c) => ({ type: 'contribution' as const, item: c })),
      ].sort((a, b) =>
        (b.item.date + b.item.createdAt).localeCompare(a.item.date + a.item.createdAt),
      ),
    [data.transactions, data.incomes, data.contributions],
  )
  const visibleFeed = feed.slice(0, recentVisible)
  const hasMoreRecent = recentVisible < feed.length

  // Group the visible feed into week sections ("This week", "Last week",
  // then "9–15 June"). Entries arrive date-sorted, so weeks stay contiguous.
  const weekSections = useMemo(() => {
    const thisWeekStart = weekBounds(today).start
    const sections: { start: string; label: string; entries: typeof visibleFeed }[] = []
    for (const entry of visibleFeed) {
      const start = weekBounds(entry.item.date).start
      let section = sections[sections.length - 1]
      if (!section || section.start !== start) {
        const label =
          start === thisWeekStart
            ? 'This week'
            : start === addDays(thisWeekStart, -7)
              ? 'Last week'
              : weekRangeLabel(start)
        section = { start, label, entries: [] }
        sections.push(section)
      }
      section.entries.push(entry)
    }
    return sections
  }, [feed, recentVisible, today])

  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const goalById = new Map(data.goals.map((g) => [g.id, g]))
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
              {formatWeekdayLong(today)} {formatDateLong(today)} · Day{' '}
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
              You had {formatRands(sweep.amountCents)} fun money left last month!
            </p>
            <p className="text-xs text-ink-soft">Put it in a savings goal?</p>
          </div>
          <Button3D size="sm" variant="aqua" onClick={() => setSweepOpen(true)}>
            Save it
          </Button3D>
        </Card>
      )}

      {/* Hero: fun money for today */}
      <div className="relative rounded-[26px] p-[2px] overflow-hidden mb-4">
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
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-ink-faint">
            Fun money for today
          </p>
          <p className="text-[11px] text-ink-soft font-semibold mt-0.5 mb-1">
            For treats &amp; fun — not rent or bills
          </p>
          <div className={`font-display font-extrabold text-[56px] leading-tight ${heroClass}`}>
            <CountUp value={sts.dailyCents} format={(v) => formatZAR(v)} />
          </div>
          <div className="text-sm text-ink-soft font-semibold mt-1">
            {sts.status === 'over' ? (
              sts.cappedByCash ? (
                info.leftOverCents < 0 ? (
                  <p>
                    <b className="text-coral">{formatRands(-info.leftOverCents)}</b> more went out
                    than came in this month. Fun money is paused until money comes in 💪
                  </p>
                ) : (
                  <p>All your money is used up for now. Fun money is paused until money comes in 💪</p>
                )
              ) : (
                <p>You used all your fun money this month. Spend less until pay day 💪</p>
              )
            ) : (
              <>
                <div className="flex items-stretch justify-center divide-x divide-edge mt-3">
                  <HeroStat value={formatRands(sts.weekCents)} label="to spend this week" />
                  <HeroStat
                    value={formatRands(Math.max(0, sts.effectiveRemainingCents))}
                    label="left till pay day"
                  />
                  <HeroStat
                    value={String(info.daysRemaining)}
                    label={info.daysRemaining === 1 ? 'day to pay day' : 'days to pay day'}
                  />
                </div>
                {sts.cappedByCash && (
                  <div className="mt-3 mx-1 flex items-start gap-2 text-left rounded-xl bg-ember/10 px-3 py-2.5">
                    <span className="text-sm leading-none mt-0.5" aria-hidden>
                      💡
                    </span>
                    <p className="text-[11px] font-bold text-ember leading-relaxed">
                      Your plan allows{' '}
                      <b className="text-ink">{formatRands(Math.max(0, sts.remainingCents))}</b>{' '}
                      for fun, but your pocket has{' '}
                      <b className="text-ink">
                        {formatRands(Math.max(0, sts.effectiveRemainingCents))}
                      </b>{' '}
                      right now — so we count what's real{'\u00A0'}👍
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {canMarkNoSpend && (
            <button
              onClick={() => void markNoSpendDay()}
              className="mt-3 px-4 py-1.5 rounded-full text-xs font-display font-extrabold
                         bg-lime/15 text-lime border border-lime/40 active:scale-95 transition-transform"
            >
              🙅 No spending today — +75 XP
            </button>
          )}
        </Card>
      </div>

      {/* Bucket rings */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {(Object.keys(BUCKET_RING) as Bucket[]).map((bucket) => {
          const allocated = info.allocated[bucket]
          const used = bucket === 'saving' ? info.savedCents : info.spent[bucket]
          const pct = allocated > 0 ? used / allocated : used > 0 ? 2 : 0
          const overCents = used - allocated
          // The ring fills to 100% max. One bold headline says what matters
          // ("R 30 000 left" / "R 22 500 over plan"), one faint line gives
          // the context ("R 0 of R 30 000") — no jargon, no 160%.
          const headline =
            bucket === 'saving'
              ? overCents > 0
                ? { text: `${formatRands(overCents)} past goal 🎉`, tone: 'text-aqua' }
                : overCents === 0 && allocated > 0
                  ? { text: 'Goal reached 🎉', tone: 'text-aqua' }
                  : { text: `${formatRands(-overCents)} to go`, tone: 'text-ink' }
              : overCents > 0
                ? { text: `${formatRands(overCents)} over plan`, tone: 'text-coral' }
                : { text: `${formatRands(-overCents)} left`, tone: 'text-ink' }
          return (
            <Card key={bucket} className="flex flex-col items-center py-3.5 px-1 text-center">
              <ProgressRing
                pct={pct}
                size={72}
                stroke={8}
                colors={BUCKET_RING[bucket].colors}
                overColor={bucket === 'saving' ? undefined : '#FF5C7A'}
              >
                <span className="font-display font-extrabold text-sm">
                  {Math.min(100, Math.round(pct * 100))}%
                </span>
              </ProgressRing>
              <p className="font-display font-extrabold text-xs mt-2">
                {BUCKET_RING[bucket].label}
              </p>
              <p className={`text-[11px] font-display font-extrabold leading-tight mt-1 ${headline.tone}`}>
                {headline.text}
              </p>
              <p className="text-[10px] text-ink-faint font-bold leading-tight mt-0.5">
                {formatRands(used)} of {formatRands(allocated)}
              </p>
            </Card>
          )
        })}
      </div>

      {/* Fun fund — first-class citizen */}
      <Card className="flex items-center gap-4 mb-4">
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
          <p className="text-xs text-ink-faint font-bold">
            Spent {formatRands(info.funFund.spentCents)} of {formatRands(info.funFund.budgetCents)}{' '}
            this month
          </p>
        </div>
      </Card>

      {/* This month: in − spent − saved = left over, always. */}
      <div className="grid grid-cols-2 gap-3 mb-1.5">
        <MiniStat label="Money in" cents={info.incomeCents} tone="text-lime" />
        <MiniStat label="Money spent" cents={info.moneyOutCents} tone="text-coral" />
        <MiniStat label="Put in savings" cents={info.savedCents} tone="text-aqua" />
        <MiniStat
          label={info.leftOverCents >= 0 ? 'Left over' : 'Overspent'}
          cents={Math.abs(info.leftOverCents)}
          tone={info.leftOverCents >= 0 ? 'text-lime' : 'text-coral'}
        />
      </div>
      <p className="text-center text-[10px] text-ink-faint font-bold mb-4">
        Money in − spent − savings ={' '}
        {info.leftOverCents >= 0 ? 'left over' : (
          <span className="text-coral">{formatRands(-info.leftOverCents)} overspent</span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link
          to="/months"
          className="block text-center py-2.5 rounded-2xl border border-edge
                     font-display font-extrabold text-xs text-ink-soft
                     active:scale-[0.98] transition-transform"
        >
          📆 Past months
        </Link>
        <Link
          to="/wealth"
          className="block text-center py-2.5 rounded-2xl border border-edge
                     font-display font-extrabold text-xs text-ink-soft
                     active:scale-[0.98] transition-transform"
        >
          💎 All my money
        </Link>
      </div>

      {/* Feed */}
      <div className="mb-2">
        <SectionTitle>What you logged</SectionTitle>
      </div>
      {feed.length === 0 ? (
        <EmptyState
          mood="happy"
          title="Nothing here yet"
          message="Tap the + button to add money you spent or money you got."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {weekSections.map((section) => (
            <div key={section.start} className="flex flex-col gap-2">
              <p className="text-[11px] font-display font-extrabold text-ink-faint uppercase tracking-wider mt-1">
                {section.label}
              </p>
              {section.entries.map((entry) => (
            <button
              key={entry.item.id}
              onClick={() => setEditing(entry)}
              className="text-left active:scale-[0.99] transition-transform"
              aria-label={
                entry.type === 'contribution'
                  ? `Edit savings to ${goalById.get(entry.item.goalId)?.name ?? 'goal'}`
                  : `Edit ${entry.type}`
              }
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
              ) : entry.type === 'income' ? (
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
              ) : (
                <ContributionFeedRow
                  contribution={entry.item}
                  goal={goalById.get(entry.item.goalId)}
                  today={today}
                />
              )}
            </button>
              ))}
            </div>
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
      <Sheet open={sweepOpen} onClose={() => setSweepOpen(false)} title="Save leftover fun money">
        {sweep && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              You had <b className="text-aqua">{formatRands(sweep.amountCents)}</b> fun money left
              last month. Pick a goal to save it in:
            </p>
            {sortedGoals.length === 0 && (
              <p className="text-sm text-ink-faint">
                Make a savings goal first on the Savings tab 🏆
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

/** "9–15 June" (or "29 June – 5 July" across months) for a Monday week start. */
function weekRangeLabel(start: string): string {
  const end = addDays(start, 6)
  const s = parseISO(start)
  const e = parseISO(end)
  if (s.m === e.m) return `${s.d}–${e.d} ${formatDateLong(end).split(' ')[1]}`
  return `${formatDateLong(start)} – ${formatDateLong(end)}`
}

/** One small self-explaining number under the hero, e.g. "R 2 692 · to spend this week". */
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
      <span className="font-display font-extrabold text-[15px] text-ink leading-none">{value}</span>
      <span className="text-[9.5px] text-ink-faint font-bold leading-tight text-center">{label}</span>
    </div>
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

const CONTRIBUTION_LABEL: Record<GoalContribution['source'], string> = {
  manual: 'You saved',
  auto: 'Auto-save',
  sweep: 'Leftovers saved',
}

function ContributionFeedRow({
  contribution,
  goal,
  today,
}: {
  contribution: GoalContribution
  goal?: { icon: string; name: string; color: string }
  today: string
}) {
  return (
    <Card className="flex items-center gap-3 py-2.5">
      <span
        className="inline-flex items-center justify-center rounded-full w-10 h-10 text-xl
                   bg-aqua/15 border-2 border-aqua/50"
      >
        {goal?.icon ?? '🏆'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">
          {goal?.name ?? 'Savings goal'} · {CONTRIBUTION_LABEL[contribution.source]}
        </p>
        <p className="text-xs text-ink-faint">{formatDayLabel(contribution.date, today)}</p>
      </div>
      <span className="font-display font-extrabold text-aqua">
        +{formatZAR(contribution.amountCents)}
      </span>
    </Card>
  )
}
