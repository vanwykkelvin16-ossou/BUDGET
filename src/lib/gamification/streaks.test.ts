import { describe, expect, it } from 'vitest'
import { advanceStreak, displayStreak } from './streaks'

const base = {
  streakCount: 0,
  longestStreak: 0,
  streakFreezes: 0,
  lastLogDate: null as string | null,
  lastFreezeEarnedMonth: null as string | null,
}

describe('advanceStreak', () => {
  it('starts at 1 on the first ever log', () => {
    const r = advanceStreak(base, '2026-07-09')
    expect(r.streakCount).toBe(1)
    expect(r.lastLogDate).toBe('2026-07-09')
  })

  it('increments on consecutive days', () => {
    const r = advanceStreak(
      { ...base, streakCount: 5, longestStreak: 5, lastLogDate: '2026-07-08' },
      '2026-07-09',
    )
    expect(r.streakCount).toBe(6)
    expect(r.longestStreak).toBe(6)
  })

  it('does nothing when logging twice on the same day', () => {
    const r = advanceStreak(
      { ...base, streakCount: 5, longestStreak: 9, lastLogDate: '2026-07-09' },
      '2026-07-09',
    )
    expect(r.streakCount).toBe(5)
    expect(r.usedFreeze).toBe(false)
  })

  it('consumes a freeze to bridge one missed day', () => {
    const r = advanceStreak(
      { ...base, streakCount: 10, longestStreak: 10, streakFreezes: 1, lastLogDate: '2026-07-07' },
      '2026-07-09', // missed the 8th
    )
    expect(r.streakCount).toBe(11)
    expect(r.streakFreezes).toBe(0)
    expect(r.usedFreeze).toBe(true)
  })

  it('resets without a freeze', () => {
    const r = advanceStreak(
      { ...base, streakCount: 10, longestStreak: 10, lastLogDate: '2026-07-07' },
      '2026-07-09',
    )
    expect(r.streakCount).toBe(1)
    expect(r.longestStreak).toBe(10)
  })

  it('resets after two missed days even with a freeze', () => {
    const r = advanceStreak(
      { ...base, streakCount: 10, longestStreak: 10, streakFreezes: 2, lastLogDate: '2026-07-05' },
      '2026-07-09',
    )
    expect(r.streakCount).toBe(1)
    expect(r.streakFreezes).toBe(2) // not wasted
  })

  it('earns a freeze at each 7-day milestone, once per month', () => {
    const hit7 = advanceStreak(
      { ...base, streakCount: 6, longestStreak: 6, lastLogDate: '2026-07-08' },
      '2026-07-09',
    )
    expect(hit7.streakCount).toBe(7)
    expect(hit7.earnedFreeze).toBe(true)
    expect(hit7.streakFreezes).toBe(1)
    expect(hit7.lastFreezeEarnedMonth).toBe('2026-07')

    // Reaching 14 in the same month earns nothing more.
    const hit14 = advanceStreak(
      {
        ...base,
        streakCount: 13,
        longestStreak: 13,
        streakFreezes: 1,
        lastLogDate: '2026-07-15',
        lastFreezeEarnedMonth: '2026-07',
      },
      '2026-07-16',
    )
    expect(hit14.streakCount).toBe(14)
    expect(hit14.earnedFreeze).toBe(false)

    // A milestone in the next month earns again.
    const hit21 = advanceStreak(
      {
        ...base,
        streakCount: 20,
        longestStreak: 20,
        streakFreezes: 1,
        lastLogDate: '2026-07-31',
        lastFreezeEarnedMonth: '2026-07',
      },
      '2026-08-01',
    )
    expect(hit21.earnedFreeze).toBe(true)
    expect(hit21.streakFreezes).toBe(2)
  })

  it('caps held freezes at the maximum', () => {
    const r = advanceStreak(
      {
        ...base,
        streakCount: 6,
        longestStreak: 20,
        streakFreezes: 2,
        lastLogDate: '2026-07-08',
      },
      '2026-07-09',
    )
    expect(r.streakCount).toBe(7)
    expect(r.earnedFreeze).toBe(false)
    expect(r.streakFreezes).toBe(2)
  })
})

describe('displayStreak', () => {
  it('alive when logged today', () => {
    expect(
      displayStreak({ streakCount: 8, lastLogDate: '2026-07-09', streakFreezes: 0 }, '2026-07-09'),
    ).toEqual({ count: 8, aliveToday: true, atRisk: false })
  })

  it('at risk when last log was yesterday', () => {
    expect(
      displayStreak({ streakCount: 8, lastLogDate: '2026-07-08', streakFreezes: 0 }, '2026-07-09'),
    ).toEqual({ count: 8, aliveToday: false, atRisk: true })
  })

  it('shows zero when the streak is already dead', () => {
    expect(
      displayStreak({ streakCount: 8, lastLogDate: '2026-07-05', streakFreezes: 0 }, '2026-07-09'),
    ).toEqual({ count: 0, aliveToday: false, atRisk: false })
  })
})
