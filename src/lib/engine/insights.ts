/**
 * Insights: where the money actually went, in plain language.
 * Month-over-month category comparisons, cycle snapshots, savings trend
 * and the end-of-month Season Recap.
 */

import type {
  AppData,
  Bucket,
  Category,
  GoalContribution,
  IncomeEntry,
  MonthlySnapshot,
  Transaction,
} from '../data/types'
import type { Cycle } from './cycle'
import { inCycle } from './cycle'
import { allocateIncome } from './allocate'
import { formatRands } from '../money'

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

export function transactionsInCycle(
  transactions: Transaction[],
  cycle: Cycle,
): Transaction[] {
  return transactions.filter((t) => inCycle(t.date, cycle))
}

export function incomesInCycle(incomes: IncomeEntry[], cycle: Cycle): IncomeEntry[] {
  return incomes.filter((i) => inCycle(i.date, cycle))
}

export function contributionsInCycle(
  contributions: GoalContribution[],
  cycle: Cycle,
): GoalContribution[] {
  return contributions.filter((c) => inCycle(c.date, cycle))
}

export function sumCents(items: { amountCents: number }[]): number {
  return items.reduce((sum, item) => sum + item.amountCents, 0)
}

export function spentByCategory(
  transactions: Transaction[],
  cycle: Cycle,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of transactionsInCycle(transactions, cycle)) {
    out[t.categoryId] = (out[t.categoryId] ?? 0) + t.amountCents
  }
  return out
}

export function spentByBucket(
  byCategory: Record<string, number>,
  categories: Category[],
): Record<Bucket, number> {
  const lookup = new Map(categories.map((c) => [c.id, c.bucket]))
  const out: Record<Bucket, number> = { need: 0, want: 0, saving: 0 }
  for (const [catId, cents] of Object.entries(byCategory)) {
    const bucket = lookup.get(catId) ?? 'want'
    out[bucket] += cents
  }
  return out
}

/** Spend inside Fun-Fund categories (date nights & friends) for a cycle. */
export function funFundSpent(
  transactions: Transaction[],
  categories: Category[],
  cycle: Cycle,
): number {
  const funIds = new Set(categories.filter((c) => c.isFunFund).map((c) => c.id))
  return sumCents(
    transactionsInCycle(transactions, cycle).filter((t) => funIds.has(t.categoryId)),
  )
}

/* ------------------------------------------------------------------ */
/*  Month-over-month cards                                             */
/* ------------------------------------------------------------------ */

export interface InsightCard {
  categoryId: string
  categoryName: string
  icon: string
  color: string
  currentCents: number
  previousCents: number
  /** Percent change vs last cycle; null when there's no baseline. */
  changePct: number | null
  direction: 'up' | 'down' | 'new' | 'gone'
  message: string
}

const MIN_RELEVANT_CENTS = 10_000 // ignore noise under R100

/** Plain-language "you spent 23% more on Eating Out" cards, biggest shifts first. */
export function momCards(
  currentByCat: Record<string, number>,
  previousByCat: Record<string, number>,
  categories: Category[],
): InsightCard[] {
  const cards: InsightCard[] = []

  for (const cat of categories) {
    const current = currentByCat[cat.id] ?? 0
    const previous = previousByCat[cat.id] ?? 0
    if (current < MIN_RELEVANT_CENTS && previous < MIN_RELEVANT_CENTS) continue

    let card: InsightCard | null = null
    if (previous === 0 && current > 0) {
      card = {
        direction: 'new',
        changePct: null,
        message: `New this month: ${formatRands(current)} on ${cat.name}.`,
      } as InsightCard
    } else if (current === 0 && previous > 0) {
      card = {
        direction: 'gone',
        changePct: -100,
        message: `Nothing on ${cat.name} this month — last month it was ${formatRands(previous)}.`,
      } as InsightCard
    } else {
      const changePct = Math.round(((current - previous) / previous) * 100)
      if (Math.abs(changePct) < 10) continue
      card = {
        direction: changePct > 0 ? 'up' : 'down',
        changePct,
        message:
          changePct > 0
            ? `You spent ${changePct}% more on ${cat.name} than last month.`
            : `You spent ${Math.abs(changePct)}% less on ${cat.name} than last month. Nice.`,
      } as InsightCard
    }

    cards.push({
      ...card,
      categoryId: cat.id,
      categoryName: cat.name,
      icon: cat.icon,
      color: cat.color,
      currentCents: current,
      previousCents: previous,
    })
  }

  return cards.sort(
    (a, b) =>
      Math.abs(b.currentCents - b.previousCents) -
      Math.abs(a.currentCents - a.previousCents),
  )
}

