/**
 * Demo mode seed: three completed budget cycles plus the current one, filled
 * with realistic ZAR spending so the app looks alive immediately. The
 * generator is deterministic (seeded PRNG) relative to today's date.
 */

import type {
  AppData,
  Goal,
  GoalContribution,
  IncomeEntry,
  Transaction,
  UserQuest,
  XpEvent,
} from './types'
import { DEFAULT_CATEGORIES, makeDefaultProfile } from './defaults'
import { addDays, todaySAST } from '../dates'
import { cycleFor, daysInCycle, prevCycle, type Cycle } from '../engine/cycle'
import { buildSnapshot } from '../engine/insights'
import { DEFAULT_SPLITS } from '../engine/allocate'
import { makeXpEvent } from '../gamification/xp'

/* Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const SALARY_CENTS = 2_850_000 // R28 500
const PAY_DATE = 25

interface SeedState {
  incomes: IncomeEntry[]
  transactions: Transaction[]
  contributions: GoalContribution[]
  xpEvents: XpEvent[]
  userQuests: UserQuest[]
}

function creation(date: string): string {
  return `${date}T09:00:00.000Z`
}

let seq = 0
function sid(prefix: string): string {
  seq += 1
  return `${prefix}-${seq.toString(36)}`
}

function addTxn(
  s: SeedState,
  date: string,
  amountCents: number,
  categoryId: string,
  note?: string,
) {
  const id = sid('demo-t')
  s.transactions.push({
    id,
    amountCents: Math.round(amountCents),
    categoryId,
    note,
    date,
    createdAt: creation(date),
  })
  s.xpEvents.push(
    makeXpEvent({ reason: 'log_expense', refId: id, date, nowISO: creation(date) }),
  )
}

function addIncome(
  s: SeedState,
  date: string,
  amountCents: number,
  source: IncomeEntry['source'],
  note?: string,
) {
  s.incomes.push({
    id: sid('demo-i'),
    amountCents,
    source,
    note,
    date,
    createdAt: creation(date),
  })
}

function contribute(
  s: SeedState,
  date: string,
  goalId: string,
  amountCents: number,
  source: GoalContribution['source'] = 'manual',
) {
  const id = sid('demo-c')
  s.contributions.push({
    id,
    goalId,
    amountCents,
    date,
    source,
    createdAt: creation(date),
  })
  s.xpEvents.push(
    makeXpEvent({ reason: 'savings_contribution', refId: id, date, nowISO: creation(date) }),
  )
}

/** Fill one cycle with plausible spending. `progress` caps how far in we go (0–1). */
function fillCycle(s: SeedState, cycle: Cycle, today: string, rand: () => number) {
  const length = daysInCycle(cycle)
  const lastDay = today < cycle.end ? today : addDays(cycle.end, -1)

  const on = (dayOffset: number) => addDays(cycle.start, Math.min(dayOffset, length - 1))
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const cents = (rands: number) => Math.round(rands) * 100

  const maybe = (date: string, fn: () => void) => {
    if (date <= lastDay) fn()
  }

  // Salary lands on day one.
  maybe(cycle.start, () => addIncome(s, cycle.start, SALARY_CENTS, 'salary', 'Monthly salary'))

  // Debit orders (dates relative to cycle start on the 25th).
  maybe(on(6), () => addTxn(s, on(6), 950_000, 'cat-housing', 'Rent'))
  maybe(on(6), () => addTxn(s, on(6), 240_000, 'cat-medical', 'Medical aid'))
  maybe(on(8), () => addTxn(s, on(8), 115_000, 'cat-insurance', 'Car + contents'))
  maybe(on(10), () => addTxn(s, on(10), 89_900, 'cat-subscriptions', 'Fibre'))
  maybe(on(12), () => addTxn(s, on(12), 19_900, 'cat-subscriptions', 'Netflix'))
  maybe(on(13), () => addTxn(s, on(13), 11_900, 'cat-subscriptions', 'Spotify'))
  maybe(on(8), () => addTxn(s, on(8), 45_000, 'cat-personal-care', 'Gym'))

  // Groceries roughly every four days.
  for (let d = 2; d < length; d += 4) {
    maybe(on(d), () => addTxn(s, on(d), cents(between(280, 720)), 'cat-groceries'))
  }

  // Fuel twice a cycle.
  for (const d of [4, 18]) {
    maybe(on(d), () => addTxn(s, on(d), cents(between(700, 960)), 'cat-transport', 'Fuel'))
  }

  // Eating out — the habit the insights love to talk about.
  const eatDays = [3, 7, 11, 16, 20, 24].filter(() => rand() > 0.25)
  for (const d of eatDays) {
    maybe(on(d), () => addTxn(s, on(d), cents(between(140, 430)), 'cat-eating-out'))
  }

  // Date nights, twice a cycle. ❤️
  for (const d of [5, 19]) {
    maybe(on(d), () => addTxn(s, on(d), cents(between(450, 820)), 'cat-date-nights', 'Date night'))
  }

  // Entertainment & the rest.
  maybe(on(9), () => addTxn(s, on(9), cents(between(150, 380)), 'cat-entertainment'))
  maybe(on(21), () => addTxn(s, on(21), cents(between(150, 420)), 'cat-entertainment'))
  maybe(on(14), () => addTxn(s, on(14), cents(between(180, 460)), 'cat-personal-care'))
  maybe(on(15), () => addTxn(s, on(15), 20_000, 'cat-giving', 'Church'))
  if (rand() > 0.5) {
    maybe(on(17), () => addTxn(s, on(17), cents(between(120, 520)), 'cat-other'))
  }

  // Goal contributions early in the cycle.
  maybe(on(1), () => contribute(s, on(1), 'goal-emergency', 200_000, 'auto'))
  maybe(on(1), () => contribute(s, on(1), 'goal-holiday', 150_000, 'auto'))
  maybe(on(2), () => contribute(s, on(2), 'goal-laptop', 120_000, 'auto'))
}

