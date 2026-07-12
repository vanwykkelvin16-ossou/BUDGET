/**
 * Notifications — real system notifications, no server needed.
 *
 * A pure decision engine (`dueAlerts`) figures out what deserves a nudge
 * (pay day, overspend, streak rescue, evening log reminder); the browser
 * glue asks permission and shows notifications through the service worker
 * (falling back to the Notification API). Preferences and a sent-registry
 * live in localStorage — notification settings are per-device by nature.
 *
 * Alerts fire while the app is open or installed as a PWA. True remote
 * push (app fully closed) needs a push server and stays on the roadmap.
 */

import type { AppData } from './data/types'
import { TZ, todaySAST } from './dates'
import { cycleFor } from './engine/cycle'
import {
  contributionsInCycle,
  incomesInCycle,
  spentByBucket,
  spentByCategory,
  sumCents,
} from './engine/insights'
import { displayStreak } from './gamification/streaks'
import { formatRands } from './money'

export interface NotificationPrefs {
  enabled: boolean
  /** Evening reminder to log the day's spending. */
  dailyReminder: boolean
  /** "Money landed" on the first day of the cycle. */
  paydayAlert: boolean
  /** More money out than in this cycle. */
  overspendAlert: boolean
  /** Streak about to break and nothing logged yet. */
  streakAlert: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  dailyReminder: true,
  paydayAlert: true,
  overspendAlert: true,
  streakAlert: true,
}

const PREFS_KEY = 'pennyplay:notify-prefs:v1'
const SENT_KEY = 'pennyplay:notify-sent:v1'

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_NOTIFICATION_PREFS
    return { ...DEFAULT_NOTIFICATION_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) }
  } catch {
    return DEFAULT_NOTIFICATION_PREFS
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — prefs stay in memory */
  }
}

/** One alert the app wants to show. `key` dedupes repeats. */
export interface AppAlert {
  key: string
  title: string
  body: string
}

export interface AlertInput {
  prefs: NotificationPrefs
  /** Business day (SAST, ISO). */
  today: string
  /** SAST hour 0–23. */
  hour: number
  /** First day of the current cycle (dedupes overspend to once a cycle). */
  cycleStart: string
  isPayday: boolean
  incomeCents: number
  /** income − all spending − savings this cycle; negative = overspent. */
  leftOverCents: number
  loggedToday: boolean
  streakCount: number
  streakAtRisk: boolean
  alreadySent: (key: string) => boolean
}

/** Pure: which alerts are due right now. */
export function dueAlerts(input: AlertInput): AppAlert[] {
  const { prefs, today, hour, alreadySent } = input
  if (!prefs.enabled) return []
  const alerts: AppAlert[] = []

  if (prefs.paydayAlert && input.isPayday && input.incomeCents > 0) {
    const key = `payday:${today}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '💰 Pay day!',
        body: `${formatRands(input.incomeCents)} landed. PennyPlay split it into your plan — go see your fun money.`,
      })
    }
  }

  if (prefs.overspendAlert && input.leftOverCents < 0) {
    const key = `overspend:${input.cycleStart}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '🚨 More out than in',
        body: `${formatRands(-input.leftOverCents)} more went out than came in this month. Fun money is paused.`,
      })
    }
  }

  const streakDue =
    prefs.streakAlert &&
    input.streakAtRisk &&
    input.streakCount > 0 &&
    !input.loggedToday &&
    hour >= 17
  if (streakDue) {
    const key = `streak:${today}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: `🔥 ${input.streakCount}-day streak at risk`,
        body: 'Log one thing today — even "no spending" counts — and the flame lives on.',
      })
    }
  }

  // The generic evening nudge stands down when the streak alert already asks
  // for the same action.
  if (prefs.dailyReminder && !input.loggedToday && hour >= 19 && !streakDue) {
    const key = `daily:${today}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '📝 Quick money check-in',
        body: "Log today's spending — it takes ten seconds and keeps your numbers true.",
      })
    }
  }

  return alerts
}

/* ------------------------------------------------------------------ */
/* Browser glue                                                         */
/* ------------------------------------------------------------------ */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Ask for permission if still undecided. True when granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function showSystemNotification(alert: AppAlert): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const options: NotificationOptions = {
    body: alert.body,
    tag: alert.key,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(alert.title, options)
      return true
    }
  } catch {
    /* fall through to the bare API */
  }
  try {
    new Notification(alert.title, options)
    return true
  } catch {
    return false
  }
}

function loadSent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function markSent(key: string, today: string): void {
  try {
    const sent = loadSent()
    sent[key] = today
    // Keep the registry small: drop entries older than ~6 weeks.
    for (const [k, date] of Object.entries(sent)) {
      if (date < today && diffISO(date, today) > 42) delete sent[k]
    }
    localStorage.setItem(SENT_KEY, JSON.stringify(sent))
  } catch {
    /* best effort */
  }
}

function diffISO(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

function sastHour(now: Date): number {
  return Number.parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now),
    10,
  )
}

/**
 * Check the ledger and show anything that's due. Cheap and idempotent —
 * safe to call on every data change, focus and timer tick.
 */
export async function runNotificationSweep(data: AppData, now: Date = new Date()): Promise<void> {
  const profile = data.profile
  if (!profile || profile.isDemo) return
  const prefs = loadNotificationPrefs()
  if (!prefs.enabled || notificationPermission() !== 'granted') return

  const today = todaySAST(now)
  const cycle = cycleFor(today, profile.payDate)
  const incomeCents = sumCents(incomesInCycle(data.incomes, cycle))
  const spent = spentByBucket(spentByCategory(data.transactions, cycle), data.categories)
  const savedCents = sumCents(contributionsInCycle(data.contributions, cycle))
  const leftOverCents = incomeCents - (spent.need + spent.want) - savedCents
  const loggedToday =
    data.transactions.some((t) => t.date === today) ||
    data.incomes.some((i) => i.date === today) ||
    data.xpEvents.some((e) => e.reason === 'no_spend_day' && e.date === today)
  const streak = displayStreak(profile, today)

  const sent = loadSent()
  const alerts = dueAlerts({
    prefs,
    today,
    hour: sastHour(now),
    cycleStart: cycle.start,
    isPayday: cycle.start === today,
    incomeCents,
    leftOverCents,
    loggedToday,
    streakCount: streak.count,
    streakAtRisk: streak.atRisk && !streak.aliveToday,
    alreadySent: (key) => key in sent,
  })

  for (const alert of alerts) {
    if (await showSystemNotification(alert)) markSent(alert.key, today)
  }
}
