/**
 * Derived views over AppData — pure functions the screens call via useMemo.
 */

import type { AppData, Bucket } from '../lib/data/types'
import {
  cycleFor,
  daysRemaining as cycleDaysRemaining,
  prevCycle,
  type Cycle,
} from '../lib/engine/cycle'
import { allocateIncome } from '../lib/engine/allocate'
import {
  funFundSpent,
  incomesInCycle,
  contributionsInCycle,
  spentByBucket,
  spentByCategory,
  sumCents,
  transactionsInCycle,
} from '../lib/engine/insights'
import { computeSafeToSpend, type StsResult } from '../lib/engine/safeToSpend'
import { computeSweepAmount, shouldOfferSweep, type SweepOffer } from '../lib/engine/rollover'
import { diffDays } from '../lib/dates'

export interface CycleInfo {
  cycle: Cycle
  daysRemaining: number
  incomeCents: number
  allocated: Record<Bucket, number>
  spentByCat: Record<string, number>
  spent: Record<Bucket, number>
  /** Contributions (manual + auto + sweep) made during this cycle. */
  savedCents: number
  moneyOutCents: number
  sts: StsResult
  funFund: { budgetCents: number; spentCents: number; remainingCents: number }
}

export function computeCycleInfo(data: AppData, today: string): CycleInfo | null {
  const profile = data.profile
  if (!profile) return null

  const cycle = cycleFor(today, profile.payDate)
  const incomeCents = sumCents(incomesInCycle(data.incomes, cycle))
  const allocated = allocateIncome(incomeCents, profile.splits)
  const spentByCat = spentByCategory(data.transactions, cycle)
  const spent = spentByBucket(spentByCat, data.categories)
  const savedCents = sumCents(contributionsInCycle(data.contributions, cycle))

  const wantsToday = transactionsInCycle(data.transactions, cycle)
    .filter((t) => {
      const cat = data.categories.find((c) => c.id === t.categoryId)
      return t.date === today && (cat?.bucket ?? 'want') === 'want'
    })
    .reduce((sum, t) => sum + t.amountCents, 0)

  const days = cycleDaysRemaining(today, cycle)
  const sts = computeSafeToSpend({
    wantsAllocatedCents: allocated.want,
    wantsSpentCents: spent.want,
    wantsSpentTodayCents: wantsToday,
    daysRemaining: days,
  })

  const funBudget = profile.funFundCents
  const funSpent = funFundSpent(data.transactions, data.categories, cycle)
  const moneyOutCents = spent.need + spent.want

  return {
    cycle,
    daysRemaining: days,
    incomeCents,
    allocated,
    spentByCat,
    spent,
    savedCents,
    moneyOutCents,
    sts,
    funFund: {
      budgetCents: funBudget,
      spentCents: funSpent,
      remainingCents: Math.max(0, funBudget - funSpent),
    },
  }
}

/** Days (ISO) with any logging activity — feeds streaks and the log quest. */
export function loggedDates(data: AppData): Set<string> {
  const days = new Set<string>()
  for (const t of data.transactions) days.add(t.date)
  for (const i of data.incomes) days.add(i.date)
  for (const e of data.xpEvents) {
    if (e.reason === 'no_spend_day') days.add(e.date)
  }
  return days
}

/** Sweep offer for the most recently completed cycle, if it should show. */
export function pendingSweepOffer(data: AppData, today: string): SweepOffer | null {
  const profile = data.profile
  if (!profile) return null

  const current = cycleFor(today, profile.payDate)
  const previous = prevCycle(current, profile.payDate)

  // Was there even a cycle before this one? (Account must predate it.)
  const accountStart = profile.createdAt.slice(0, 10)
  if (accountStart >= previous.end) return null

  const incomeCents = sumCents(incomesInCycle(data.incomes, previous))
  if (incomeCents === 0) return null

  const allocated = allocateIncome(incomeCents, profile.splits)
  const spent = spentByBucket(spentByCategory(data.transactions, previous), data.categories)
  const amount = computeSweepAmount(allocated.want, spent.want)

  const snapshot = data.snapshots.find((s) => s.cycleStart === previous.start)
  const alreadySwept =
    (snapshot?.swept ?? false) ||
    data.xpEvents.some((e) => e.refId === `sweep:${previous.start}`)

  const offer = shouldOfferSweep({
    sweepAmountCents: amount,
    alreadySwept,
    daysSinceCycleEnd: diffDays(previous.end, today),
  })

  return offer ? { cycleStart: previous.start, cycleEnd: previous.end, amountCents: amount } : null
}

/** True when no expense has been logged today (enables the no-spend button). */
export function noExpensesToday(data: AppData, today: string): boolean {
  return !data.transactions.some((t) => t.date === today)
}

export function alreadyMarkedNoSpend(data: AppData, today: string): boolean {
  return data.xpEvents.some((e) => e.refId === `nsd:${today}`)
}
