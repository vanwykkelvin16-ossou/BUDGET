/**
 * Savings projection — "if I save R X per month for Y months at Z% growth,
 * I'll have R N." Compound interest with end-of-month contributions.
 */

export interface ProjectionInput {
  /** Starting balance (e.g. current net worth), can be 0 or negative. */
  startCents: number
  /** Contribution per month. */
  monthlyCents: number
  /** Number of months saved for (≥ 0). */
  months: number
  /** Expected annual growth, percent (0 = under the mattress). */
  annualRatePct: number
}

export interface ProjectionResult {
  futureValueCents: number
  contributedCents: number
  /** Growth earned on top of start + contributions. */
  growthCents: number
}

export function projectSavings(input: ProjectionInput): ProjectionResult {
  const months = Math.max(0, Math.floor(input.months))
  const contributed = input.monthlyCents * months

  // Effective monthly rate from the annual rate (compounded monthly).
  const monthlyRate = Math.pow(1 + input.annualRatePct / 100, 1 / 12) - 1

  let futureValue: number
  if (monthlyRate === 0) {
    futureValue = input.startCents + contributed
  } else {
    const growthFactor = Math.pow(1 + monthlyRate, months)
    futureValue =
      input.startCents * growthFactor +
      input.monthlyCents * ((growthFactor - 1) / monthlyRate)
  }

  const futureValueCents = Math.round(futureValue)
  return {
    futureValueCents,
    contributedCents: contributed,
    growthCents: futureValueCents - input.startCents - contributed,
  }
}

/** "18 months" → "1 y 6 m" style label. */
export function formatMonths(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${years} year${years === 1 ? '' : 's'}` : `${years} y ${rest} m`
}
