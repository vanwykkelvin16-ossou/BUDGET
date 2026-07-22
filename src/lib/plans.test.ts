import { describe, expect, it } from 'vitest'
import { FEATURE_MATRIX, TIERS, tier } from './plans'
import { PLUS_PRICE_CENTS } from './membership'
import { PLANS } from '../../supabase/functions/_shared/payfast'

describe('pricing catalog', () => {
  it('has exactly two tiers: free look and yearly Plus', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'yearly'])
    expect(tier('free').priceCents).toBe(0)
    expect(tier('yearly').priceCents).toBe(PLUS_PRICE_CENTS)
  })

  it('display price matches what the server actually charges', () => {
    expect(tier('yearly').priceCents).toBe(PLANS.yearly.amountCents)
  })

  it('yearly is the auto-renewing paid plan', () => {
    expect(tier('yearly').badge).toMatch(/auto-renew/i)
    expect(tier('yearly').includes.some((i) => /auto-renew/i.test(i))).toBe(true)
    expect(tier('yearly').cons.some((c) => /auto-billed/i.test(c))).toBe(true)
  })

  it('every tier tells the whole story: features, pros AND cons, and Plus has a CTA', () => {
    for (const t of TIERS) {
      expect(t.includes.length).toBeGreaterThanOrEqual(3)
      expect(t.pros.length).toBeGreaterThanOrEqual(2)
      expect(t.cons.length).toBeGreaterThanOrEqual(2)
      if (t.id !== 'free') expect(t.cta).toBeTruthy()
    }
  })

  it('the comparison matrix gives Plus every core feature the free look lacks', () => {
    expect(FEATURE_MATRIX.length).toBeGreaterThanOrEqual(6)
    for (const row of FEATURE_MATRIX.slice(0, 6)) {
      expect(row.yearly).toBe(true)
    }
    expect(FEATURE_MATRIX.some((row) => row.free === false)).toBe(true)
    // No monthly column — yearly-only product.
    expect(FEATURE_MATRIX.every((row) => !('monthly' in row))).toBe(true)
  })
})
