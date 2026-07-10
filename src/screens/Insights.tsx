/**
 * Insights: category donut, plain-language month-over-month cards,
 * 6-cycle savings trend and the end-of-month summary.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { computeCycleInfo } from '../state/selectors'
import { momCards, savingsTrend, spentByCategory } from '../lib/engine/insights'
import { prevCycle } from '../lib/engine/cycle'
import { formatMonthLabel, todaySAST } from '../lib/dates'
import { formatRands, formatZARCompact } from '../lib/money'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'

export function Insights() {
  const data = useAppStore((s) => s.data)
  const today = todaySAST()
  const info = useMemo(() => computeCycleInfo(data, today), [data, today])

  const model = useMemo(() => {
    if (!data.profile || !info) return null
    const previous = prevCycle(info.cycle, data.profile.payDate)
    const prevByCat = spentByCategory(data.transactions, previous)
    const cards = momCards(info.spentByCat, prevByCat, data.categories)
    const trend = savingsTrend(data.snapshots)

    const donut = data.categories
      .map((cat) => ({ cat, cents: info.spentByCat[cat.id] ?? 0 }))
      .filter((d) => d.cents > 0)
      .sort((a, b) => b.cents - a.cents)
    const donutTotal = donut.reduce((sum, d) => sum + d.cents, 0)

    return { cards, trend, donut, donutTotal }
  }, [data, info])

  if (!info || !model) return null

  const hasSpending = model.donutTotal > 0

  return (
    <Screen>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="font-display font-extrabold text-2xl">Insights 📊</h1>
        <div className="flex gap-2">
          <Link
            to="/months"
            className="px-3 py-1.5 rounded-full text-xs font-display font-extrabold
                       bg-card border border-edge"
          >
            📆 Months
          </Link>
          <Link
            to="/recap"
            className="px-3 py-1.5 rounded-full text-xs font-display font-extrabold
                       bg-gradient-to-r from-violet to-aqua text-white"
          >
            🎬 Recap
          </Link>
        </div>
      </div>
      <p className="text-xs text-ink-faint font-bold mb-4">
        Cycle: {formatMonthLabel(info.cycle.start)} · started {info.cycle.start.slice(8)}th
      </p>

      {!hasSpending ? (
        <EmptyState
          mood="sleeping"
          title="Nothing to analyse yet"
          message="Log a few expenses and I'll tell you exactly where the money went."
        />
      ) : (
        <>
          {/* Donut */}
          <Card className="mb-4">
            <h2 className="font-display font-extrabold text-sm mb-3">Where it went</h2>
            <div className="flex items-center gap-4">
              <Donut
                slices={model.donut.map((d) => ({ color: d.cat.color, value: d.cents }))}
                total={model.donutTotal}
              />
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {model.donut.slice(0, 5).map(({ cat, cents }) => (
                  <div key={cat.id} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                    <span className="font-bold truncate flex-1">
                      {cat.icon} {cat.name}
                    </span>
                    <span className="text-ink-faint font-bold shrink-0">
                      {Math.round((cents / model.donutTotal) * 100)}%
                    </span>
                  </div>
                ))}
                {model.donut.length > 5 && (
                  <p className="text-[10px] text-ink-faint font-bold">
                    +{model.donut.length - 5} more categories
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* MoM cards */}
          {model.cards.length > 0 && (
            <>
              <h2 className="font-display font-extrabold text-lg mb-2">vs last month</h2>
              <div className="flex flex-col gap-2 mb-4">
                {model.cards.slice(0, 5).map((card) => (
                  <Card key={card.categoryId} className="flex items-center gap-3 py-3">
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${card.color}22`, border: `2px solid ${card.color}66` }}
                    >
                      {card.icon}
                    </span>
                    <p className="text-sm font-semibold flex-1">{card.message}</p>
                    <span
                      className={`font-display font-extrabold text-sm shrink-0 ${
                        card.direction === 'up' || card.direction === 'new'
                          ? 'text-coral'
                          : 'text-lime'
                      }`}
                    >
                      {card.direction === 'up' && '▲'}
                      {card.direction === 'down' && '▼'}
                      {card.direction === 'new' && '✦'}
                      {card.direction === 'gone' && '✓'}
                    </span>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Savings trend */}
      <h2 className="font-display font-extrabold text-lg mb-2">Savings trend</h2>
      <Card>
        {model.trend.length < 2 ? (
          <p className="text-sm text-ink-soft py-4 text-center">
            Finish a couple of cycles and your savings line appears here 📈
          </p>
        ) : (
          <TrendLine points={model.trend.map((t) => t.savedCents)} labels={model.trend.map((t) => t.cycleStart.slice(5, 7))} />
        )}
      </Card>
    </Screen>
  )
}

/** Stroke-based SVG donut. */
function Donut({ slices, total }: { slices: { color: string; value: number }[]; total: number }) {
  const size = 120
  const stroke = 20
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-edge" opacity={0.5} />
      {slices.map((slice, i) => {
        const frac = slice.value / total
        const dash = frac * c
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={slice.color}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(dash - 2, 1)} ${c - dash + 2}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

/** Minimal SVG line chart for the savings trend. */
function TrendLine({ points, labels }: { points: number[]; labels: string[] }) {
  const w = 300
  const h = 110
  const pad = 10
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#A3E635" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#trend)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p)} r={4} fill={i === points.length - 1 ? '#A3E635' : '#22D3EE'} />
        ))}
      </svg>
      <div className="flex justify-between px-1 mt-1">
        {labels.map((label, i) => (
          <span key={i} className="text-[10px] font-bold text-ink-faint">
            {label}
          </span>
        ))}
      </div>
      <p className="text-right text-xs font-display font-extrabold text-lime mt-1">
        best: {formatZARCompact(Math.max(...points))} · latest: {formatRands(points[points.length - 1])}
      </p>
    </div>
  )
}
