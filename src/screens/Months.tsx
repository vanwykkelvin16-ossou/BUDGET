/**
 * Month tracker: review every budget cycle — money in/out/saved, boss
 * result, top categories, and your own mood + note for the month.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { buildSnapshot, monthSummary } from '../lib/engine/insights'
import { cycleFor } from '../lib/engine/cycle'
import { addDays, formatDateLong, formatMonthLabel, todaySAST } from '../lib/dates'
import { formatRands } from '../lib/money'
import type { MonthlySnapshot } from '../lib/data/types'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Sheet } from '../components/ui/Sheet'
import { SectionTitle } from '../components/ui/SectionTitle'
import { EmptyState } from '../components/ui/EmptyState'

const MOODS: { value: 1 | 2 | 3 | 4; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Rough' },
  { value: 2, emoji: '😐', label: 'Meh' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '🤩', label: 'Legendary' },
]

interface MonthEntry {
  snapshot: MonthlySnapshot
  isLive: boolean
}

export function Months() {
  const data = useAppStore((s) => s.data)
  const [selected, setSelected] = useState<MonthEntry | null>(null)

  const entries = useMemo<MonthEntry[]>(() => {
    const profile = data.profile
    if (!profile) return []
    const today = todaySAST()
    const cycle = cycleFor(today, profile.payDate)

    // Live snapshot for the running cycle, stored snapshots for the past.
    const live = buildSnapshot(data, cycle, profile.splits)
    const past = data.snapshots
      .filter((s) => s.cycleStart !== cycle.start)
      .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))

    return [{ snapshot: live, isLive: true }, ...past.map((snapshot) => ({ snapshot, isLive: false }))]
  }, [data])

  const reviewByCycle = useMemo(
    () => new Map(data.reviews.map((r) => [r.cycleStart, r])),
    [data.reviews],
  )

  if (!data.profile) return null

  return (
    <Screen>
      <div className="flex items-center gap-3 mb-1">
        <Link
          to="/insights"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     flex items-center justify-center font-display font-extrabold"
          aria-label="Back to insights"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">Month tracker</h1>
      </div>
      <p className="text-xs text-ink-faint font-bold mb-4 ml-13 pl-0.5">
        Every cycle, reviewed. Tap one to dig in.
      </p>

      {entries.length === 1 && entries[0].snapshot.incomeCents === 0 ? (
        <EmptyState
          mood="sleeping"
          title="No months yet"
          message="Once money starts moving, each cycle shows up here with its own report card."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const s = entry.snapshot
            const review = reviewByCycle.get(s.cycleStart)
            const spent = s.spentByBucket.need + s.spentByBucket.want
            return (
              <button key={s.cycleStart} onClick={() => setSelected(entry)} className="text-left">
                <Card
                  glow={entry.isLive ? 'violet' : 'none'}
                  className="flex flex-col gap-2.5"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-extrabold flex-1">
                      {formatMonthLabel(s.cycleStart)}
                    </h3>
                    {entry.isLive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-lime/15 text-lime font-bold uppercase tracking-wider border border-lime/40">
                        ● live
                      </span>
                    )}
                    {s.bossDefeated && <span title="Boss defeated">🐲✓</span>}
                    {s.swept && <span title="Leftovers swept to savings">🧹</span>}
                    {review && <span title={`Your rating: ${MOODS[review.mood - 1].label}`}>{MOODS[review.mood - 1].emoji}</span>}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniAmount label="in" cents={s.incomeCents} tone="text-lime" />
                    <MiniAmount label="out" cents={spent} tone="text-coral" />
                    <MiniAmount label="saved" cents={s.savedCents} tone="text-aqua" />
                  </div>

                  {/* bucket usage bar */}
                  <BucketBar snapshot={s} />
                </Card>
              </button>
            )
          })}
        </div>
      )}

      <MonthDetailSheet entry={selected} onClose={() => setSelected(null)} />
    </Screen>
  )
}

function MiniAmount({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className="rounded-xl bg-bg-deep/60 border border-edge py-1.5">
      <p className={`font-display font-extrabold text-sm ${tone}`}>{formatRands(cents)}</p>
      <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-ink-faint">{label}</p>
    </div>
  )
}

/** Slim stacked bar showing where the cycle's income went. */
function BucketBar({ snapshot }: { snapshot: MonthlySnapshot }) {
  const total = Math.max(
    snapshot.incomeCents,
    snapshot.spentByBucket.need + snapshot.spentByBucket.want + snapshot.savedCents,
    1,
  )
  const seg = (cents: number) => `${Math.max(0, (cents / total) * 100)}%`
  return (
    <div className="h-2 rounded-full bg-bg-deep border border-edge overflow-hidden flex">
      <div className="h-full bg-gradient-to-r from-violet-soft to-violet" style={{ width: seg(snapshot.spentByBucket.need) }} />
      <div className="h-full bg-gradient-to-r from-[#ff8ba0] to-coral" style={{ width: seg(snapshot.spentByBucket.want) }} />
      <div className="h-full bg-gradient-to-r from-aqua to-[#67e8f9]" style={{ width: seg(snapshot.savedCents) }} />
    </div>
  )
}

