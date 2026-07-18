/**
 * Notifications — real system notifications, no server needed.
 *
 * A pure decision engine (`dueAlerts`) figures out what deserves a nudge
 * (weekly budgeting, monthly budgeting, achievements, pay day, overspend,
 * streak rescue, evening log reminder); the platform glue asks permission
 * and shows notifications through Capacitor Local Notifications on iOS /
 * Android (App Store & Play Store builds) or the service worker /
 * Notification API on the web. Preferences and a sent-registry live in
 * localStorage — notification settings are per-device by nature.
 *
 * On the native apps, the weekly / monthly budget reminders and the weekly
 * recap are additionally pre-scheduled with the OS (see `reminders.ts`), so
 * they land even when the app is fully closed. On the web they fire from
 * the in-app sweep while PennyPlay is open or installed as a PWA.
 */

import { Capacitor } from '@capacitor/core'
import type { AppData } from './data/types'
import { TZ, dayOfWeekMon, todaySAST, weekBounds } from './dates'
import { cycleFor } from './engine/cycle'
import {
  contributionsInCycle,
  incomesInCycle,
  spentByBucket,
  spentByCategory,
  sumCents,
} from './engine/insights'
import { BADGE_DEFS } from './gamification/badges'
import { levelForXp, rankForLevel } from './gamification/levels'
import { displayStreak } from './gamification/streaks'
import { totalXp } from './gamification/xp'
import { formatRands } from './money'

export interface NotificationPrefs {
  enabled: boolean
  /** Monday call-to-action: plan this week's budget. */
  weeklyBudgetReminder: boolean
  /** New-cycle call-to-action: plan this month's budget. */
  monthlyBudgetReminder: boolean
  /** Sunday evening recap of the week's wins. */
  weeklyRecap: boolean
  /** Badges earned, goals achieved, levels reached. */
  achievementAlerts: boolean
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
  weeklyBudgetReminder: true,
  monthlyBudgetReminder: true,
  weeklyRecap: true,
  achievementAlerts: true,
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

/** An achievement freshly unlocked today (badge, goal or level). */
export interface AchievementInput {
  /** Stable dedupe id, e.g. the badge id or goal id. */
  id: string
  name: string
  emoji: string
}

export interface AlertInput {
  prefs: NotificationPrefs
  /** Business day (SAST, ISO). */
  today: string
  /** SAST hour 0–23. */
  hour: number
  /** Monday-based day index for `today`: Mon=0 … Sun=6. */
  dayOfWeek: number
  /** Monday of the week containing `today` (dedupes weekly alerts). */
  weekStart: string
  /** First day of the current cycle (dedupes overspend to once a cycle). */
  cycleStart: string
  /**
   * True when the OS already delivers the weekly / monthly / recap
   * reminders as pre-scheduled local notifications (native app), so the
   * in-app sweep must not double them up.
   */
  scheduledNatively: boolean
  isPayday: boolean
  incomeCents: number
  /** income − all spending − savings this cycle; negative = overspent. */
  leftOverCents: number
  loggedToday: boolean
  streakCount: number
  streakAtRisk: boolean
  /** Badges earned today. */
  newBadges: AchievementInput[]
  /** Goals fully funded today. */
  achievedGoals: AchievementInput[]
  /** Level crossed today, if any. */
  levelUp: { level: number; rank: string } | null
  alreadySent: (key: string) => boolean
}

/** Pure: which alerts are due right now. */
export function dueAlerts(input: AlertInput): AppAlert[] {
  const { prefs, today, hour, alreadySent } = input
  if (!prefs.enabled) return []
  const alerts: AppAlert[] = []

  /* --- Achievements: badges, goals, level-ups earned today ---------- */
  if (prefs.achievementAlerts) {
    for (const badge of input.newBadges) {
      const key = `badge:${badge.id}`
      if (!alreadySent(key)) {
        alerts.push({
          key,
          title: `${badge.emoji} Achievement unlocked!`,
          body: `You earned the ${badge.name} badge. It's waiting in your trophy cabinet.`,
        })
      }
    }
    for (const goal of input.achievedGoals) {
      const key = `goal-done:${goal.id}`
      if (!alreadySent(key)) {
        alerts.push({
          key,
          title: '🎉 Goal achieved!',
          body: `${goal.emoji} ${goal.name} is fully funded. That's how it's done.`,
        })
      }
    }
    if (input.levelUp) {
      const key = `level:${input.levelUp.level}`
      if (!alreadySent(key)) {
        alerts.push({
          key,
          title: `⬆️ Level ${input.levelUp.level} reached!`,
          body: `You're now ${input.levelUp.rank}. Check your profile for new unlocks.`,
        })
      }
    }
  }

  /* --- Pay day ------------------------------------------------------- */
  let paydayInBatch = false
  if (prefs.paydayAlert && input.isPayday && input.incomeCents > 0) {
    const key = `payday:${today}`
    if (!alreadySent(key)) {
      paydayInBatch = true
      alerts.push({
        key,
        title: '💰 Pay day!',
        body: `${formatRands(input.incomeCents)} landed. PennyPlay split it into your plan — go see your fun money.`,
      })
    }
  }

  /* --- Monthly budget reminder (new cycle) ---------------------------- */
  // The pay-day alert already calls the user into their new plan, so the
  // monthly reminder stands down when both land in the same sweep.
  const monthlyDue =
    prefs.monthlyBudgetReminder &&
    !input.scheduledNatively &&
    today === input.cycleStart &&
    hour >= 8 &&
    !paydayInBatch
  if (monthlyDue) {
    const key = `monthly-budget:${input.cycleStart}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '🗓️ Time to budget this month',
        body: 'A new budget month starts today. Set your plan, goals and Fun Fund before the money wanders off.',
      })
    }
  }

  /* --- Weekly budget reminder (Monday) -------------------------------- */
  if (prefs.weeklyBudgetReminder && !input.scheduledNatively && input.dayOfWeek === 0 && hour >= 8) {
    const key = `weekly-budget:${input.weekStart}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '📅 Time to budget this week',
        body: "A fresh week is here. Check your Safe-to-Spend and plan the week's fun money.",
      })
    }
  }

  /* --- Weekly recap (Sunday evening) ----------------------------------- */
  if (prefs.weeklyRecap && !input.scheduledNatively && input.dayOfWeek === 6 && hour >= 17) {
    const key = `recap:${input.weekStart}`
    if (!alreadySent(key)) {
      alerts.push({
        key,
        title: '🌟 Your week in review',
        body: 'The week wraps up today — peek at your wins, claim quest XP and line up next week.',
      })
    }
  }

  /* --- Overspend ------------------------------------------------------- */
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

  /* --- Streak rescue / evening log reminder ----------------------------- */
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
/* Platform glue (native app ↔ web)                                     */
/* ------------------------------------------------------------------ */

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

