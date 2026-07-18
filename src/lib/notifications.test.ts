import { describe, expect, it } from 'vitest'
import { formatRands } from './money'
import {
  DEFAULT_NOTIFICATION_PREFS,
  dueAlerts,
  notificationIdForKey,
  type AlertInput,
} from './notifications'

function base(over: Partial<AlertInput> = {}): AlertInput {
  return {
    prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    // Mid-week by default; the weekday-sensitive tests override these.
    today: '2026-07-12',
    hour: 12,
    dayOfWeek: 2,
    weekStart: '2026-07-06',
    cycleStart: '2026-06-25',
    scheduledNatively: false,
    isPayday: false,
    incomeCents: 5_500_000,
    leftOverCents: 100_000,
    loggedToday: false,
    streakCount: 0,
    streakAtRisk: false,
    newBadges: [],
    achievedGoals: [],
    levelUp: null,
    alreadySent: () => false,
    ...over,
  }
}

describe('dueAlerts', () => {
  it('is silent when the master switch is off', () => {
    const input = base({
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: false },
      isPayday: true,
      leftOverCents: -1,
      hour: 20,
      dayOfWeek: 0,
      newBadges: [{ id: 'streak-7', name: '7-Day Streak', emoji: '🔥' }],
    })
    expect(dueAlerts(input)).toEqual([])
  })

  it('announces pay day once, with the amount', () => {
    const alerts = dueAlerts(base({ isPayday: true }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('payday:2026-07-12')
    expect(alerts[0].body).toContain(formatRands(5_500_000))
    // Second sweep the same day: already sent → nothing.
    expect(
      dueAlerts(base({ isPayday: true, alreadySent: (k) => k === 'payday:2026-07-12' })),
    ).toEqual([])
  })

  it('skips pay day when no income actually landed', () => {
    expect(dueAlerts(base({ isPayday: true, incomeCents: 0 }))).toEqual([])
  })

  it('warns about overspending once per cycle', () => {
    const alerts = dueAlerts(base({ leftOverCents: -2_700_000 }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('overspend:2026-06-25')
    expect(alerts[0].body).toContain(formatRands(2_700_000))
    expect(
      dueAlerts(base({ leftOverCents: -2_700_000, alreadySent: (k) => k.startsWith('overspend') })),
    ).toEqual([])
  })

  it('rescues a streak in the late afternoon only when nothing is logged', () => {
    const due = base({ streakAtRisk: true, streakCount: 6, hour: 18 })
    const alerts = dueAlerts(due)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].title).toContain('6-day streak')
    // Too early, already logged, or no streak → silent.
    expect(dueAlerts({ ...due, hour: 14 })).toEqual([])
    expect(dueAlerts({ ...due, loggedToday: true })).toEqual([])
    expect(dueAlerts({ ...due, streakCount: 0 })).toEqual([])
  })

  it('sends the evening log reminder at 19:00, unless the streak alert already asks', () => {
    expect(dueAlerts(base({ hour: 18 }))).toEqual([])
    const reminder = dueAlerts(base({ hour: 19 }))
    expect(reminder).toHaveLength(1)
    expect(reminder[0].key).toBe('daily:2026-07-12')
    // Streak alert takes precedence — one action nudge, not two.
    const both = dueAlerts(base({ hour: 19, streakAtRisk: true, streakCount: 3 }))
    expect(both).toHaveLength(1)
    expect(both[0].key).toBe('streak:2026-07-12')
  })

  it('nudges the weekly budget on Monday mornings, once per week', () => {
    const monday = base({ today: '2026-07-06', dayOfWeek: 0, weekStart: '2026-07-06' })
    const alerts = dueAlerts(monday)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('weekly-budget:2026-07-06')
    expect(alerts[0].title).toContain('budget this week')
    // Too early, wrong day, or already sent → silent.
    expect(dueAlerts({ ...monday, hour: 6 })).toEqual([])
    expect(dueAlerts({ ...monday, dayOfWeek: 3 })).toEqual([])
    expect(dueAlerts({ ...monday, alreadySent: (k) => k.startsWith('weekly-budget') })).toEqual([])
    // Preference off → silent.
    expect(
      dueAlerts({
        ...monday,
        prefs: { ...monday.prefs, weeklyBudgetReminder: false },
      }),
    ).toEqual([])
  })

  it('nudges the monthly budget on the first day of the cycle', () => {
    const cycleStartDay = base({
      today: '2026-06-25',
      dayOfWeek: 3,
      weekStart: '2026-06-22',
      cycleStart: '2026-06-25',
    })
    const alerts = dueAlerts(cycleStartDay)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('monthly-budget:2026-06-25')
    expect(alerts[0].title).toContain('budget this month')
    // Not the cycle start / too early / already sent → silent.
    expect(dueAlerts({ ...cycleStartDay, today: '2026-06-26' })).toEqual([])
    expect(dueAlerts({ ...cycleStartDay, hour: 5 })).toEqual([])
    expect(
      dueAlerts({ ...cycleStartDay, alreadySent: (k) => k.startsWith('monthly-budget') }),
    ).toEqual([])
  })

  it('lets the pay-day alert stand in for the monthly reminder when both are due', () => {
    const both = dueAlerts(
      base({
        today: '2026-06-25',
        dayOfWeek: 3,
        weekStart: '2026-06-22',
        cycleStart: '2026-06-25',
        isPayday: true,
      }),
    )
    expect(both).toHaveLength(1)
    expect(both[0].key).toBe('payday:2026-06-25')
    // Pay day already sent on an earlier sweep → the monthly reminder fires.
    const later = dueAlerts(
      base({
        today: '2026-06-25',
        dayOfWeek: 3,
        weekStart: '2026-06-22',
        cycleStart: '2026-06-25',
        isPayday: true,
        alreadySent: (k) => k.startsWith('payday'),
      }),
    )
    expect(later.map((a) => a.key)).toEqual(['monthly-budget:2026-06-25'])
  })

  it('sends the Sunday recap in the evening, once per week', () => {
    const sunday = base({ hour: 17, dayOfWeek: 6 })
    const alerts = dueAlerts(sunday)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('recap:2026-07-06')
    expect(dueAlerts({ ...sunday, hour: 12 })).toEqual([])
    expect(dueAlerts({ ...sunday, dayOfWeek: 4 })).toEqual([])
    expect(dueAlerts({ ...sunday, alreadySent: (k) => k.startsWith('recap') })).toEqual([])
  })

  it('suppresses weekly/monthly/recap in the sweep when the OS schedules them', () => {
    const native = base({
      scheduledNatively: true,
      today: '2026-07-06',
      dayOfWeek: 0,
      weekStart: '2026-07-06',
      cycleStart: '2026-07-06',
      hour: 18,
    })
    expect(dueAlerts(native).map((a) => a.key)).toEqual([])
    // Data-driven alerts still fire on native — they cannot be pre-scheduled.
    const nativeOverspend = dueAlerts({ ...native, leftOverCents: -5_000 })
    expect(nativeOverspend.map((a) => a.key)).toEqual(['overspend:2026-07-06'])
  })

  it('celebrates fresh badges, achieved goals and level-ups once each', () => {
    const input = base({
      newBadges: [{ id: 'streak-7', name: '7-Day Streak', emoji: '🔥' }],
      achievedGoals: [{ id: 'g1', name: 'Emergency fund', emoji: '🛟' }],
      levelUp: { level: 5, rank: 'Coin Collector' },
    })
    const alerts = dueAlerts(input)
    expect(alerts.map((a) => a.key)).toEqual(['badge:streak-7', 'goal-done:g1', 'level:5'])
    expect(alerts[0].title).toContain('Achievement unlocked')
    expect(alerts[1].title).toContain('Goal achieved')
    expect(alerts[2].title).toContain('Level 5')
    // Already sent → silent; preference off → silent.
    expect(
      dueAlerts({
        ...input,
        alreadySent: (k) =>
          k.startsWith('badge:') || k.startsWith('goal-done:') || k.startsWith('level:'),
      }),
    ).toEqual([])
    expect(
      dueAlerts({ ...input, prefs: { ...input.prefs, achievementAlerts: false } }),
    ).toEqual([])
  })
})

describe('notificationIdForKey', () => {
  it('is deterministic and stays clear of the scheduled-reminder id range', () => {
    const id = notificationIdForKey('payday:2026-07-12')
    expect(id).toBe(notificationIdForKey('payday:2026-07-12'))
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThanOrEqual(0)
    expect(id).toBeLessThan(2_000_000_000)
    expect(notificationIdForKey('a')).not.toBe(notificationIdForKey('b'))
  })
})
