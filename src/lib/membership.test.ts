import { describe, expect, it } from 'vitest'
import {
  clampToOneYear,
  daysLeft,
  membershipStatus,
  payfastCheckoutUrl,
  PLUS_PRICE_CENTS,
  yearFrom,
  type Membership,
} from './membership'

const TODAY = '2026-07-13'

function paidUpTo(paidUntil: string): Membership {
  return { paidUntil, paymentRef: 'ref', amountCents: PLUS_PRICE_CENTS, activatedAt: '' }
}

describe('membership status', () => {
  it('none without a membership, active until the paid-up day, expired after', () => {
    expect(membershipStatus(null, TODAY)).toBe('none')
    expect(membershipStatus(paidUpTo('2026-07-13'), TODAY)).toBe('active') // last day counts
    expect(membershipStatus(paidUpTo('2027-01-01'), TODAY)).toBe('active')
    expect(membershipStatus(paidUpTo('2026-07-12'), TODAY)).toBe('expired')
  })

  it('counts days left, zero when lapsed', () => {
    expect(daysLeft(paidUpTo('2026-07-20'), TODAY)).toBe(7)
    expect(daysLeft(paidUpTo('2026-07-12'), TODAY)).toBe(0)
    expect(daysLeft(null, TODAY)).toBe(0)
  })

  it('a new year starts today, a renewal extends the current year', () => {
    expect(yearFrom(null, TODAY)).toBe('2027-07-13')
    expect(yearFrom(paidUpTo('2026-07-12'), TODAY)).toBe('2027-07-13') // lapsed → from today
    expect(yearFrom(paidUpTo('2026-09-01'), TODAY)).toBe('2027-09-01') // active → stacks on
  })

  it('never runs further than one year from today (self-heals 2050 dates)', () => {
    expect(clampToOneYear(paidUpTo('2050-07-07'), TODAY).paidUntil).toBe('2027-07-13')
    expect(clampToOneYear(paidUpTo('2026-09-01'), TODAY).paidUntil).toBe('2026-09-01') // untouched
    expect(daysLeft(clampToOneYear(paidUpTo('2050-07-07'), TODAY), TODAY)).toBe(365)
  })
})

describe('payfast checkout url', () => {
  it('builds a yearly auto-renew subscription with return/cancel/ITN context', () => {
    const url = new URL(
      payfastCheckoutUrl({
        config: { merchantId: '10000100', merchantKey: 'abc', sandbox: false },
        origin: 'https://budget-omega-ochre.vercel.app',
        email: 'kelvin@example.com',
        name: 'Kelvin',
        userId: 'user-1',
      }),
    )
    expect(url.hostname).toBe('www.payfast.co.za')
    expect(url.searchParams.get('amount')).toBe('200.00')
    expect(url.searchParams.get('merchant_id')).toBe('10000100')
    expect(url.searchParams.get('return_url')).toContain('/plus?paid=1')
    expect(url.searchParams.get('custom_str1')).toBe('user-1')
    expect(url.searchParams.get('subscription_type')).toBe('1')
    expect(url.searchParams.get('frequency')).toBe('6')
    expect(url.searchParams.get('cycles')).toBe('0')
    expect(url.searchParams.get('recurring_amount')).toBe('200.00')
  })

  it('keeps renewals at full price when the first year is discounted', () => {
    const url = new URL(
      payfastCheckoutUrl({
        config: { merchantId: 'x', merchantKey: 'y', sandbox: true },
        origin: 'http://localhost',
        amountCents: 15_000,
        referralDiscount: true,
      }),
    )
    expect(url.searchParams.get('amount')).toBe('150.00')
    expect(url.searchParams.get('recurring_amount')).toBe('200.00')
    expect(url.searchParams.get('custom_str2')).toBe('ref50')
  })

  it('uses the sandbox host when flagged', () => {
    const url = new URL(
      payfastCheckoutUrl({
        config: { merchantId: 'x', merchantKey: 'y', sandbox: true },
        origin: 'http://localhost',
      }),
    )
    expect(url.hostname).toBe('sandbox.payfast.co.za')
  })
})
