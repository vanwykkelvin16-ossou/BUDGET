import { describe, expect, it } from 'vitest'
import { dueOccurrences, occurrenceKey } from './recurring'

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
    // Already materialised through 2026-06-01 → only July is due.
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
