import { describe, expect, it } from 'vitest'
import {
  FIRST_YEAR_PRICE_CENTS,
  plusPriceCents,
  REFERRAL_DISCOUNT_CENTS,
  shareLink,
  shareMessage,
} from './referral'
import { PLUS_PRICE_CENTS } from './membership'

describe('referral pricing', () => {
  it('R50 comes off the first payment only, and only when unlocked', () => {
    const base = { fullPriceCents: PLUS_PRICE_CENTS }
    expect(plusPriceCents({ ...base, unlocked: true, isFirstPayment: true })).toBe(15_000)
    expect(plusPriceCents({ ...base, unlocked: true, isFirstPayment: false })).toBe(20_000)
    expect(plusPriceCents({ ...base, unlocked: false, isFirstPayment: true })).toBe(20_000)
    expect(PLUS_PRICE_CENTS - REFERRAL_DISCOUNT_CENTS).toBe(FIRST_YEAR_PRICE_CENTS)
  })
})

describe('share link', () => {
  it('carries the code as ?ref= on the app origin', () => {
    expect(shareLink('AB2CD3', 'https://budget-omega-ochre.vercel.app')).toBe(
      'https://budget-omega-ochre.vercel.app/?ref=AB2CD3',
    )
    expect(shareMessage('AB2CD3', 'https://x.app')).toContain('https://x.app/?ref=AB2CD3')
    expect(shareMessage('AB2CD3', 'https://x.app')).toContain('PennyPlay')
  })
})