/* ------------------------------------------------------------------ */
/*  Snapshots & recap                                                  */
/* ------------------------------------------------------------------ */

export function buildSnapshot(
  data: Pick<AppData, 'incomes' | 'transactions' | 'contributions' | 'categories'>,
  cycle: Cycle,
  splits: { need: number; want: number; saving: number },
  opts?: { sweptCents?: number; nowISO?: string },
): MonthlySnapshot {
  const incomeCents = sumCents(incomesInCycle(data.incomes, cycle))
  const byCategory = spentByCategory(data.transactions, cycle)
  const byBucket = spentByBucket(byCategory, data.categories)
  const allocated = allocateIncome(incomeCents, splits)
  const sweptCents = opts?.sweptCents ?? 0
  const savedCents =
    sumCents(contributionsInCycle(data.contributions, cycle)) + sweptCents
  const now = opts?.nowISO ?? new Date().toISOString()

  return {
    id: `snap:${cycle.start}`,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    incomeCents,
    allocated,
    spentByBucket: byBucket,
    spentByCategory: byCategory,
    savedCents,
    sweptCents,
    swept: sweptCents > 0,
    bossDefeated: savedCents >= allocated.saving && allocated.saving > 0,
    createdAt: now,
  }
}

export interface MonthSummary {
  savedCents: number
  savedPctOfIncome: number
  biggestCategory: { category: Category; cents: number } | null
  bestHabit: string
  worstHabit: string
}

export function monthSummary(
  snapshot: MonthlySnapshot,
  categories: Category[],
): MonthSummary {
  const catLookup = new Map(categories.map((c) => [c.id, c]))
  let biggest: { category: Category; cents: number } | null = null
  for (const [catId, cents] of Object.entries(snapshot.spentByCategory)) {
    const category = catLookup.get(catId)
    if (!category) continue
    if (!biggest || cents > biggest.cents) biggest = { category, cents }
  }

  const wantsAllocated = snapshot.allocated.want
  const wantsSpent = snapshot.spentByBucket.want
  const underWants = wantsAllocated > 0 && wantsSpent <= wantsAllocated

  const bestHabit = snapshot.bossDefeated
    ? 'You hit your savings target — boss defeated! 🏆'
    : underWants
      ? 'You kept Wants under budget. Solid.'
      : snapshot.savedCents > 0
        ? `You still put ${formatRands(snapshot.savedCents)} away.`
        : 'You logged your spending all month.'

  const worstHabit =
    wantsAllocated > 0 && wantsSpent > wantsAllocated
      ? `Wants ran ${formatRands(wantsSpent - wantsAllocated)} over budget.`
      : biggest
        ? `${biggest.category.name} was your biggest line: ${formatRands(biggest.cents)}.`
        : 'Not much data this month.'

  return {
    savedCents: snapshot.savedCents,
    savedPctOfIncome:
      snapshot.incomeCents > 0
        ? Math.round((snapshot.savedCents / snapshot.incomeCents) * 100)
        : 0,
    biggestCategory: biggest,
    bestHabit,
    worstHabit,
  }
}

/** Last `n` cycles of savings for the trend line, oldest first. */
export function savingsTrend(
  snapshots: MonthlySnapshot[],
  n = 6,
): { cycleStart: string; savedCents: number }[] {
  return [...snapshots]
    .sort((a, b) => a.cycleStart.localeCompare(b.cycleStart))
    .slice(-n)
    .map((s) => ({ cycleStart: s.cycleStart, savedCents: s.savedCents }))
}
