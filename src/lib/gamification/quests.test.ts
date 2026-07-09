import { describe, expect, it } from 'vitest'
import type { QuestContext } from './quests'
import {
  EATING_OUT_ID,
  QUEST_DEFS,
  computeQuestProgress,
  questClaimRef,
  questPeriodKey,
} from './quests'
import type { Transaction } from '../data/types'

// Week of Mon 2026-07-06 → Sun 2026-07-12; cycle 25 Jun → 25 Jul.
const cycle = { start: '2026-06-25', end: '2026-07-25' }

function ctx(overrides: Partial<QuestContext> = {}): QuestContext {
  return {
    todayISO: '2026-07-09',
    weekStart: '2026-07-06',
    weekEnd: '2026-07-12',
    cycle,
    transactions: [],
    contributions: [],
    categories: [],
    loggedDates: new Set(),
    savingAllocatedCents: 570000,
    savedThisCycleCents: 0,
    ...overrides,
  }
}

function txn(date: string, amountCents: number, categoryId = 'cat-groceries'): Transaction {
  return { id: `t-${date}-${amountCents}`, amountCents, categoryId, date, createdAt: date }
}

const byId = Object.fromEntries(QUEST_DEFS.map((d) => [d.id, d]))

describe('log_days quest', () => {
  it('counts logged days up to today only', () => {
    const p = computeQuestProgress(
      byId['q-log-week'],
      ctx({ loggedDates: new Set(['2026-07-06', '2026-07-07', '2026-07-09', '2026-07-11']) }),
    )
    expect(p.progress).toBe(3) // the 11th hasn't happened yet
    expect(p.completed).toBe(false)
  })

  it('completes with all seven days logged', () => {
    const days = ['06', '07', '08', '09', '10', '11', '12'].map((d) => `2026-07-${d}`)
    const p = computeQuestProgress(
      byId['q-log-week'],
      ctx({ todayISO: '2026-07-12', loggedDates: new Set(days) }),
    )
    expect(p.progress).toBe(7)
    expect(p.completed).toBe(true)
  })
})

describe('category_under quest (Eating Out < R500)', () => {
  it('tracks in-week category spend', () => {
    const p = computeQuestProgress(
      byId['q-eating-out'],
      ctx({
        transactions: [
          txn('2026-07-07', 20000, EATING_OUT_ID),
          txn('2026-07-08', 12000, EATING_OUT_ID),
          txn('2026-07-08', 99999, 'cat-groceries'), // other categories don't count
          txn('2026-07-01', 88888, EATING_OUT_ID), // outside the week
        ],
      }),
    )
    expect(p.progress).toBe(32000)
    expect(p.completed).toBe(false) // week not over yet
  })

  it('completes once the week is over and under budget', () => {
    const p = computeQuestProgress(
      byId['q-eating-out'],
      ctx({
        todayISO: '2026-07-13', // Monday after
        transactions: [txn('2026-07-07', 32000, EATING_OUT_ID)],
        loggedDates: new Set(['2026-07-07']),
      }),
    )
    expect(p.completed).toBe(true)
  })

  it("can't be won in a week with zero activity (no free XP)", () => {
    const p = computeQuestProgress(
      byId['q-eating-out'],
      ctx({ todayISO: '2026-07-13', transactions: [], loggedDates: new Set() }),
    )
    expect(p.completed).toBe(false)
  })

  it('fails when the budget busts', () => {
    const p = computeQuestProgress(
      byId['q-eating-out'],
      ctx({
        todayISO: '2026-07-13',
        transactions: [txn('2026-07-07', 60000, EATING_OUT_ID)],
      }),
    )
    expect(p.completed).toBe(false)
  })
})

describe('no_spend_weekend quest', () => {
  it('completes after a clean weekend', () => {
    const p = computeQuestProgress(
      byId['q-no-spend-weekend'],
      // Friday spend is fine — and counts as having played the week.
      ctx({
        todayISO: '2026-07-13',
        transactions: [txn('2026-07-10', 5000)],
        loggedDates: new Set(['2026-07-10']),
      }),
    )
    expect(p.completed).toBe(true)
  })

  it('needs at least one active day in the week', () => {
    const p = computeQuestProgress(
      byId['q-no-spend-weekend'],
      ctx({ todayISO: '2026-07-13', transactions: [], loggedDates: new Set() }),
    )
    expect(p.completed).toBe(false)
  })

  it('fails if Saturday or Sunday has spend', () => {
    const p = computeQuestProgress(
      byId['q-no-spend-weekend'],
      ctx({ todayISO: '2026-07-13', transactions: [txn('2026-07-11', 100)] }),
    )
    expect(p.completed).toBe(false)
    expect(p.pct).toBe(0)
  })
})

describe('goal_contribution quest', () => {
  it('completes immediately when R500 is added', () => {
    const p = computeQuestProgress(
      byId['q-goal-500'],
      ctx({
        contributions: [
          { id: 'c1', goalId: 'g1', amountCents: 30000, date: '2026-07-07', source: 'manual', createdAt: '' },
          { id: 'c2', goalId: 'g1', amountCents: 25000, date: '2026-07-09', source: 'manual', createdAt: '' },
        ],
      }),
    )
    expect(p.progress).toBe(55000)
    expect(p.completed).toBe(true)
  })
})

describe('boss battle', () => {
  it('tracks percentage of the savings target', () => {
    const p = computeQuestProgress(byId['q-boss'], ctx({ savedThisCycleCents: 285000 }))
    expect(p.progress).toBe(50)
    expect(p.completed).toBe(false)
  })

  it('defeats the boss when the target is hit', () => {
    const p = computeQuestProgress(byId['q-boss'], ctx({ savedThisCycleCents: 570000 }))
    expect(p.completed).toBe(true)
    expect(p.pct).toBe(1)
  })

  it('stays dormant without a savings allocation', () => {
    const p = computeQuestProgress(byId['q-boss'], ctx({ savingAllocatedCents: 0 }))
    expect(p.completed).toBe(false)
    expect(p.pct).toBe(0)
  })
})

describe('period keys and claim refs', () => {
  it('weekly quests key on the ISO week, boss on the cycle', () => {
    const weekly = questPeriodKey(byId['q-log-week'], { weekKey: '2026-W28', cycle })
    const boss = questPeriodKey(byId['q-boss'], { weekKey: '2026-W28', cycle })
    expect(weekly).toBe('2026-W28')
    expect(boss).toBe('2026-06-25')
  })

  it('claim refs are deterministic', () => {
    expect(questClaimRef('q-boss', '2026-06-25')).toBe('quest:q-boss:2026-06-25')
  })
})
