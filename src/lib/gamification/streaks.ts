/**
 * Streaks. The daily logging streak counts consecutive SAST days with at
 * least one logged action (expense, income or a no-spend mark). Missing a
 * single day consumes a streak freeze if one is available; otherwise the
 * streak resets. One freeze is earnable per calendar month by completing a
 * 7-day streak multiple.
 */

import { addDays, diffDays, monthKey } from '../dates'
import type { Profile } from '../data/types'

export const MAX_FREEZES = 2
export const FREEZE_EARN_STREAK = 7

export interface StreakUpdate {
  streakCount: number
  longestStreak: number
  streakFreezes: number
  lastLogDate: string
  lastFreezeEarnedMonth: string | null
  usedFreeze: boolean
  earnedFreeze: boolean
}

/**
 * Advance the streak for a logging action on `todayISO`.
 * Pure — caller merges the result into the profile.
 */
export function advanceStreak(
  profile: Pick<
    Profile,
    | 'streakCount'
    | 'longestStreak'
    | 'streakFreezes'
    | 'lastLogDate'
    | 'lastFreezeEarnedMonth'
  >,
  todayISO: string,
): StreakUpdate {
  const {
    streakCount,
    longestStreak,
    streakFreezes,
    lastLogDate,
    lastFreezeEarnedMonth,
  } = profile

  let nextStreak: number
  let nextFreezes = streakFreezes
  let usedFreeze = false

  if (!lastLogDate) {
    nextStreak = 1
  } else {
    const gap = diffDays(lastLogDate, todayISO)
    if (gap <= 0) {
      // Same day (or clock weirdness): nothing changes.
      return {
        streakCount,
        longestStreak,
        streakFreezes,
        lastLogDate: lastLogDate,
        lastFreezeEarnedMonth,
        usedFreeze: false,
        earnedFreeze: false,
      }
    }
    if (gap === 1) {
      nextStreak = streakCount + 1
    } else if (gap === 2 && streakFreezes > 0) {
      // One missed day — the freeze eats it and the streak survives.
      nextStreak = streakCount + 1
      nextFreezes -= 1
      usedFreeze = true
    } else {
      nextStreak = 1
    }
  }

  // Earn a freeze on each 7-day milestone, max one per calendar month.
  let earnedFreeze = false
  let nextFreezeMonth = lastFreezeEarnedMonth
  const month = monthKey(todayISO)
  if (
    nextStreak > 0 &&
    nextStreak % FREEZE_EARN_STREAK === 0 &&
    nextFreezeMonth !== month &&
    nextFreezes < MAX_FREEZES
  ) {
    nextFreezes += 1
    nextFreezeMonth = month
    earnedFreeze = true
  }

  return {
    streakCount: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
    streakFreezes: nextFreezes,
    lastLogDate: todayISO,
    lastFreezeEarnedMonth: nextFreezeMonth,
    usedFreeze,
    earnedFreeze,
  }
}

/**
 * What the streak is worth *right now* for display: still alive if the last
 * log was today or yesterday (or one freeze could still bridge the gap).
 */
export function displayStreak(
  profile: Pick<Profile, 'streakCount' | 'lastLogDate' | 'streakFreezes'>,
  todayISO: string,
): { count: number; aliveToday: boolean; atRisk: boolean } {
  if (!profile.lastLogDate) return { count: 0, aliveToday: false, atRisk: false }
  const gap = diffDays(profile.lastLogDate, todayISO)
  if (gap <= 0) return { count: profile.streakCount, aliveToday: true, atRisk: false }
  if (gap === 1) return { count: profile.streakCount, aliveToday: false, atRisk: true }
  if (gap === 2 && profile.streakFreezes > 0) {
    return { count: profile.streakCount, aliveToday: false, atRisk: true }
  }
  return { count: 0, aliveToday: false, atRisk: false }
}

/** The days of the current week (Mon–Sun) that had logging activity. */
export function weekActivity(
  loggedDates: Set<string>,
  weekStart: string,
): boolean[] {
  return Array.from({ length: 7 }, (_, i) => loggedDates.has(addDays(weekStart, i)))
}
