/**
 * Scheduled reminders — OS-level notifications for the native apps.
 *
 * On iOS (App Store build) and Android (Play Store build) the weekly
 * budget check-in, the monthly budget planner and the Sunday recap are
 * registered with the operating system through Capacitor Local
 * Notifications, so they fire even when PennyPlay is fully closed:
 *
 *   · every Monday 08:00  — "time to budget this week"
 *   · every Sunday 17:00  — weekly recap / achievements nudge
 *   · every pay day 09:00 — "time to budget this month" (next 3 cycles,
 *     re-anchored on every app open so the chain never runs dry)
 *
 * `buildReminderPlan` is pure (unit-tested); `syncScheduledReminders`
 * applies the plan to the OS and is a no-op on the web, where the in-app
 * sweep in `notifications.ts` covers the same reminders instead.
 */

import type { LocalNotificationSchema, Weekday } from '@capacitor/local-notifications'
import type { NotificationPrefs } from './notifications'
import {
  ensureNotificationChannel,
  isNativeApp,
  NOTIFICATION_CHANNEL_ID,
} from './notifications'
import { parseISO } from './dates'
import { cycleFor, nextCycle } from './engine/cycle'

/**
 * Ids the OS-scheduled reminders own. `notificationIdForKey` in
 * notifications.ts stays below 2 000 000 000, so this range never collides
 * with sweep notifications.
 */
export const REMINDER_ID_BASE = 2_000_000_000
export const WEEKLY_BUDGET_ID = REMINDER_ID_BASE + 1
export const WEEKLY_RECAP_ID = REMINDER_ID_BASE + 2
export const MONTHLY_BUDGET_ID_BASE = REMINDER_ID_BASE + 10
/** How many upcoming pay days get a pre-scheduled monthly reminder. */
export const MONTHLY_OCCURRENCES = 3

export function isReminderId(id: number): boolean {
  return id >= REMINDER_ID_BASE
}

/** Capacitor weekday numbering: Sunday=1 … Saturday=7. */
const WEEKDAY_SUNDAY = 1
const WEEKDAY_MONDAY = 2

export type ReminderSchedule =
  | { kind: 'weekly'; weekday: number; hour: number; minute: number }
  | { kind: 'once'; date: string; hour: number; minute: number }

export interface ScheduledReminder {
  id: number
  title: string
  body: string
  schedule: ReminderSchedule
}

/** The next `count` cycle-start dates strictly after `today` (ISO). */
export function nextCycleStarts(today: string, payDate: number, count: number): string[] {
  const starts: string[] = []
  let cycle = cycleFor(today, payDate)
  for (let i = 0; i < count; i++) {
    starts.push(cycle.end) // a cycle's exclusive end is the next pay day
    cycle = nextCycle(cycle, payDate)
  }
  return starts
}

/** Pure: everything that should sit in the OS notification queue. */
export function buildReminderPlan(
  prefs: NotificationPrefs,
  payDate: number,
  today: string,
): ScheduledReminder[] {
  if (!prefs.enabled) return []
  const plan: ScheduledReminder[] = []

  if (prefs.weeklyBudgetReminder) {
    plan.push({
      id: WEEKLY_BUDGET_ID,
      title: '📅 Time to budget this week',
      body: "A fresh week is here. Check your Safe-to-Spend and plan the week's fun money.",
      schedule: { kind: 'weekly', weekday: WEEKDAY_MONDAY, hour: 8, minute: 0 },
    })
  }

  if (prefs.weeklyRecap) {
    plan.push({
      id: WEEKLY_RECAP_ID,
      title: '🌟 Your week in review',
      body: 'The week wraps up today — peek at your wins, claim quest XP and line up next week.',
      schedule: { kind: 'weekly', weekday: WEEKDAY_SUNDAY, hour: 17, minute: 0 },
    })
  }

  if (prefs.monthlyBudgetReminder) {
    nextCycleStarts(today, payDate, MONTHLY_OCCURRENCES).forEach((date, i) => {
      plan.push({
        id: MONTHLY_BUDGET_ID_BASE + i,
        title: '🗓️ Time to budget this month',
        body: 'A new budget month starts today. Set your plan, goals and Fun Fund before the money wanders off.',
        schedule: { kind: 'once', date, hour: 9, minute: 0 },
      })
    })
  }

  return plan
}

/* ------------------------------------------------------------------ */
/* Native glue                                                          */
/* ------------------------------------------------------------------ */

/** Remove every OS-scheduled reminder (data reset, demo mode). */
export async function cancelScheduledReminders(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    const ours = pending.notifications.filter((n) => isReminderId(n.id)).map((n) => ({ id: n.id }))
    if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours })
  } catch {
    /* best effort */
  }
}

/**
 * Reconcile the OS notification queue with the current preferences.
 * Idempotent and cheap — safe to call on boot, on preference changes and
 * whenever the pay date moves. No-op on the web.
 */
export async function syncScheduledReminders(
  prefs: NotificationPrefs,
  payDate: number,
  today: string,
): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    // Clear whatever we scheduled before; the plan below is the new truth.
    const pending = await LocalNotifications.getPending()
    const stale = pending.notifications.filter((n) => isReminderId(n.id)).map((n) => ({ id: n.id }))
    if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale })

    const granted = (await LocalNotifications.checkPermissions()).display === 'granted'
    if (!granted) return

    await ensureNotificationChannel()

    const now = new Date()
    const notifications = buildReminderPlan(prefs, payDate, today).flatMap<LocalNotificationSchema>((reminder) => {
      const base = {
        id: reminder.id,
        title: reminder.title,
        body: reminder.body,
        channelId: NOTIFICATION_CHANNEL_ID,
      }
      if (reminder.schedule.kind === 'weekly') {
        return [
          {
            ...base,
            schedule: {
              on: {
                weekday: reminder.schedule.weekday as Weekday,
                hour: reminder.schedule.hour,
                minute: reminder.schedule.minute,
              },
              allowWhileIdle: true,
            },
          },
        ]
      }
      const { y, m, d } = parseISO(reminder.schedule.date)
      const at = new Date(y, m - 1, d, reminder.schedule.hour, reminder.schedule.minute, 0, 0)
      if (at.getTime() <= now.getTime()) return []
      return [{ ...base, schedule: { at, allowWhileIdle: true } }]
    })

    if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
  } catch {
    /* scheduling is best-effort — the in-app sweep still covers reminders */
  }
}
