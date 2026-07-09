import { describe, expect, it } from 'vitest'
import type { Category, MonthlySnapshot, Transaction } from '../data/types'
import {
  buildSnapshot,
  funFundSpent,
  momCards,
  monthSummary,
  savingsTrend,
  spentByBucket,
  spentByCategory,
} from './insights'
import { DEFAULT_SPLITS } from './allocate'

const cycle = { start: '2026-06-25', end: '2026-07-25' }

const categories: Category[] = [
  { id: 'cat-housing', name: 'Housing', icon: '🏠', color: '#fff', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 0 },
  { id: 'cat-eating-out', name: 'Eating Out', icon: '🍔', color: '#fff', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 1 },
  { id: 'cat-date-nights', name: 'Date Nights', icon: '❤️', color: '#fff', bucket: 'want', isFunFund: true, isCustom: false, sortOrder: 2 },
]

function txn(date: string, amountCents: number, categoryId: string): Transaction {
  return { id: `t-${date}-${categoryId}-${amountCents}`, amountCents, categoryId, date, createdAt: date }
}

describe('aggregation', () => {
  const transactions = [
    txn('2026-07-01', 950000, 'cat-housing'),
    txn('2026-07-05', 30000, 'cat-eating-out'),
    txn('2026-07-08', 25000, 'cat-eating-out'),
    txn('2026-07-09', 65000, 'cat-date-nights'),
    txn('2026-06-20', 99999, 'cat-eating-out'), // before the cycle
  ]

  it('sums per category inside the cycle only', () => {
    const byCat = spentByCategory(transactions, cycle)
    expect(byCat['cat-housing']).toBe(950000)
    expect(byCat['cat-eating-out']).toBe(55000)
    expect(byCat['cat-date-nights']).toBe(65000)
  })

  it('rolls categories up to buckets', () => {
    const byBucket = spentByBucket(spentByCategory(transactions, cycle), categories)
    expect(byBucket).toEqual({ need: 950000, want: 120000, saving: 0 })
  })

  it('tracks fun-fund spend separately', () => {
    expect(funFundSpent(transactions, categories, cycle)).toBe(65000)
  })
})

describe('momCards', () => {
  it('describes increases in plain language', () => {
    const cards = momCards(
      { 'cat-eating-out': 61500 },
      { 'cat-eating-out': 50000 },
      categories,
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].changePct).toBe(23)
    expect(cards[0].message).toBe('You spent 23% more on Eating Out than last month.')
  })

  it('celebrates decreases', () => {
    const cards = momCards(
      { 'cat-eating-out': 40000 },
      { 'cat-eating-out': 50000 },
      categories,
    )
    expect(cards[0].changePct).toBe(-20)
    expect(cards[0].message).toContain('20% less on Eating Out')
  })

  it('ignores noise and small shifts', () => {
    expect(
      momCards({ 'cat-eating-out': 5000 }, { 'cat-eating-out': 2000 }, categories),
    ).toHaveLength(0) // under R100
    expect(
      momCards({ 'cat-eating-out': 51000 }, { 'cat-eating-out': 50000 }, categories),
    ).toHaveLength(0) // 2% shift
  })

  it('flags new spending', () => {
    const cards = momCards({ 'cat-date-nights': 65000 }, {}, categories)
    expect(cards[0].direction).toBe('new')
  })
})

describe('buildSnapshot', () => {
  it('captures income, allocation, spend and savings', () => {
    const snap = buildSnapshot(
      {
        incomes: [
          { id: 'i1', amountCents: 2850000, source: 'salary', date: '2026-06-25', createdAt: '' },
          { id: 'i2', amountCents: 150000, source: 'freelance', date: '2026-07-02', createdAt: '' },
        ],
        transactions: [txn('2026-07-01', 950000, 'cat-housing'), txn('2026-07-05', 30000, 'cat-eating-out')],
        contributions: [
          { id: 'c1', goalId: 'g1', amountCents: 400000, date: '2026-07-01', source: 'manual', createdAt: '' },
        ],
        categories,
      },
      cycle,
      DEFAULT_SPLITS,
      { sweptCents: 100000, nowISO: '2026-07-25T00:00:00Z' },
    )
    expect(snap.incomeCents).toBe(3000000)
    expect(snap.allocated).toEqual({ need: 1500000, want: 900000, saving: 600000 })
    expect(snap.spentByBucket.need).toBe(950000)
    expect(snap.savedCents).toBe(500000)
    expect(snap.swept).toBe(true)
    // 500000 saved < 600000 target → boss survives.
    expect(snap.bossDefeated).toBe(false)
  })

  it('defeats the boss when savings hit the allocation', () => {
    const snap = buildSnapshot(
      {
        incomes: [{ id: 'i1', amountCents: 2850000, source: 'salary', date: '2026-06-25', createdAt: '' }],
        transactions: [],
        contributions: [
          { id: 'c1', goalId: 'g1', amountCents: 570000, date: '2026-07-01', source: 'manual', createdAt: '' },
        ],
        categories,
      },
      cycle,
      DEFAULT_SPLITS,
    )
    expect(snap.bossDefeated).toBe(true)
  })
})

describe('monthSummary & savingsTrend', () => {
  const snap = (start: string, saved: number): MonthlySnapshot => ({
    id: `snap:${start}`,
    cycleStart: start,
    cycleEnd: start,
    incomeCents: 2850000,
    allocated: { need: 1425000, want: 855000, saving: 570000 },
    spentByBucket: { need: 1200000, want: 700000, saving: 0 },
    spentByCategory: { 'cat-housing': 950000, 'cat-eating-out': 250000 },
    savedCents: saved,
    sweptCents: 0,
    swept: false,
    bossDefeated: false,
    createdAt: '',
  })

  it('summarises the month', () => {
    const s = monthSummary(snap('2026-06-25', 570000), categories)
    expect(s.savedCents).toBe(570000)
    expect(s.savedPctOfIncome).toBe(20)
    expect(s.biggestCategory?.category.id).toBe('cat-housing')
  })

  it('trend returns the last six cycles oldest-first', () => {
    const snaps = ['2026-01-25', '2026-03-25', '2026-02-25', '2025-12-25', '2026-04-25', '2026-05-25', '2026-06-25']
      .map((d, i) => snap(d, i * 100))
    const trend = savingsTrend(snaps)
    expect(trend).toHaveLength(6)
    expect(trend[0].cycleStart).toBe('2026-01-25')
    expect(trend[5].cycleStart).toBe('2026-06-25')
  })
})
