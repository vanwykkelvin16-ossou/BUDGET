import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from './notifications'
import {
  buildReminderPlan,
  isReminderId,
  MONTHLY_BUDGET_ID_BASE,
  MONTHLY_OCCURRENCES,
  nextCycleStarts,
  WEEKLY_BUDGET_ID,
  WEEKLY_RECAP_ID,
} from './reminders'

const on: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, enabled: true }

describe('nextCycleStarts', () => {
  it('returns the next pay days strictly after today', () => {
    expect(nextCycleStarts('2026-07-12', 25, 3)).toEqual([
      '2026-07-25',
      '2026-08-25',
      '2026-09-25',
    ])
  })

  it('skips today even when today is a pay day', () => {
    expect(nextCycleStarts('2026-07-25', 25, 2)).toEqual(['2026-08-25', '2026-09-25'])
  })

  it('clamps pay date 31 to short months', () => {
    expect(nextCycleStarts('2026-01-15', 31, 3)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })

  it('handles the year boundary', () => {
    expect(nextCycleStarts('2026-11-30', 25, 2)).toEqual(['2026-12-25', '2027-01-25'])
  })
})

describe('buildReminderPlan', () => {
  it('is empty when notifications are disabled', () => {
    expect(buildReminderPlan(DEFAULT_NOTIFICATION_PREFS, 25, '2026-07-12')).toEqual([])
  })

  it('schedules the weekly check-in (Mon), recap (Sun) and rolling monthly reminders', () => {
    const plan = buildReminderPlan(on, 25, '2026-07-12')
    expect(plan).toHaveLength(2 + MONTHLY_OCCURRENCES)

    const weekly = plan.find((r) => r.id === WEEKLY_BUDGET_ID)
    expect(weekly?.title).toContain('budget this week')
    expect(weekly?.schedule).toEqual({ kind: 'weekly', weekday: 2, hour: 8, minute: 0 })

    const recap = plan.find((r) => r.id === WEEKLY_RECAP_ID)
    expect(recap?.title).toContain('week in review')
    expect(recap?.schedule).toEqual({ kind: 'weekly', weekday: 1, hour: 17, minute: 0 })

    const monthly = plan.filter((r) => r.id >= MONTHLY_BUDGET_ID_BASE)
    expect(monthly.map((r) => r.schedule)).toEqual([
      { kind: 'once', date: '2026-07-25', hour: 9, minute: 0 },
      { kind: 'once', date: '2026-08-25', hour: 9, minute: 0 },
      { kind: 'once', date: '2026-09-25', hour: 9, minute: 0 },
    ])
    expect(monthly.every((r) => r.title.includes('budget this month'))).toBe(true)
  })

  it('respects the individual preference switches', () => {
    const noWeekly = buildReminderPlan({ ...on, weeklyBudgetReminder: false }, 25, '2026-07-12')
    expect(noWeekly.some((r) => r.id === WEEKLY_BUDGET_ID)).toBe(false)

    const noRecap = buildReminderPlan({ ...on, weeklyRecap: false }, 25, '2026-07-12')
    expect(noRecap.some((r) => r.id === WEEKLY_RECAP_ID)).toBe(false)

    const noMonthly = buildReminderPlan({ ...on, monthlyBudgetReminder: false }, 25, '2026-07-12')
    expect(noMonthly.some((r) => r.id >= MONTHLY_BUDGET_ID_BASE)).toBe(false)
  })

  it('follows a changed pay date', () => {
    const plan = buildReminderPlan(on, 1, '2026-07-12')
    const monthly = plan.filter((r) => r.id >= MONTHLY_BUDGET_ID_BASE)
    expect(monthly[0].schedule).toEqual({ kind: 'once', date: '2026-08-01', hour: 9, minute: 0 })
  })

  it('keeps ids inside the reserved reminder range', () => {
    for (const reminder of buildReminderPlan(on, 25, '2026-07-12')) {
      expect(isReminderId(reminder.id)).toBe(true)
    }
  })
})
