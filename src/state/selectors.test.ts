/**
 * Financial integrity audit — every derived number on the dashboard must
 * agree with the ledger, cent for cent.
 */

import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../lib/data/seedDemo'
import { DEFAULT_SPLITS } from '../lib/engine/allocate'
import { buildSnapshot } from '../lib/engine/insights'
import { cycleFor } from '../lib/engine/cycle'
import { todaySAST } from '../lib/dates'
import { computeCycleInfo } from './selectors'
import type { AppData, Bucket } from '../lib/data/types'

function auditCycle(data: AppData, today: string) {
  const info = computeCycleInfo(data, today)
  if (!info || !data.profile) throw new Error('missing profile')

  const allocSum = info.allocated.need + info.allocated.want + info.allocated.saving
  const snap = buildSnapshot(data, info.cycle, data.profile.splits)

  return { info, snap, allocSum }
}

describe('financial integrity', () => {
  it('allocations sum exactly to cycle income', () => {
    const data = buildDemoData()
    const { info, allocSum } = auditCycle(data, todaySAST())
    expect(allocSum).toBe(info.incomeCents)
  })

  it('safe-to-spend remaining matches wants bucket math', () => {
    const data = buildDemoData()
    const { info } = auditCycle(data, todaySAST())
    expect(info.sts.remainingCents).toBe(info.allocated.want - info.spent.want)
  })

  it('week spend never exceeds remaining wants budget', () => {
    const data = buildDemoData()
    const { info } = auditCycle(data, todaySAST())
    expect(info.sts.weekCents).toBeLessThanOrEqual(Math.max(0, info.sts.remainingCents))
    expect(info.sts.dailyCents * Math.min(info.daysRemaining || 1, 7)).toBeGreaterThanOrEqual(
      info.sts.weekCents,
    )
  })

  it('money out excludes savings-bucket expenses', () => {
    const data = buildDemoData()
    const { info } = auditCycle(data, todaySAST())
    expect(info.moneyOutCents).toBe(info.spent.need + info.spent.want)
  })

  it('saved cents matches contribution ledger and savings ring', () => {
    const data = buildDemoData()
    const { info, snap } = auditCycle(data, todaySAST())
    const fromLedger = data.contributions
      .filter((c) => c.date >= info.cycle.start && c.date < info.cycle.end)
      .reduce((s, c) => s + c.amountCents, 0)
    expect(info.savedCents).toBe(fromLedger)
    expect(snap.savedCents).toBe(info.savedCents)
  })

  it('income balances: in = out + saved + unallocated slack', () => {
    const data = buildDemoData()
    const { info } = auditCycle(data, todaySAST())
    const slack = info.incomeCents - info.moneyOutCents - info.savedCents
    expect(slack).toBeGreaterThanOrEqual(0)
    expect(info.incomeCents).toBe(info.moneyOutCents + info.savedCents + slack)
  })

  it('goal totals reconcile with all contributions', () => {
    const data = buildDemoData()
    const contribTotal = data.contributions.reduce((s, c) => s + c.amountCents, 0)
    const goalTotal = data.goals.reduce((s, g) => s + g.savedCents, 0)
    expect(goalTotal).toBe(contribTotal)
    for (const goal of data.goals) {
      const fromLedger = data.contributions
        .filter((c) => c.goalId === goal.id)
        .reduce((s, c) => s + c.amountCents, 0)
      expect(goal.savedCents).toBe(fromLedger)
    }
  })

  it('live snapshot matches dashboard cycle info', () => {
    const data = buildDemoData()
    const today = todaySAST()
    const { info, snap } = auditCycle(data, today)
    expect(snap.incomeCents).toBe(info.incomeCents)
    expect(snap.spentByBucket).toEqual(info.spent)
    expect(snap.allocated).toEqual(info.allocated)
  })

  it('demo cycle: saved stat, savings ring, and month snapshot all agree', () => {
    const data = buildDemoData()
    const { info, snap } = auditCycle(data, todaySAST())
    expect(snap.savedCents).toBe(info.savedCents)
    expect(info.incomeCents - info.moneyOutCents - info.savedCents).toBeGreaterThanOrEqual(0)
  })

  it('bucket allocations use largest-remainder (no cent loss)', () => {
    const data = buildDemoData()
    const today = todaySAST()
    const cycle = cycleFor(today, data.profile!.payDate)
    // Odd income that doesn't divide cleanly by percentages.
    const testData: AppData = {
      ...data,
      incomes: [{ id: 'i1', amountCents: 1_000_001, source: 'salary', date: cycle.start, createdAt: '' }],
      transactions: [],
      contributions: [],
    }
    const info = computeCycleInfo(testData, today)!
    const sum = info.allocated.need + info.allocated.want + info.allocated.saving
    expect(sum).toBe(1_000_001)
    expect(info.allocated.need).toBe(500_001) // 50% + 1 remainder cent
  })
})
