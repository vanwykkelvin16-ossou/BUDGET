import { describe, expect, it } from 'vitest'
import type { AppData, RecurringItem } from '../data/types'
import { emptyAppData } from '../data/types'
import { DEFAULT_CATEGORIES, makeDefaultProfile } from '../data/defaults'
import {
  dueOccurrences,
  materializeAllRecurring,
  materializeRecurringItem,
  occurrenceKey,
  purgeRecurringLedgerEntries,
  recurringBackfillFrom,
  syncRecurringLedgerEntries,
} from './recurring'

describe('dueOccurrences', () => {
  it('returns one occurrence per month in the window', () => {
    expect(dueOccurrences({ dayOfMonth: 1, active: true }, '2026-04-25', '2026-07-09')).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ])
  })

  it('clamps day 31 into February', () => {
    expect(dueOccurrences({ dayOfMonth: 31, active: true }, '2026-01-15', '2026-03-15')).toEqual([
      '2026-01-31',
      '2026-02-28',
    ])
  })

  it('is exclusive of the from date (idempotent catch-up)', () => {
    expect(dueOccurrences({ dayOfMonth: 1, active: true }, '2026-06-01', '2026-07-09')).toEqual([
      '2026-07-01',
    ])
  })

  it('is inclusive of the to date', () => {
    expect(dueOccurrences({ dayOfMonth: 9, active: true }, '2026-06-09', '2026-07-09')).toEqual([
      '2026-07-09',
    ])
  })

  it('returns nothing for inactive items', () => {
    expect(dueOccurrences({ dayOfMonth: 1, active: false }, '2026-01-01', '2026-07-09')).toEqual([])
  })

  it('returns nothing when the window is empty or inverted', () => {
    expect(dueOccurrences({ dayOfMonth: 1, active: true }, '2026-07-09', '2026-07-09')).toEqual([])
    expect(dueOccurrences({ dayOfMonth: 1, active: true }, '2026-07-09', '2026-06-09')).toEqual([])
  })

  it('crosses year boundaries', () => {
    expect(dueOccurrences({ dayOfMonth: 25, active: true }, '2025-11-30', '2026-01-31')).toEqual([
      '2025-12-25',
      '2026-01-25',
    ])
  })
})

describe('occurrenceKey', () => {
  it('is deterministic', () => {
    expect(occurrenceKey('rec-1', '2026-07-01')).toBe('rec-1:2026-07-01')
  })
})

function salaryItem(id = 'rec-salary'): RecurringItem {
  return {
    id,
    kind: 'income',
    name: 'Salary',
    amountCents: 2_000_000,
    dayOfMonth: 25,
    source: 'salary',
    active: true,
    lastMaterialized: '2026-06-24',
    createdAt: '2026-06-25T00:00:00.000Z',
  }
}

function makeData(): AppData {
  return {
    ...emptyAppData(),
    profile: makeDefaultProfile({
      displayName: 'Test',
      surname: 'User',
      username: 'test',
      email: 't@test.com',
      phone: '0',
      salaryCents: 2_000_000,
      payDate: 25,
      nowISO: '2026-06-25T00:00:00.000Z',
    }),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    recurring: [salaryItem()],
  }
}

describe('materializeRecurringItem', () => {
  it('creates an income row on the due date', () => {
    const data = makeData()
    materializeRecurringItem(data, salaryItem(), '2026-06-24', '2026-06-25', '2026-06-25T09:00:00Z', () => 'i1')
    expect(data.incomes).toHaveLength(1)
    expect(data.incomes[0]).toMatchObject({
      amountCents: 2_000_000,
      source: 'salary',
      date: '2026-06-25',
      occurrenceKey: 'rec-salary:2026-06-25',
    })
  })

  it('backfills a due date earlier in the current cycle', () => {
    const data = makeData()
    data.recurring[0].dayOfMonth = 1
    data.recurring[0].lastMaterialized = recurringBackfillFrom('2026-06-25', '2026-06-25')
    materializeAllRecurring(data, '2026-07-11', '2026-07-11T09:00:00Z', () => 'i1')
    expect(data.incomes.some((i) => i.date === '2026-07-01')).toBe(true)
  })

  it('updates an existing row when the template changes', () => {
    const data = makeData()
    materializeRecurringItem(data, salaryItem(), '2026-06-24', '2026-06-25', 't1', () => 'i1')
    const item = data.recurring[0]
    item.amountCents = 2_500_000
    item.name = 'New salary'
    syncRecurringLedgerEntries(data, item)
    expect(data.incomes[0].amountCents).toBe(2_500_000)
    expect(data.incomes[0].note).toBe('New salary')
  })

  it('purges ledger rows when a template is deleted', () => {
    const data = makeData()
    materializeRecurringItem(data, salaryItem(), '2026-06-24', '2026-06-25', 't1', () => 'i1')
    purgeRecurringLedgerEntries(data, 'rec-salary')
    expect(data.incomes).toHaveLength(0)
  })
})
