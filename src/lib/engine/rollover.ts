/**
 * Cycle rollover: when a budget cycle ends with unspent Wants money,
 * prompt a one-tap sweep of the leftovers into Savings.
 */

export interface SweepOffer {
  cycleStart: string
  cycleEnd: string
  amountCents: number
}

/** Unspent Wants at cycle end. Never negative. */
export function computeSweepAmount(
  wantsAllocatedCents: number,
  wantsSpentCents: number,
): number {
  return Math.max(0, wantsAllocatedCents - wantsSpentCents)
}

/**
 * Whether to show the sweep prompt for the most recently ended cycle.
 * Offered once per cycle, only while the ended cycle is fresh (≤ 7 days old)
 * and only when there's something meaningful to sweep (≥ R10).
 */
export function shouldOfferSweep(params: {
  sweepAmountCents: number
  alreadySwept: boolean
  daysSinceCycleEnd: number
}): boolean {
  return (
    !params.alreadySwept &&
    params.sweepAmountCents >= 1000 &&
    params.daysSinceCycleEnd >= 0 &&
    params.daysSinceCycleEnd <= 7
  )
}