async function nativePlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications
}

/** Android notification channel shared by nudges and scheduled reminders. */
export const NOTIFICATION_CHANNEL_ID = 'pennyplay-reminders'

let channelReady = false

/** Idempotent: make sure the Android channel exists before posting to it. */
export async function ensureNotificationChannel(): Promise<void> {
  if (channelReady || Capacitor.getPlatform() !== 'android') return
  try {
    await (await nativePlugin()).createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'Budget reminders',
      description: 'Weekly and monthly budgeting reminders and achievement alerts',
      importance: 4,
    })
    channelReady = true
  } catch {
    /* best effort — Android falls back to the default channel */
  }
}

export function notificationsSupported(): boolean {
  if (isNativeApp()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

export type PermissionSnapshot = 'granted' | 'denied' | 'prompt' | 'unsupported'

/** Current permission on either platform. */
export async function getNotificationPermission(): Promise<PermissionSnapshot> {
  if (isNativeApp()) {
    try {
      const status = await (await nativePlugin()).checkPermissions()
      if (status.display === 'granted') return 'granted'
      if (status.display === 'denied') return 'denied'
      return 'prompt'
    } catch {
      return 'unsupported'
    }
  }
  if (!notificationsSupported()) return 'unsupported'
  const permission = Notification.permission
  return permission === 'default' ? 'prompt' : permission
}

/** Ask for permission if still undecided. True when granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const plugin = await nativePlugin()
      const current = await plugin.checkPermissions()
      if (current.display === 'granted') return true
      if (current.display === 'denied') return false
      return (await plugin.requestPermissions()).display === 'granted'
    } catch {
      return false
    }
  }
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Deterministic 31-bit id for a dedupe key (native ids must be ints). */
export function notificationIdForKey(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // Keep clear of the reserved scheduled-reminder id range (see reminders.ts).
  return (hash >>> 1) % 2_000_000_000
}

export async function showSystemNotification(alert: AppAlert): Promise<boolean> {
  if (isNativeApp()) {
    try {
      await ensureNotificationChannel()
      const plugin = await nativePlugin()
      await plugin.schedule({
        notifications: [
          {
            id: notificationIdForKey(alert.key),
            title: alert.title,
            body: alert.body,
            channelId: NOTIFICATION_CHANNEL_ID,
          },
        ],
      })
      return true
    } catch {
      return false
    }
  }
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

/** SAST business date of an ISO timestamp. */
function sastDateOf(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp)
  return Number.isNaN(parsed.getTime()) ? '' : todaySAST(parsed)
}

/**
 * Check the ledger and show anything that's due. Cheap and idempotent —
 * safe to call on every data change, focus and timer tick.
 */
export async function runNotificationSweep(data: AppData, now: Date = new Date()): Promise<void> {
  const profile = data.profile
  if (!profile || profile.isDemo) return
  const prefs = loadNotificationPrefs()
  if (!prefs.enabled) return
  if ((await getNotificationPermission()) !== 'granted') return

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

  const newBadges: AchievementInput[] = data.userBadges
    .filter((b) => sastDateOf(b.earnedAt) === today)
    .flatMap((b) => {
      const def = BADGE_DEFS.find((d) => d.id === b.badgeId)
      return def ? [{ id: def.id, name: def.name, emoji: def.emoji }] : []
    })
  const achievedGoals: AchievementInput[] = data.goals
    .filter((g) => g.achievedAt && sastDateOf(g.achievedAt) === today)
    .map((g) => ({ id: g.id, name: g.name, emoji: g.icon }))
  const xpBeforeToday = totalXp(data.xpEvents.filter((e) => e.date < today))
  const levelBefore = levelForXp(xpBeforeToday)
  const levelNow = levelForXp(totalXp(data.xpEvents))
  const levelUp =
    levelNow > levelBefore ? { level: levelNow, rank: rankForLevel(levelNow).name } : null

  const sent = loadSent()
  const alerts = dueAlerts({
    prefs,
    today,
    hour: sastHour(now),
    dayOfWeek: dayOfWeekMon(today),
    weekStart: weekBounds(today).start,
    cycleStart: cycle.start,
    scheduledNatively: isNativeApp(),
    isPayday: cycle.start === today,
    incomeCents,
    leftOverCents,
    loggedToday,
    streakCount: streak.count,
    streakAtRisk: streak.atRisk && !streak.aliveToday,
    newBadges,
    achievedGoals,
    levelUp,
    alreadySent: (key) => key in sent,
  })

  for (const alert of alerts) {
    if (await showSystemNotification(alert)) markSent(alert.key, today)
  }
}