function MonthDetailSheet({ entry, onClose }: { entry: MonthEntry | null; onClose: () => void }) {
  const data = useAppStore((s) => s.data)
  const saveMonthReview = useAppStore((s) => s.saveMonthReview)

  const existing = entry ? data.reviews.find((r) => r.cycleStart === entry.snapshot.cycleStart) : undefined
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Reset draft state whenever a different month opens.
  const [lastKey, setLastKey] = useState<string | null>(null)
  if (entry && entry.snapshot.cycleStart !== lastKey) {
    setLastKey(entry.snapshot.cycleStart)
    setMood(existing?.mood ?? null)
    setNote(existing?.note ?? null)
    setSaved(false)
  }

  if (!entry) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const s = entry.snapshot
  const summary = monthSummary(s, data.categories)
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const topCats = Object.entries(s.spentByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topMax = topCats[0]?.[1] ?? 1

  async function save() {
    if (!mood) return
    await saveMonthReview(s.cycleStart, mood, note ?? '')
    setSaved(true)
  }

  return (
    <Sheet open onClose={onClose} title={formatMonthLabel(s.cycleStart)}>
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-xs text-ink-faint font-bold -mt-3">
          {formatDateLong(s.cycleStart)} → {formatDateLong(addDays(s.cycleEnd, -1))}
          {entry.isLive && ' · still running'}
        </p>

        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Money in" value={formatRands(s.incomeCents)} tone="text-lime" />
          <StatTile
            label="Money out"
            value={formatRands(s.spentByBucket.need + s.spentByBucket.want)}
            tone="text-coral"
          />
          <StatTile
            label={`Saved${s.incomeCents > 0 ? ` · ${Math.round((s.savedCents / s.incomeCents) * 100)}%` : ''}`}
            value={formatRands(s.savedCents)}
            tone="text-aqua"
          />
        </div>

        <div className="flex gap-2">
          <span
            className={`flex-1 text-center text-xs font-display font-extrabold px-2 py-2 rounded-xl border ${
              s.bossDefeated
                ? 'bg-gold/10 border-gold/40 text-gold'
                : 'bg-bg-deep border-edge text-ink-faint'
            }`}
          >
            🐲 {s.bossDefeated ? 'Boss defeated!' : entry.isLive ? 'Boss battle running…' : 'Boss survived'}
          </span>
          <span
            className={`flex-1 text-center text-xs font-display font-extrabold px-2 py-2 rounded-xl border ${
              s.swept
                ? 'bg-aqua/10 border-aqua/40 text-aqua'
                : 'bg-bg-deep border-edge text-ink-faint'
            }`}
          >
            🧹 {s.swept ? `Swept ${formatRands(s.sweptCents)}` : 'No sweep'}
          </span>
        </div>

        {topCats.length > 0 && (
          <div>
            <SectionTitle>Top categories</SectionTitle>
            <div className="flex flex-col gap-1.5 mt-2">
              {topCats.map(([catId, cents]) => {
                const cat = catById.get(catId)
                return (
                  <div key={catId} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-center">{cat?.icon ?? '📦'}</span>
                    <span className="font-bold flex-1 truncate">{cat?.name ?? 'Other'}</span>
                    <div className="w-24 h-1.5 rounded-full bg-bg-deep overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(cents / topMax) * 100}%`, background: cat?.color ?? '#A8A29E' }}
                      />
                    </div>
                    <span className="font-display font-extrabold text-xs w-16 text-right">
                      {formatRands(cents)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="text-xs font-bold flex flex-col gap-1">
          <p className="text-lime">✅ {summary.bestHabit}</p>
          <p className="text-ember">👀 {summary.worstHabit}</p>
        </div>

        {/* Your review */}
        <div>
          <SectionTitle>How did this month feel?</SectionTitle>
          <div className="flex gap-2 mt-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setMood(m.value)
                  setSaved(false)
                }}
                className={`flex-1 py-2.5 rounded-2xl text-2xl border-2 transition-all ${
                  mood === m.value
                    ? 'border-accent bg-accent/15 scale-105'
                    : 'border-edge bg-bg-deep grayscale opacity-70'
                }`}
                title={m.label}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <textarea
            value={note ?? ''}
            onChange={(e) => {
              setNote(e.target.value)
              setSaved(false)
            }}
            placeholder="A note to future you… what worked, what stung?"
            rows={2}
            maxLength={280}
            className="w-full mt-2 px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       text-sm font-semibold placeholder:text-ink-faint focus:border-accent resize-none"
          />
          <Button3D
            full
            size="sm"
            variant={saved ? 'lime' : 'primary'}
            className="mt-2"
            disabled={!mood}
            onClick={() => void save()}
          >
            {saved ? 'Saved ✓' : existing ? 'Update review' : 'Save review'}
          </Button3D>
        </div>
      </div>
    </Sheet>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-bg-deep/60 border border-edge py-2.5 text-center">
      <p className={`font-display font-extrabold text-sm ${tone}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-ink-faint mt-0.5">{label}</p>
    </div>
  )
}
