/**
 * Safe-to-Spend: the daily guilt-free number.
 *
 *   (Wants budget − Wants spent so far) ÷ days remaining in cycle
 *
 * Days remaining includes today, so overspending today automatically
 * spreads the pain over the rest of the cycle.
 *
 * The plan number is also capped by real cash: if less money is actually
 * left in the account (income − everything spent − savings put away) than
 * the Wants plan allows, the smaller number wins. The app must never offer
 * fun money that does not exist.
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
  /**
   * Real money still in hand this cycle: income − all spending − savings
   * contributions. Can be negative. Omit for pure plan maths (no cap).
   */
  actualAvailableCents?: number
}

export interface StsResult {
  /** The hero number: what's safe to spend today. */
  dailyCents: number
  /** Guilt-free spend available over the next 7 days (or to cycle end). */
  weekCents: number
  /** Wants budget remaining per the plan (can be negative). */
  remainingCents: number
  /**
   * What can really still be spent: the plan remainder capped by actual
   * cash left. This is what daily/week numbers are computed from.
   */
  effectiveRemainingCents: number
  /** What today's allowance was at the start of the day. */
  baselineTodayCents: number
  /** True when real cash — not the plan — is what limits the number. */
  cappedByCash: boolean
  status: StsStatus
}

export function computeSafeToSpend(input: StsInput): StsResult {
  const { wantsAllocatedCents, wantsSpentCents, wantsSpentTodayCents } = input
  const daysRemaining = Math.max(1, input.daysRemaining)
  const actualAvailableCents = input.actualAvailableCents ?? Number.POSITIVE_INFINITY

  const remainingCents = wantsAllocatedCents - wantsSpentCents
  const cappedByCash = actualAvailableCents < remainingCents
  const effectiveRemainingCents = cappedByCash ? actualAvailableCents : remainingCents

  const dailyCents = Math.max(0, Math.floor(effectiveRemainingCents / daysRemaining))

  // Today's allowance judged from the start of the day — used for status
  // so a single coffee doesn't flip the hero into panic mode.
  const remainingAtDayStart = effectiveRemainingCents + wantsSpentTodayCents
  const baselineTodayCents = Math.max(0, Math.floor(remainingAtDayStart / daysRemaining))

  let status: StsStatus
  if (
    effectiveRemainingCents < 0 ||
    (baselineTodayCents === 0 && effectiveRemainingCents <= 0)
  ) {
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
    Math.min(effectiveRemainingCents, dailyCents * Math.min(daysRemaining, 7)),
  )

  return {
    dailyCents,
    weekCents,
    remainingCents,
    effectiveRemainingCents,
    baselineTodayCents,
    cappedByCash,
    status,
  }
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
