import { describe, expect, it } from 'vitest'
import { computeSweepAmount, shouldOfferSweep } from './rollover'

describe('computeSweepAmount', () => {
  it('sweeps unspent wants', () => {
    expect(computeSweepAmount(855000, 700000)).toBe(155000)
  })
  it('never negative when overspent', () => {
    expect(computeSweepAmount(855000, 900000)).toBe(0)
  })
})

describe('shouldOfferSweep', () => {
  it('offers within the 7-day window for meaningful amounts', () => {
    expect(
      shouldOfferSweep({ sweepAmountCents: 155000, alreadySwept: false, daysSinceCycleEnd: 2 }),
    ).toBe(true)
  })
  it('skips tiny sweeps', () => {
    expect(
      shouldOfferSweep({ sweepAmountCents: 500, alreadySwept: false, daysSinceCycleEnd: 1 }),
    ).toBe(false)
  })
  it('offers only once', () => {
    expect(
      shouldOfferSweep({ sweepAmountCents: 155000, alreadySwept: true, daysSinceCycleEnd: 1 }),
    ).toBe(false)
  })
  it('expires after a week', () => {
    expect(
      shouldOfferSweep({ sweepAmountCents: 155000, alreadySwept: false, daysSinceCycleEnd: 9 }),
    ).toBe(false)
  })
})