export function buildDemoData(now: Date = new Date()): AppData {
  seq = 0
  const today = todaySAST(now)
  const rand = rng(hashString(today))

  const current = cycleFor(today, PAY_DATE)
  const c1 = prevCycle(current, PAY_DATE)
  const c2 = prevCycle(c1, PAY_DATE)
  const c3 = prevCycle(c2, PAY_DATE)

  const s: SeedState = {
    incomes: [],
    transactions: [],
    contributions: [],
    xpEvents: [],
    userQuests: [],
  }

  for (const cycle of [c3, c2, c1, current]) {
    fillCycle(s, cycle, today, rand)
  }

  // Extra income sprinkled through history.
  addIncome(s, addDays(c2.start, 9), 350_000, 'freelance', 'Logo design gig')
  addIncome(s, addDays(c1.start, 14), 42_000, 'dividends', 'ETF payout')
  addIncome(s, addDays(c1.start, 20), 38_000, 'refund', 'Returned headphones')
  if (addDays(current.start, 3) <= today) {
    addIncome(s, addDays(current.start, 3), 180_000, 'freelance', 'Weekend shoot')
  }

  // A sweep at the end of the last cycle (leftover wants → emergency fund).
  // Big enough that, with the auto-allocations, c1's savings target is hit —
  // so the snapshot, the boss-slayer badge and the review all tell one story.
  const sweepDate = c1.start
  contribute(s, sweepDate, 'goal-emergency', 128_500, 'sweep')
  s.xpEvents.push(
    makeXpEvent({ reason: 'sweep', refId: `sweep:${c1.start}`, date: sweepDate, nowISO: creation(sweepDate) }),
  )

  // Day-close awards for flavour: a handful of under-budget and no-spend days.
  for (const d of [2, 8, 12, 22]) {
    const date = addDays(c1.start, d)
    s.xpEvents.push(
      makeXpEvent({ reason: 'under_sts_day', refId: `usd:${date}`, date, nowISO: creation(date) }),
    )
  }
  for (const d of [6, 13]) {
    const date = addDays(c1.start, d)
    s.xpEvents.push(
      makeXpEvent({ reason: 'no_spend_day', refId: `nsd:${date}`, date, nowISO: creation(date) }),
    )
  }
  for (const d of [1, 5]) {
    const date = addDays(current.start, d)
    if (date <= today) {
      s.xpEvents.push(
        makeXpEvent({ reason: 'under_sts_day', refId: `usd:${date}`, date, nowISO: creation(date) }),
      )
    }
  }

  // Claimed quests (weekly wins + last cycle's boss).
  const claims: Array<{ questId: string; periodKey: string; rewardXp: number; date: string }> = [
    { questId: 'q-log-week', periodKey: 'demo-w1', rewardXp: 150, date: addDays(c2.start, 7) },
    { questId: 'q-goal-500', periodKey: 'demo-w2', rewardXp: 130, date: addDays(c1.start, 7) },
    { questId: 'q-eating-out', periodKey: 'demo-w3', rewardXp: 120, date: addDays(c1.start, 14) },
    { questId: 'q-boss', periodKey: c1.start, rewardXp: 500, date: addDays(c1.start, 28) },
  ]
  for (const claim of claims) {
    s.userQuests.push({
      id: sid('demo-q'),
      questId: claim.questId,
      periodKey: claim.periodKey,
      completedAt: creation(claim.date),
      claimedAt: creation(claim.date),
      createdAt: creation(claim.date),
    })
    s.xpEvents.push(
      makeXpEvent({
        reason: claim.questId === 'q-boss' ? 'boss_defeated' : 'quest_reward',
        refId: `quest:${claim.questId}:${claim.periodKey}`,
        date: claim.date,
        amount: claim.rewardXp,
        nowISO: creation(claim.date),
      }),
    )
  }

  // Goals with progress accumulated from the contributions above.
  const goals: Goal[] = [
    {
      id: 'goal-emergency',
      name: 'Emergency Fund',
      icon: '🛟',
      color: '#22D3EE',
      targetCents: 3_000_000,
      savedCents: 0,
      autoAllocateCents: 200_000,
      celebratedMilestones: [25],
      achievedAt: null,
      createdAt: creation(c3.start),
    },
    {
      id: 'goal-holiday',
      name: 'Cape Town Holiday',
      icon: '🏖️',
      color: '#FB923C',
      targetCents: 1_800_000,
      savedCents: 0,
      autoAllocateCents: 150_000,
      celebratedMilestones: [25],
      achievedAt: null,
      createdAt: creation(c3.start),
    },
    {
      id: 'goal-laptop',
      name: 'New Laptop',
      icon: '💻',
      color: '#8B5CF6',
      targetCents: 2_500_000,
      savedCents: 0,
      autoAllocateCents: 120_000,
      celebratedMilestones: [],
      achievedAt: null,
      createdAt: creation(c3.start),
    },
  ]
  for (const goal of goals) {
    goal.savedCents = s.contributions
      .filter((c) => c.goalId === goal.id)
      .reduce((sum, c) => sum + c.amountCents, 0)
  }

  const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }))

  // Snapshots for the three completed cycles.
  const snapshots = [c3, c2, c1].map((cycle) =>
    buildSnapshot(
      { incomes: s.incomes, transactions: s.transactions, contributions: s.contributions, categories },
      cycle,
      DEFAULT_SPLITS,
      {
        sweptCents: cycle.start === c1.start ? 0 : 0,
        nowISO: creation(cycle.end),
      },
    ),
  )

  const profile = makeDefaultProfile({
    displayName: 'Demo',
    surname: 'Randy',
    username: 'demo',
    email: 'demo@pennyplay.app',
    phone: '+27 00 000 0000',
    salaryCents: SALARY_CENTS,
    payDate: PAY_DATE,
    isDemo: true,
    nowISO: creation(c3.start),
  })
  profile.xp = s.xpEvents.reduce((sum, e) => sum + e.amount, 0)
  profile.streakCount = 12
  profile.longestStreak = 16
  profile.streakFreezes = 1
  profile.lastLogDate = today
  profile.lastEvaluatedDate = addDays(today, -1)
  profile.weeklyStreak = 2

  const userBadges = [
    'first-save',
    'kickstart',
    'sweeper',
    'streak-7',
    'side-hustle',
    'boss-slayer',
    'saved-10k',
  ].map((badgeId) => ({ badgeId, earnedAt: creation(c1.start) }))

  return {
    profile,
    categories,
    incomes: s.incomes,
    transactions: s.transactions,
    recurring: [
      { id: 'rec-rent', kind: 'expense', name: 'Rent', amountCents: 950_000, dayOfMonth: 1, categoryId: 'cat-housing', active: true, lastMaterialized: today, createdAt: creation(c3.start) },
      { id: 'rec-medical', kind: 'expense', name: 'Medical aid', amountCents: 240_000, dayOfMonth: 1, categoryId: 'cat-medical', active: true, lastMaterialized: today, createdAt: creation(c3.start) },
      { id: 'rec-insurance', kind: 'expense', name: 'Insurance', amountCents: 115_000, dayOfMonth: 3, categoryId: 'cat-insurance', active: true, lastMaterialized: today, createdAt: creation(c3.start) },
      { id: 'rec-fibre', kind: 'expense', name: 'Fibre', amountCents: 89_900, dayOfMonth: 5, categoryId: 'cat-subscriptions', active: true, lastMaterialized: today, createdAt: creation(c3.start) },
      { id: 'rec-salary', kind: 'income', name: 'Salary', amountCents: SALARY_CENTS, dayOfMonth: PAY_DATE, source: 'salary', active: true, lastMaterialized: today, createdAt: creation(c3.start) },
    ],
    goals,
    contributions: s.contributions,
    snapshots,
    assets: [
      { id: 'demo-a1', name: 'FNB Savings', icon: '🏦', kind: 'asset', amountCents: 1_850_000, createdAt: creation(c3.start), updatedAt: creation(c1.start) },
      { id: 'demo-a2', name: 'Car (resale)', icon: '🚗', kind: 'asset', amountCents: 8_500_000, createdAt: creation(c3.start), updatedAt: creation(c3.start) },
      { id: 'demo-a3', name: 'Student loan', icon: '🎓', kind: 'liability', amountCents: 4_200_000, createdAt: creation(c3.start), updatedAt: creation(c2.start) },
      { id: 'demo-a4', name: 'Credit card', icon: '💳', kind: 'liability', amountCents: 680_000, createdAt: creation(c3.start), updatedAt: creation(c1.start) },
    ],
    reviews: [
      {
        id: 'demo-rev-1',
        cycleStart: c2.start,
        mood: 3,
        note: 'Groceries crept up but the side gig covered it. Solid month.',
        createdAt: creation(c2.end),
        updatedAt: creation(c2.end),
      },
      {
        id: 'demo-rev-2',
        cycleStart: c1.start,
        mood: 4,
        note: 'Beat the boss AND swept leftovers into the emergency fund 🎉',
        createdAt: creation(c1.end),
        updatedAt: creation(c1.end),
      },
    ],
    userQuests: s.userQuests,
    userBadges,
    xpEvents: s.xpEvents,
  }
}
