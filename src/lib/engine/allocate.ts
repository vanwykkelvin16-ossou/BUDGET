/**
 * Income allocation across the Need/Want/Saving buckets.
 * Uses the largest-remainder method so allocations always sum exactly
 * to the income being allocated — no cent ever goes missing.
 */

import type { Bucket, BucketSplits } from '../data/types'

export const BUCKETS: Bucket[] = ['need', 'want', 'saving']

export const DEFAULT_SPLITS: BucketSplits = { need: 50, want: 30, saving: 20 }

export function splitsAreValid(splits: BucketSplits): boolean {
  const values = BUCKETS.map((b) => splits[b])
  return (
    values.every((v) => Number.isInteger(v) && v >= 0 && v <= 100) &&
    values.reduce((a, b) => a + b, 0) === 100
  )
}

/**
 * Allocate `totalCents` across buckets according to percentage splits.
 * Guarantees: every value ≥ 0, and the three allocations sum to totalCents.
 */
export function allocateIncome(
  totalCents: number,
  splits: BucketSplits,
): Record<Bucket, number> {
  if (!splitsAreValid(splits)) {
    throw new Error(`Invalid bucket splits: ${JSON.stringify(splits)}`)
  }
  if (totalCents < 0) throw new Error('Cannot allocate negative income')

  const exact = BUCKETS.map((b) => (totalCents * splits[b]) / 100)
  const floors = exact.map(Math.floor)
  let leftover = totalCents - floors.reduce((a, b) => a + b, 0)

  // Hand leftover cents to the largest fractional remainders;
  // ties break in bucket order (need, want, saving) for determinism.
  const order = exact
    .map((value, i) => ({ i, frac: value - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (const { i } of order) {
    if (leftover <= 0) break
    floors[i] += 1
    leftover -= 1
  }

  return { need: floors[0], want: floors[1], saving: floors[2] }
}

/**
 * Move one bucket's slider to `value`, redistributing the difference across
 * the other two proportionally (then fixing rounding so the sum stays 100).
 * Used by the onboarding / settings split sliders.
 */
export function adjustSplit(
  splits: BucketSplits,
  bucket: Bucket,
  value: number,
): BucketSplits {
  const target = Math.max(0, Math.min(100, Math.round(value)))
  const others = BUCKETS.filter((b) => b !== bucket)
  const otherTotal = 100 - target
  const currentOtherTotal = others.reduce((sum, b) => sum + splits[b], 0)

  const next = { ...splits, [bucket]: target }
  if (currentOtherTotal === 0) {
    // Split evenly when the others are both at zero.
    next[others[0]] = Math.ceil(otherTotal / 2)
    next[others[1]] = Math.floor(otherTotal / 2)
  } else {
    const first = Math.round((splits[others[0]] / currentOtherTotal) * otherTotal)
    next[others[0]] = first
    next[others[1]] = otherTotal - first
  }
  return next
}
