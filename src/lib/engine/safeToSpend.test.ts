import { describe, expect, it } from 'vitest'
import { computeSafeToSpend, wasUnderStsDay } from './safeToSpend'

describe('computeSafeToSpend', () => {
  it('divides remaining wants over remaining days', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 900000, // R9 000
      wantsSpentCents: 300000, // R3 000
      wantsSpentTodayCents: 0,
      daysRemaining: 20,
    })
    expect(r.dailyCents).toBe(30000) // R300/day
    expect(r.remainingCents).toBe(600000)
    expect(r.status).toBe('winning')
  })

  it('floors fractional cents', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 1000,
      wantsSpentCents: 0,
      wantsSpentTodayCents: 0,
      daysRemaining: 3,
    })
    expect(r.dailyCents).toBe(333)
  })

  it('never goes below zero when overspent', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 500000,
      wantsSpentCents: 620000,
      wantsSpentTodayCents: 0,
      daysRemaining: 10,
    })
    expect(r.dailyCents).toBe(0)
    expect(r.remainingCents).toBe(-120000)
    expect(r.status).toBe('over')
  })

  it('treats zero days remaining as one day (last-day safety)', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 100000,
      wantsSpentCents: 40000,
      wantsSpentTodayCents: 0,
      daysRemaining: 0,
    })
    expect(r.dailyCents).toBe(60000)
  })

  it('flags "close" when today burns most of the daily allowance', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 900000,
      wantsSpentCents: 330000, // includes today's 30k
      wantsSpentTodayCents: 30000,
      daysRemaining: 20,
    })
    // Baseline today = (900000-300000)/20 = 30000; spent 30000 ≥ 75%.
    expect(r.baselineTodayCents).toBe(30000)
    expect(r.status).toBe('close')
  })

  it('stays winning after a small purchase', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 900000,
      wantsSpentCents: 305000,
      wantsSpentTodayCents: 5000,
      daysRemaining: 20,
    })
    expect(r.status).toBe('winning')
  })

  it('caps the week number at the cycle remainder', () => {
    const shortCycle = computeSafeToSpend({
      wantsAllocatedCents: 70000,
      wantsSpentCents: 0,
      wantsSpentTodayCents: 0,
      daysRemaining: 3,
    })
    expect(shortCycle.weekCents).toBe(69999) // 23333 × 3, capped by remaining
    const longCycle = computeSafeToSpend({
      wantsAllocatedCents: 700000,
      wantsSpentCents: 0,
      wantsSpentTodayCents: 0,
      daysRemaining: 14,
    })
    expect(longCycle.weekCents).toBe(350000) // 50000 × 7
  })
})

describe('computeSafeToSpend — cash cap', () => {
  it('leaves the plan alone when enough real money is left', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 900000,
      wantsSpentCents: 300000,
      wantsSpentTodayCents: 0,
      daysRemaining: 20,
      actualAvailableCents: 2_000_000, // plenty in hand
    })
    expect(r.cappedByCash).toBe(false)
    expect(r.effectiveRemainingCents).toBe(600000)
    expect(r.dailyCents).toBe(30000)
    expect(r.status).toBe('winning')
  })

  it('caps daily/week numbers by the real money left', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 900000, // plan says R6 000 still available…
      wantsSpentCents: 300000,
      wantsSpentTodayCents: 0,
      daysRemaining: 20,
      actualAvailableCents: 200000, // …but only R2 000 really exists
    })
    expect(r.cappedByCash).toBe(true)
    expect(r.remainingCents).toBe(600000) // plan number unchanged
    expect(r.effectiveRemainingCents).toBe(200000)
    expect(r.dailyCents).toBe(10000) // R100/day, not R300/day
    expect(r.weekCents).toBe(70000)
  })

  it('zeroes fun money when more went out than came in (screenshot case)', () => {
    // Money in R55 000, spent R52 000, saved R30 000 → R27 000 short,
    // yet the Wants plan alone still "allows" R12 650 over 13 days.
    const r = computeSafeToSpend({
      wantsAllocatedCents: 1_265_000,
      wantsSpentCents: 0,
      wantsSpentTodayCents: 0,
      daysRemaining: 13,
      actualAvailableCents: -2_700_000,
    })
    expect(r.cappedByCash).toBe(true)
    expect(r.dailyCents).toBe(0)
    expect(r.weekCents).toBe(0)
    expect(r.effectiveRemainingCents).toBe(-2_700_000)
    expect(r.status).toBe('over')
  })

  it('exactly zero cash left means zero fun money, flagged as capped', () => {
    const r = computeSafeToSpend({
      wantsAllocatedCents: 500000,
      wantsSpentCents: 100000,
      wantsSpentTodayCents: 0,
      daysRemaining: 10,
      actualAvailableCents: 0,
    })
    expect(r.cappedByCash).toBe(true)
    expect(r.dailyCents).toBe(0)
    expect(r.status).toBe('over')
  })

  it('omitting the cap keeps pure plan maths (back-compat)', () => {
    const withCap = computeSafeToSpend({
      wantsAllocatedCents: 900000,
      wantsSpentCents: 300000,
      wantsSpentTodayCents: 0,
      daysRemaining: 20,
    })
    expect(withCap.cappedByCash).toBe(false)
    expect(withCap.effectiveRemainingCents).toBe(withCap.remainingCents)
  })
})

describe('wasUnderStsDay', () => {
  it('true when the day spend stayed within the day-start allowance', () => {
    expect(
      wasUnderStsDay({
        wantsAllocatedCents: 900000,
        wantsSpentBeforeCents: 300000,
        wantsSpentOnDayCents: 25000,
        daysRemainingOnDay: 20,
      }),
    ).toBe(true) // allowance 30000
  })

  it('false when the day went over', () => {
    expect(
      wasUnderStsDay({
        wantsAllocatedCents: 900000,
        wantsSpentBeforeCents: 300000,
        wantsSpentOnDayCents: 35000,
        daysRemainingOnDay: 20,
      }),
    ).toBe(false)
  })

  it('a no-spend day is always under', () => {
    expect(
      wasUnderStsDay({
        wantsAllocatedCents: 100,
        wantsSpentBeforeCents: 100000,
        wantsSpentOnDayCents: 0,
        daysRemainingOnDay: 5,
      }),
    ).toBe(true)
  })
})
