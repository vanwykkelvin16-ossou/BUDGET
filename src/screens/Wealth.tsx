/**
 * Wealth 💎 — the zoomed-out view:
 *  · Annual view: the last 12 cycles as income/spend bars with totals
 *  · Net worth: assets − liabilities + goal savings, all editable
 *  · Crystal ball: "save R X for Y at Z% growth → you'll have R N"
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { buildSnapshot } from '../lib/engine/insights'
import { cycleFor } from '../lib/engine/cycle'
import { formatMonths, projectSavings } from '../lib/engine/projection'
import { formatMonthLabel, todaySAST } from '../lib/dates'
import { formatRands, formatZARCompact, randsToCents } from '../lib/money'
import type { Asset, MonthlySnapshot } from '../lib/data/types'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Sheet } from '../components/ui/Sheet'
import { SectionTitle } from '../components/ui/SectionTitle'
import { CountUp } from '../components/ui/CountUp'

const ASSET_ICONS = ['🏦', '💳', '🚗', '🏠', '📈', '💼', '🪙', '🎓', '🧾', '💍']

export function Wealth() {
  const data = useAppStore((s) => s.data)
  const [assetEdit, setAssetEdit] = useState<Asset | 'new' | null>(null)

  const today = todaySAST()

  const year = useMemo(() => {
    const profile = data.profile
    if (!profile) return null
    const cycle = cycleFor(today, profile.payDate)
    const live = buildSnapshot(data, cycle, profile.splits)
    const cycles: MonthlySnapshot[] = [
      ...data.snapshots.filter((s) => s.cycleStart !== cycle.start),
      live,
    ]
      .sort((a, b) => a.cycleStart.localeCompare(b.cycleStart))
      .slice(-12)

    const totalIn = cycles.reduce((s, c) => s + c.incomeCents, 0)
    const totalOut = cycles.reduce((s, c) => s + c.spentByBucket.need + c.spentByBucket.want, 0)
    const totalSaved = cycles.reduce((s, c) => s + c.savedCents, 0)
    const bossWins = cycles.filter((c) => c.bossDefeated).length
    const best = [...cycles].sort((a, b) => b.savedCents - a.savedCents)[0]

    return { cycles, totalIn, totalOut, totalSaved, bossWins, best, liveStart: cycle.start }
  }, [data, today])

  const netWorth = useMemo(() => {
    const goalCents = data.goals.reduce((s, g) => s + g.savedCents, 0)
    const assetCents = data.assets
      .filter((a) => a.kind === 'asset')
      .reduce((s, a) => s + a.amountCents, 0)
    const liabilityCents = data.assets
      .filter((a) => a.kind === 'liability')
      .reduce((s, a) => s + a.amountCents, 0)
    return { goalCents, assetCents, liabilityCents, totalCents: goalCents + assetCents - liabilityCents }
  }, [data.goals, data.assets])

  if (!data.profile || !year) return null

  const savingsRate = year.totalIn > 0 ? Math.round((year.totalSaved / year.totalIn) * 100) : 0

  return (
    <Screen>
      <div className="flex items-center gap-3 mb-4">
        <Link
          to="/"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     flex items-center justify-center font-display font-extrabold"
          aria-label="Back home"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">Wealth 💎</h1>
      </div>

      {/* ---------------- Annual view ---------------- */}
      <SectionTitle>Your year at a glance</SectionTitle>
      <Card className="mt-2 mb-3">
        <YearChart cycles={year.cycles} liveStart={year.liveStart} />
        <div className="grid grid-cols-3 gap-2 mt-3">
          <YearStat label="In" cents={year.totalIn} tone="text-lime" />
          <YearStat label="Out" cents={year.totalOut} tone="text-coral" />
          <YearStat label={`Saved · ${savingsRate}%`} cents={year.totalSaved} tone="text-aqua" />
        </div>
        <div className="flex justify-between mt-3 text-xs font-bold text-ink-soft">
          <span>🐲 {year.bossWins} boss{year.bossWins === 1 ? '' : 'es'} beaten</span>
          {year.best && year.best.savedCents > 0 && (
            <span>
              🏅 best month: {formatMonthLabel(year.best.cycleStart).split(' ')[0]} (
              {formatZARCompact(year.best.savedCents)})
            </span>
          )}
        </div>
      </Card>

      {/* ---------------- Net worth ---------------- */}
      <div className="mt-5">
        <SectionTitle
          action={
            <Button3D size="sm" variant="ghost" onClick={() => setAssetEdit('new')}>
              + Add
            </Button3D>
          }
        >
          Net worth
        </SectionTitle>
      </div>
      <Card glow="aqua" className="mt-2 mb-3 text-center py-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">
          What you're worth right now
        </p>
        <p
          className={`font-display font-extrabold text-4xl mt-1 ${
            netWorth.totalCents >= 0 ? 'text-gradient-win' : 'text-coral'
          }`}
        >
          <CountUp value={netWorth.totalCents} format={(v) => formatRands(v)} />
        </p>
      </Card>

      <div className="flex flex-col gap-2 mb-3">
        <Card className="flex items-center gap-3 py-2.5">
          <span className="text-xl w-8 text-center">🏆</span>
          <div className="flex-1">
            <p className="font-bold text-sm">Goal savings</p>
            <p className="text-[10px] text-ink-faint font-bold">
              Auto-counted from your {data.goals.length} goal{data.goals.length === 1 ? '' : 's'}
            </p>
          </div>
          <span className="font-display font-extrabold text-aqua">
            +{formatRands(netWorth.goalCents)}
          </span>
        </Card>
        {data.assets.map((asset) => (
          <button key={asset.id} onClick={() => setAssetEdit(asset)} className="text-left">
            <Card className="flex items-center gap-3 py-2.5">
              <span className="text-xl w-8 text-center">{asset.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{asset.name}</p>
                <p className="text-[10px] text-ink-faint font-bold uppercase">{asset.kind}</p>
              </div>
              <span
                className={`font-display font-extrabold ${
                  asset.kind === 'asset' ? 'text-lime' : 'text-coral'
                }`}
              >
                {asset.kind === 'asset' ? '+' : '−'}
                {formatRands(asset.amountCents)}
              </span>
            </Card>
          </button>
        ))}
        {data.assets.length === 0 && (
          <p className="text-xs text-ink-soft text-center py-1">
            Add your bank balance, car, or loans to complete the picture ✍️
          </p>
        )}
      </div>

      {/* ---------------- Crystal ball ---------------- */}
      <div className="mt-5">
        <SectionTitle>Crystal ball 🔮</SectionTitle>
      </div>
      <CrystalBall netWorthCents={netWorth.totalCents} />

      <AssetSheet edit={assetEdit} onClose={() => setAssetEdit(null)} />
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function YearStat({ label, cents, tone }: { label: string; cents: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-bg-deep/60 border border-edge py-2 text-center">
      <p className={`font-display font-extrabold text-sm ${tone}`}>{formatZARCompact(cents)}</p>
      <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-ink-faint mt-0.5">
        {label}
      </p>
    </div>
  )
}

/**
 * Paired income/spend bars per cycle with a saved-amount marker.
 * Adapts to sparse data: with a handful of months the bars widen and get
 * value labels; a full year packs tight with gridlines carrying the scale.
 */
function YearChart({ cycles, liveStart }: { cycles: MonthlySnapshot[]; liveStart: string }) {
  const w = 340
  const h = 150
  const padTop = 16
  const padBottom = 18
  // Right gutter reserved for the scale labels so bars never cover them.
  const padRight = 34
  const plotW = w - padRight
  const innerH = h - padTop - padBottom
  const baseline = h - padBottom

  const max = Math.max(
    ...cycles.map((c) =>
      Math.max(c.incomeCents, c.spentByBucket.need + c.spentByBucket.want, c.savedCents),
    ),
    1,
  )
  const slot = plotW / Math.max(cycles.length, 1)
  const bar = Math.max(7, Math.min(26, slot / 3.4))
  const few = cycles.length <= 6
  // Room for a "saved" text label only when the chart is very sparse.
  const labelSaved = cycles.length <= 2
  const y = (cents: number) => padTop + innerH * (1 - cents / max)

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* gridlines carry the scale */}
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={0}
              x2={plotW}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--color-edge)"
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.8}
            />
            <text
              x={w - 2}
              y={y(max * f) + 3}
              textAnchor="end"
              fontSize={8.5}
              fontWeight={700}
              fill="var(--color-ink-faint)"
            >
              {formatZARCompact(max * f)}
            </text>
          </g>
        ))}
        <line x1={0} x2={plotW} y1={baseline} y2={baseline} stroke="var(--color-edge)" strokeWidth={1.5} />

        {cycles.map((c, i) => {
          const cx = i * slot + slot / 2
          const out = c.spentByBucket.need + c.spentByBucket.want
          const isLive = c.cycleStart === liveStart
          const barH = (cents: number) => (cents > 0 ? Math.max(3, baseline - y(cents)) : 0)
          return (
            <g key={c.cycleStart} opacity={isLive || !few ? 1 : 0.95}>
              {/* income */}
              {c.incomeCents > 0 && (
                <rect
                  x={cx - bar - 2}
                  y={baseline - barH(c.incomeCents)}
                  width={bar}
                  height={barH(c.incomeCents)}
                  rx={Math.min(5, bar / 2.5)}
                  fill="#A3E635"
                />
              )}
              {/* spend */}
              {out > 0 && (
                <rect
                  x={cx + 2}
                  y={baseline - barH(out)}
                  width={bar}
                  height={barH(out)}
                  rx={Math.min(5, bar / 2.5)}
                  fill="#FF5C7A"
                />
              )}
              {/* value labels when there's room */}
              {few && c.incomeCents > 0 && (
                <text
                  x={cx - 2 - bar / 2}
                  y={Math.max(10, y(c.incomeCents) - 5)}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={800}
                  fill="#84cc16"
                >
                  {formatZARCompact(c.incomeCents)}
                </text>
              )}
              {few && out > 0 && (
                <text
                  x={cx + 2 + bar / 2}
                  y={Math.max(10, y(out) - 5)}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={800}
                  fill="#FF5C7A"
                >
                  {formatZARCompact(out)}
                </text>
              )}
              {/* saved marker */}
              {c.savedCents > 0 && (
                <g>
                  <circle cx={cx} cy={y(c.savedCents)} r={few ? 5 : 3.6} fill="#22D3EE" stroke="var(--color-card)" strokeWidth={2} />
                  {labelSaved && (
                    <text
                      x={cx + bar + 10}
                      y={y(c.savedCents) + 3}
                      fontSize={9}
                      fontWeight={800}
                      fill="#22D3EE"
                    >
                      {formatZARCompact(c.savedCents)} saved
                    </text>
                  )}
                </g>
              )}
              <text
                x={cx}
                y={h - 5}
                textAnchor="middle"
                fontSize={9}
                fontWeight={800}
                fill={isLive ? '#22D3EE' : 'var(--color-ink-faint)'}
              >
                {formatMonthLabel(c.cycleStart).slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>
      {/* legend */}
      <div className="flex justify-center gap-4 mt-1 text-[10px] font-bold text-ink-soft">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-lime inline-block" /> in
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-coral inline-block" /> out
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-aqua inline-block" /> saved
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CrystalBall({ netWorthCents }: { netWorthCents: number }) {
  const profile = useAppStore((s) => s.data.profile)!
  const defaultMonthly =
    Math.round(((profile.salaryCents * profile.splits.saving) / 100) / 25000) * 25000

  const [monthlyCents, setMonthlyCents] = useState(Math.max(25000, defaultMonthly))
  const [months, setMonths] = useState(24)
  const [ratePct, setRatePct] = useState(8)
  const [includeNetWorth, setIncludeNetWorth] = useState(false)

  const result = projectSavings({
    startCents: includeNetWorth ? netWorthCents : 0,
    monthlyCents,
    months,
    annualRatePct: ratePct,
  })

  return (
    <Card glow="gold" className="mt-2 flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        If I save{' '}
        <b className="text-lime">{formatRands(monthlyCents)}</b> a month for{' '}
        <b className="text-aqua">{formatMonths(months)}</b> at{' '}
        <b className="text-gold">{ratePct}%</b> growth…
      </p>

      <div className="text-center py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink-faint">
          I'll have
        </p>
        <p className="font-display font-extrabold text-4xl text-gradient-gold animate-shimmer">
          <CountUp value={result.futureValueCents} format={(v) => formatRands(v)} duration={0.6} />
        </p>
        <p className="text-xs text-ink-soft font-bold mt-1">
          {formatRands(result.contributedCents)} saved
          {result.growthCents > 0 && (
            <>
              {' '}
              + <span className="text-lime">{formatRands(result.growthCents)} growth ✨</span>
            </>
          )}
          {includeNetWorth && <> · starting from today's {formatRands(netWorthCents)}</>}
        </p>
      </div>

      <SliderRow
        label="Saving per month"
        value={monthlyCents}
        display={formatRands(monthlyCents)}
        min={25000}
        max={2000000}
        step={25000}
        onChange={setMonthlyCents}
      />
      <SliderRow
        label="For how long"
        value={months}
        display={formatMonths(months)}
        min={1}
        max={120}
        step={1}
        onChange={setMonths}
      />
      <SliderRow
        label="Yearly growth (interest)"
        value={ratePct}
        display={`${ratePct}%`}
        min={0}
        max={15}
        step={0.5}
        onChange={setRatePct}
      />

      <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
        <input
          type="checkbox"
          checked={includeNetWorth}
          onChange={(e) => setIncludeNetWorth(e.target.checked)}
          className="w-4 h-4 accent-(--color-accent)"
        />
        Start from my current net worth
      </label>
    </Card>
  )
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-0.5">
        <span className="text-ink-faint uppercase tracking-widest text-[10px]">{label}</span>
        <span className="text-accent-soft">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--color-accent)"
        aria-label={label}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AssetSheet({ edit, onClose }: { edit: Asset | 'new' | null; onClose: () => void }) {
  const addAsset = useAppStore((s) => s.addAsset)
  const updateAsset = useAppStore((s) => s.updateAsset)
  const deleteAsset = useAppStore((s) => s.deleteAsset)

  const isNew = edit === 'new'
  const existing = edit !== null && edit !== 'new' ? edit : null

  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ASSET_ICONS[0])
  const [kind, setKind] = useState<Asset['kind']>('asset')
  const [amount, setAmount] = useState('')

  // Re-seed drafts when a different row (or "new") opens.
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = edit === null ? null : isNew ? 'new' : existing!.id
  if (key !== lastKey) {
    setLastKey(key)
    setName(existing?.name ?? '')
    setIcon(existing?.icon ?? ASSET_ICONS[0])
    setKind(existing?.kind ?? 'asset')
    setAmount(existing ? String(Math.round(existing.amountCents / 100)) : '')
  }

  if (edit === null) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const cents = randsToCents(amount)

  async function save() {
    if (!name.trim() || cents < 0) return
    if (isNew) await addAsset({ name, icon, kind, amountCents: cents })
    else await updateAsset(existing!.id, { name: name.trim(), icon, kind, amountCents: cents })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Add to net worth' : 'Edit item'}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex gap-2">
          {(['asset', 'liability'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 py-2 rounded-2xl font-display font-extrabold text-sm border-2 ${
                kind === k
                  ? k === 'asset'
                    ? 'border-lime bg-lime/10 text-lime'
                    : 'border-coral bg-coral/10 text-coral'
                  : 'border-edge bg-bg-deep text-ink-faint'
              }`}
            >
              {k === 'asset' ? '💚 I own this' : '💔 I owe this'}
            </button>
          ))}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'asset' ? 'Savings account, car…' : 'Loan, credit card…'}
          maxLength={30}
          className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-semibold placeholder:text-ink-faint focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {ASSET_ICONS.map((i) => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              className={`w-10 h-10 rounded-xl text-lg border-2 ${
                icon === i ? 'border-accent bg-accent/15' : 'border-edge bg-bg-deep'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <label className="block">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
            Current value (R)
          </p>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="18 500"
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-display font-extrabold text-lg focus:border-accent"
          />
        </label>
        <Button3D full disabled={!name.trim() || cents < 0} onClick={() => void save()}>
          {isNew ? 'Add it' : 'Save changes'}
        </Button3D>
        {!isNew && (
          <Button3D
            full
            variant="ghost"
            onClick={() => {
              void deleteAsset(existing!.id)
              onClose()
            }}
          >
            🗑️ Remove
          </Button3D>
        )}
      </div>
    </Sheet>
  )
}
