import { describe, expect, it } from 'vitest'
import {
  cycleFor,
  daysElapsed,
  daysInCycle,
  daysRemaining,
  inCycle,
  nextCycle,
  prevCycle,
} from './cycle'

describe('cycleFor', () => {
  it('mid-cycle date falls in the cycle started by the previous pay day', () => {
    expect(cycleFor('2026-07-09', 25)).toEqual({ start: '2026-06-25', end: '2026-07-25' })
  })

  it('pay day itself starts a new cycle', () => {
    expect(cycleFor('2026-07-25', 25)).toEqual({ start: '2026-07-25', end: '2026-08-25' })
  })

  it('day before pay day belongs to the old cycle', () => {
    expect(cycleFor('2026-07-24', 25)).toEqual({ start: '2026-06-25', end: '2026-07-25' })
  })

  it('wraps across year boundaries', () => {
    expect(cycleFor('2026-01-10', 25)).toEqual({ start: '2025-12-25', end: '2026-01-25' })
    expect(cycleFor('2025-12-26', 25)).toEqual({ start: '2025-12-25', end: '2026-01-25' })
  })

  it('supports pay date 1 (calendar months)', () => {
    expect(cycleFor('2026-07-09', 1)).toEqual({ start: '2026-07-01', end: '2026-08-01' })
    expect(cycleFor('2026-07-01', 1)).toEqual({ start: '2026-07-01', end: '2026-08-01' })
  })

  it('clamps pay date 31 into short months', () => {
    // Mid-Feb: cycle started 31 Jan, ends on Feb's last day.
    expect(cycleFor('2026-02-15', 31)).toEqual({ start: '2026-01-31', end: '2026-02-28' })
    // On 28 Feb (non-leap) the clamped pay day starts a new cycle.
    expect(cycleFor('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-31' })
    // Leap year: 29 Feb is the clamped pay day.
    expect(cycleFor('2028-02-29', 31)).toEqual({ start: '2028-02-29', end: '2028-03-31' })
    expect(cycleFor('2028-02-28', 31)).toEqual({ start: '2028-01-31', end: '2028-02-29' })
  })

  it('clamps pay date 30 in February', () => {
    expect(cycleFor('2026-03-15', 30)).toEqual({ start: '2026-02-28', end: '2026-03-30' })
  })
})

describe('cycle navigation', () => {
  const cycle = cycleFor('2026-07-09', 25)

  it('prevCycle steps back one pay period', () => {
    expect(prevCycle(cycle, 25)).toEqual({ start: '2026-05-25', end: '2026-06-25' })
  })

  it('nextCycle steps forward one pay period', () => {
    expect(nextCycle(cycle, 25)).toEqual({ start: '2026-07-25', end: '2026-08-25' })
  })

  it('prev/next round-trip', () => {
    expect(nextCycle(prevCycle(cycle, 25), 25)).toEqual(cycle)
  })

  it('navigation stays consistent through clamped months', () => {
    const feb = cycleFor('2026-02-15', 31) // 2026-01-31 → 2026-02-28
    expect(nextCycle(feb, 31)).toEqual({ start: '2026-02-28', end: '2026-03-31' })
    expect(prevCycle(feb, 31)).toEqual({ start: '2025-12-31', end: '2026-01-31' })
  })
})

describe('cycle measurements', () => {
  const cycle = { start: '2026-06-25', end: '2026-07-25' }

  it('daysInCycle', () => {
    expect(daysInCycle(cycle)).toBe(30)
  })

  it('daysRemaining counts today as remaining', () => {
    expect(daysRemaining('2026-06-25', cycle)).toBe(30)
    expect(daysRemaining('2026-07-24', cycle)).toBe(1) // last day
    expect(daysRemaining('2026-07-25', cycle)).toBe(0) // cycle over
  })

  it('daysElapsed', () => {
    expect(daysElapsed('2026-06-25', cycle)).toBe(0)
    expect(daysElapsed('2026-07-09', cycle)).toBe(14)
  })

  it('inCycle is a half-open interval', () => {
    expect(inCycle('2026-06-25', cycle)).toBe(true)
    expect(inCycle('2026-07-24', cycle)).toBe(true)
    expect(inCycle('2026-07-25', cycle)).toBe(false)
    expect(inCycle('2026-06-24', cycle)).toBe(false)
  })
})
