/**
 * Safe-to-Spend: the daily guilt-free number.
 *
 *   (Wants budget − Wants spent so far) ÷ days remaining in cycle
 *
 * Days remaining includes today, so overspending today automatically
 * spreads the pain over the rest of the cycle.
 */

export type StsStatus = 'winning' | 'close' | 'over'

export interface StsInput {
  /** Wants bucket allocation for the cycle. */
  wantsAllocatedCents: number
  /** Wants spend so far this cycle, including today. */
  wantsSpentCents: number
  /** Wants spend logged today only. */
  wantsSpentTodayCents: number
  /** Days remaining in the cycle, today inclusive (≥ 0). */
  daysRemaining: number
}

export interface StsResult {
  /** The hero number: what's safe to spend today. */
  dailyCents: number
  /** Guilt-free spend available over the next 7 days (or to cycle end). */
  weekCents: number
  /** Wants budget remaining for the whole cycle (can be negative). */
  remainingCents: number
  /** What today's allowance was at the start of the day. */
  baselineTodayCents: number
  status: StsStatus
}

export function computeSafeToSpend(input: StsInput): StsResult {
  const { wantsAllocatedCents, wantsSpentCents, wantsSpentTodayCents } = input
  const daysRemaining = Math.max(1, input.daysRemaining)

  const remainingCents = wantsAllocatedCents - wantsSpentCents
  const dailyCents = Math.max(0, Math.floor(remainingCents / daysRemaining))

  // Today's allowance judged from the start of the day — used for status
  // so a single coffee doesn't flip the hero into panic mode.
  const remainingAtDayStart = remainingCents + wantsSpentTodayCents
  const baselineTodayCents = Math.max(0, Math.floor(remainingAtDayStart / daysRemaining))

  let status: StsStatus
  if (remainingCents < 0 || (baselineTodayCents === 0 && remainingCents <= 0)) {
    status = 'over'
  } else if (
    baselineTodayCents > 0 &&
    wantsSpentTodayCents >= baselineTodayCents * 0.75
  ) {
    status = 'close'
  } else {
    status = 'winning'
  }

  const weekCents = Math.max(
    0,
    Math.min(remainingCents, dailyCents * Math.min(daysRemaining, 7)),
  )

  return { dailyCents, weekCents, remainingCents, baselineTodayCents, status }
}

/**
 * Was `date` an under-budget day? Judged against the allowance at the start
 * of that day. Used for the +50 XP day-close award.
 */
export function wasUnderStsDay(params: {
  wantsAllocatedCents: number
  /** Wants spent in the cycle before this day started. */
  wantsSpentBeforeCents: number
  /** Wants spent on the day itself. */
  wantsSpentOnDayCents: number
  /** Days remaining in the cycle on that day, inclusive. */
  daysRemainingOnDay: number
}): boolean {
  const days = Math.max(1, params.daysRemainingOnDay)
  const allowance = Math.max(
    0,
    Math.floor((params.wantsAllocatedCents - params.wantsSpentBeforeCents) / days),
  )
  return params.wantsSpentOnDayCents <= allowance
}
