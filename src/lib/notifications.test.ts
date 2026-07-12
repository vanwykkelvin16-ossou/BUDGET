import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  dueAlerts,
  type AlertInput,
} from './notifications'

function base(over: Partial<AlertInput> = {}): AlertInput {
  return {
    prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: true },
    today: '2026-07-12',
    hour: 12,
    cycleStart: '2026-06-25',
    isPayday: false,
    incomeCents: 5_500_000,
    leftOverCents: 100_000,
    loggedToday: false,
    streakCount: 0,
    streakAtRisk: false,
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
    })
    expect(dueAlerts(input)).toEqual([])
  })

  it('announces pay day once, with the amount', () => {
    const alerts = dueAlerts(base({ isPayday: true }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe('payday:2026-07-12')
    expect(alerts[0].body).toContain('R 55 000')
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
    expect(alerts[0].body).toContain('R 27 000')
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
    // Streak alert takes precedence — one nudge, not two.
    const both = dueAlerts(base({ hour: 19, streakAtRisk: true, streakCount: 3 }))
    expect(both).toHaveLength(1)
    expect(both[0].key).toBe('streak:2026-07-12')
  })

  it('respects individual preference switches', () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      enabled: true,
      overspendAlert: false,
      dailyReminder: false,
    }
    expect(dueAlerts(base({ prefs, leftOverCents: -5, hour: 20 }))).toEqual([])
  })
})
