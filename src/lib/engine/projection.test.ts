import { describe, expect, it } from 'vitest'
import { formatMonths, projectSavings } from './projection'

describe('projectSavings', () => {
  it('with zero growth it is simple arithmetic', () => {
    const r = projectSavings({ startCents: 100_000, monthlyCents: 50_000, months: 12, annualRatePct: 0 })
    expect(r.futureValueCents).toBe(700_000) // R1 000 + 12 × R500
    expect(r.contributedCents).toBe(600_000)
    expect(r.growthCents).toBe(0)
  })

  it('compounds the starting balance', () => {
    // R10 000 at 10% p.a. for exactly a year, no contributions → R11 000.
    const r = projectSavings({ startCents: 1_000_000, monthlyCents: 0, months: 12, annualRatePct: 10 })
    expect(r.futureValueCents).toBe(1_100_000)
    expect(r.growthCents).toBe(100_000)
  })

  it('grows contributions too', () => {
    const flat = projectSavings({ startCents: 0, monthlyCents: 100_000, months: 24, annualRatePct: 0 })
    const grown = projectSavings({ startCents: 0, monthlyCents: 100_000, months: 24, annualRatePct: 8 })
    expect(grown.futureValueCents).toBeGreaterThan(flat.futureValueCents)
    expect(grown.contributedCents).toBe(2_400_000)
    expect(grown.growthCents).toBe(grown.futureValueCents - 2_400_000)
  })

  it('handles zero months and negative starts (debt)', () => {
    expect(
      projectSavings({ startCents: 5000, monthlyCents: 99, months: 0, annualRatePct: 12 }).futureValueCents,
    ).toBe(5000)
    const debt = projectSavings({ startCents: -100_000, monthlyCents: 50_000, months: 4, annualRatePct: 0 })
    expect(debt.futureValueCents).toBe(100_000)
  })

  it('monotonically increases with each input', () => {
    const base = projectSavings({ startCents: 0, monthlyCents: 50_000, months: 36, annualRatePct: 6 })
    expect(
      projectSavings({ startCents: 0, monthlyCents: 60_000, months: 36, annualRatePct: 6 }).futureValueCents,
    ).toBeGreaterThan(base.futureValueCents)
    expect(
      projectSavings({ startCents: 0, monthlyCents: 50_000, months: 48, annualRatePct: 6 }).futureValueCents,
    ).toBeGreaterThan(base.futureValueCents)
    expect(
      projectSavings({ startCents: 0, monthlyCents: 50_000, months: 36, annualRatePct: 9 }).futureValueCents,
    ).toBeGreaterThan(base.futureValueCents)
  })
})

describe('formatMonths', () => {
  it('formats months, years and mixes', () => {
    expect(formatMonths(1)).toBe('1 month')
    expect(formatMonths(9)).toBe('9 months')
    expect(formatMonths(12)).toBe('1 year')
    expect(formatMonths(24)).toBe('2 years')
    expect(formatMonths(30)).toBe('2 y 6 m')
  })
})
