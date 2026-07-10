import { describe, expect, it } from 'vitest'
import type { AppData, Goal, MonthlySnapshot } from '../data/types'
import { emptyAppData } from '../data/types'
import { makeDefaultProfile } from '../data/defaults'
import { reconcile } from './reconcile'
import { makeXpEvent } from '../gamification/xp'

const TODAY = '2026-07-10' // cycle 2026-06-25 → 2026-07-25 (pay date 25)

function base(): AppData {
  const data = emptyAppData()
  data.profile = makeDefaultProfile({
    displayName: 'T',
    salaryCents: 2_850_000,
    payDate: 25,
    nowISO: '2026-03-25T00:00:00.000Z',
  })
  data.categories = [
    { id: 'cat-eating-out', name: 'Eating Out', icon: '🍔', color: '#fff', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 0 },
    { id: 'cat-other', name: 'Other', icon: '📦', color: '#fff', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 1 },
  ]
  return data
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1', name: 'Fund', icon: '🎯', color: '#fff',
    targetCents: 100_000, savedCents: 999_999, autoAllocateCents: 0,
    celebratedMilestones: [25, 50, 75, 100], achievedAt: '2026-01-01', createdAt: '',
    ...over,
  }
}

describe('reconcile', () => {
  it('re-derives goal totals, achievement and milestones from contributions', () => {
    const data = base()
    data.goals = [goal()]
    data.contributions = [
      { id: 'c1', goalId: 'g1', amountCents: 30_000, date: '2026-07-01', source: 'manual', createdAt: '' },
      { id: 'c2', goalId: 'g1', amountCents: 25_000, date: '2026-07-05', source: 'manual', createdAt: '' },
    ]
    reconcile(data, TODAY)
    const g = data.goals[0]
    expect(g.savedCents).toBe(55_000) // 55% — not the stale 999 999
    expect(g.achievedAt).toBeNull()
    expect(g.celebratedMilestones).toEqual([25, 50]) // 75/100 un-latch
  })

  it('drops contributions whose goal is gone', () => {
    const data = base()
    data.goals = []
    data.contributions = [
      { id: 'c1', goalId: 'ghost', amountCents: 1, date: '2026-07-01', source: 'manual', createdAt: '' },
    ]
    reconcile(data, TODAY)
    expect(data.contributions).toHaveLength(0)
  })

  it('reassigns transactions from deleted categories to Other', () => {
    const data = base()
    data.transactions = [
      { id: 't1', amountCents: 100, categoryId: 'deleted-cat', date: '2026-07-01', createdAt: '' },
    ]
    reconcile(data, TODAY)
    expect(data.transactions[0].categoryId).toBe('cat-other')
  })

  it('keeps profile XP equal to the audit log', () => {
    const data = base()
    data.profile!.xp = 12345
    data.xpEvents = [
      makeXpEvent({ reason: 'log_expense', refId: 'a', date: TODAY }),
      makeXpEvent({ reason: 'no_spend_day', refId: 'b', date: TODAY }),
    ]
    reconcile(data, TODAY)
    expect(data.profile!.xp).toBe(85)
  })

  it('rebuilds stored snapshots from the edited ledger, preserving sweep bookkeeping', () => {
    const data = base()
    // Completed cycle 25 May → 25 Jun with one stale snapshot.
    const stale: MonthlySnapshot = {
      id: 'snap-x', cycleStart: '2026-05-25', cycleEnd: '2026-06-25',
      incomeCents: 1, allocated: { need: 1, want: 0, saving: 0 },
      spentByBucket: { need: 0, want: 999, saving: 0 },
      spentByCategory: { 'cat-eating-out': 999 },
      savedCents: 0, sweptCents: 40_000, swept: true, bossDefeated: false,
      createdAt: '2026-06-25T00:00:00.000Z',
    }
    data.snapshots = [stale]
    data.incomes = [
      { id: 'i1', amountCents: 2_850_000, source: 'salary', date: '2026-05-25', createdAt: '' },
    ]
    data.transactions = [
      { id: 't1', amountCents: 50_000, categoryId: 'cat-eating-out', date: '2026-06-01', createdAt: '' },
    ]
    reconcile(data, TODAY)

    const snap = data.snapshots[0]
    expect(snap.id).toBe('snap-x')
    expect(snap.incomeCents).toBe(2_850_000)
    expect(snap.spentByCategory['cat-eating-out']).toBe(50_000)
    expect(snap.swept).toBe(true)
    expect(snap.sweptCents).toBe(40_000)
    expect(snap.savedCents).toBe(40_000) // contributions (0) + preserved sweep
    expect(snap.createdAt).toBe('2026-06-25T00:00:00.000Z')
  })

  it('leaves data without a profile untouched', () => {
    const data = emptyAppData()
    expect(() => reconcile(data, TODAY)).not.toThrow()
  })
})
