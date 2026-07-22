import { describe, expect, it } from 'vitest'
import { FEATURE_MATRIX, TIERS, tier, YEARLY_SAVING_CENTS } from './plans'
import { MONTHLY_PRICE_CENTS, PLUS_PRICE_CENTS } from './membership'
import { PLANS } from '../../supabase/functions/_shared/payfast'

describe('pricing catalog', () => {
  it('has the three tiers in escalation order: free, monthly, yearly', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['free', 'monthly', 'yearly'])
    expect(tier('free').priceCents).toBe(0)
    expect(tier('monthly').priceCents).toBe(MONTHLY_PRICE_CENTS)
    expect(tier('yearly').priceCents).toBe(PLUS_PRICE_CENTS)
  })

  it('display prices match what the server actually charges', () => {
    expect(tier('monthly').priceCents).toBe(PLANS.monthly.amountCents)
    expect(tier('yearly').priceCents).toBe(PLANS.yearly.amountCents)
  })

  it('yearly is the deal: R100 cheaper than 12 months of monthly', () => {
    expect(YEARLY_SAVING_CENTS).toBe(10_000)
    expect(tier('yearly').badge).toBe('Best value')
  })

  it('every tier tells the whole story: features, pros AND cons, and paid tiers a CTA', () => {
    for (const t of TIERS) {
      expect(t.includes.length).toBeGreaterThanOrEqual(3)
      expect(t.pros.length).toBeGreaterThanOrEqual(2)
      expect(t.cons.length).toBeGreaterThanOrEqual(2)
      if (t.id !== 'free') expect(t.cta).toBeTruthy()
    }
  })

  it('the comparison matrix gives paid plans every core feature the free look lacks', () => {
    expect(FEATURE_MATRIX.length).toBeGreaterThanOrEqual(6)
    // The first six rows are the app's core features — both paid plans
    // must have all of them (later rows describe billing differences).
    for (const row of FEATURE_MATRIX.slice(0, 6)) {
      expect(row.monthly).toBe(true)
      expect(row.yearly).toBe(true)
    }
    expect(FEATURE_MATRIX.some((row) => row.free === false)).toBe(true)
  })
})
