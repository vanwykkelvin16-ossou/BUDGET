import { describe, expect, it } from 'vitest'
import {
  FIRST_YEAR_PRICE_CENTS,
  plusPriceCents,
  REFERRAL_DISCOUNT_CENTS,
  shareLink,
  shareMessage,
  shouldOfferReferralBeforePay,
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

describe('refer-a-friend popup before paying', () => {
  it('interrupts the full-price R200 first payment only', () => {
    // First payment at full price → the R50 is still on the table → popup.
    expect(shouldOfferReferralBeforePay({ unlocked: false, isFirstPayment: true })).toBe(true)
  })

  it('never shows once the reward is unlocked (price is already R150)', () => {
    expect(shouldOfferReferralBeforePay({ unlocked: true, isFirstPayment: true })).toBe(false)
  })

  it('never shows for renewals — the discount is first-payment-only', () => {
    expect(shouldOfferReferralBeforePay({ unlocked: false, isFirstPayment: false })).toBe(false)
    expect(shouldOfferReferralBeforePay({ unlocked: true, isFirstPayment: false })).toBe(false)
  })

  it('popup cases line up with the price the user would pay', () => {
    // Popup shows exactly when the user would otherwise pay full price on
    // their first payment — i.e. referring could still save them R50.
    for (const unlocked of [true, false]) {
      for (const isFirstPayment of [true, false]) {
        const price = plusPriceCents({ fullPriceCents: PLUS_PRICE_CENTS, unlocked, isFirstPayment })
        const offered = shouldOfferReferralBeforePay({ unlocked, isFirstPayment })
        expect(offered).toBe(isFirstPayment && price === PLUS_PRICE_CENTS)
      }
    }
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
