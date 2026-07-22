/**
 * Tests for the shared PayFast protocol helpers used by the edge
 * functions (supabase/functions/_shared/payfast.ts): encoding, the three
 * signature schemes, checkout field construction and the membership
 * extension arithmetic that turns a payment into paid-up days.
 */

import { describe, expect, it } from 'vitest'
import { md5 } from 'js-md5'
import {
  apiSignature,
  buildCheckoutFields,
  checkoutSignature,
  expectedAmountCents,
  extendPaidUntil,
  isPlanId,
  itnSignatureValid,
  payfastHost,
  pfEncode,
  PLANS,
  REFERRAL_YEARLY_CENTS,
} from '../../supabase/functions/_shared/payfast'

const PASSPHRASE = 'jt7NOE43FZPn'

describe('pfEncode', () => {
  it('matches PHP urlencode: spaces as +, uppercase hex, reserved chars escaped', () => {
    expect(pfEncode('First Name')).toBe('First+Name')
    expect(pfEncode('https://example.com/return?a=1')).toBe(
      'https%3A%2F%2Fexample.com%2Freturn%3Fa%3D1',
    )
    expect(pfEncode("it's (fun)!*~")).toBe('it%27s+%28fun%29%21%2A%7E')
  })
})

describe('checkout signature', () => {
  const fields = {
    merchant_id: '10000100',
    merchant_key: '46f0cd694581a',
    return_url: 'https://example.com/plus?paid=1',
    amount: '200.00',
    item_name: 'PennyPlay Plus — yearly',
  }

  it('hashes the fields in the given order plus the passphrase', () => {
    const expected = md5(
      'merchant_id=10000100&merchant_key=46f0cd694581a' +
        '&return_url=https%3A%2F%2Fexample.com%2Fplus%3Fpaid%3D1' +
        '&amount=200.00' +
        `&item_name=${pfEncode('PennyPlay Plus — yearly')}` +
        `&passphrase=${PASSPHRASE}`,
    )
    expect(checkoutSignature(fields, PASSPHRASE, md5)).toBe(expected)
  })

  it('skips empty values and any pre-existing signature field', () => {
    const withNoise = { ...fields, custom_str2: '', signature: 'deadbeef' }
    expect(checkoutSignature(withNoise, PASSPHRASE, md5)).toBe(
      checkoutSignature(fields, PASSPHRASE, md5),
    )
  })

  it('changes when the passphrase or any value changes', () => {
    const base = checkoutSignature(fields, PASSPHRASE, md5)
    expect(checkoutSignature(fields, 'other', md5)).not.toBe(base)
    expect(checkoutSignature({ ...fields, amount: '1.00' }, PASSPHRASE, md5)).not.toBe(base)
  })
})

describe('ITN signature verification', () => {
  function signedItn(overrides: Record<string, string> = {}): URLSearchParams {
    const params = new URLSearchParams({
      m_payment_id: 'abc-123',
      pf_payment_id: '1089250',
      payment_status: 'COMPLETE',
      item_name: 'PennyPlay Plus — yearly',
      amount_gross: '200.00',
      custom_str1: 'user-1',
      merchant_id: '10000100',
      ...overrides,
    })
    const signable =
      [...params].map(([k, v]) => `${k}=${pfEncode(v)}`).join('&') +
      `&passphrase=${pfEncode(PASSPHRASE)}`
    params.set('signature', md5(signable))
    return params
  }

  it('accepts a correctly signed notification', () => {
    const params = signedItn()
    expect(itnSignatureValid(params, params.get('signature')!, PASSPHRASE, md5)).toBe(true)
  })

  it('rejects a tampered amount', () => {
    const params = signedItn()
    params.set('amount_gross', '999.00')
    expect(itnSignatureValid(params, params.get('signature')!, PASSPHRASE, md5)).toBe(false)
  })

  it('rejects a missing signature when a passphrase is configured', () => {
    const params = signedItn()
    expect(itnSignatureValid(params, undefined, PASSPHRASE, md5)).toBe(false)
    expect(itnSignatureValid(params, undefined, '', md5)).toBe(true)
  })
})

describe('API signature (subscription cancel)', () => {
  it('sorts all params alphabetically and includes the passphrase', () => {
    const headers = { 'merchant-id': '10000100', version: 'v1', timestamp: '2026-07-22T12:00:00' }
    const expected = md5(
      'merchant-id=10000100' +
        `&passphrase=${PASSPHRASE}` +
        '&timestamp=2026-07-22T12%3A00%3A00' +
        '&version=v1',
    )
    expect(apiSignature(headers, PASSPHRASE, md5)).toBe(expected)
  })
})

describe('checkout fields', () => {
  const base = {
    merchantId: '10000100',
    merchantKey: '46f0cd694581a',
    returnUrl: 'https://app.example/plus?paid=1',
    cancelUrl: 'https://app.example/plus?cancelled=1',
    notifyUrl: 'https://proj.supabase.co/functions/v1/payfast-itn',
    mPaymentId: 'uuid-1',
    userId: 'user-1',
  }

  it('yearly: a R200 PayFast subscription billed annually until cancelled', () => {
    const fields = buildCheckoutFields({ ...base, plan: 'yearly', amountCents: 20_000 })
    expect(fields.amount).toBe('200.00')
    expect(fields.custom_str1).toBe('user-1')
    expect(fields.custom_str3).toBe('yearly')
    expect(fields.subscription_type).toBe('1')
    expect(fields.recurring_amount).toBe('200.00')
    expect(fields.frequency).toBe('6') // annual
    expect(fields.cycles).toBe('0') // until cancelled
  })

  it('referral discount marks the ITN and merchant fields come first (signature order)', () => {
    const fields = buildCheckoutFields({
      ...base,
      plan: 'yearly',
      amountCents: REFERRAL_YEARLY_CENTS,
      referralDiscount: true,
    })
    expect(fields.amount).toBe('150.00')
    expect(fields.custom_str2).toBe('ref50')
    const keys = Object.keys(fields)
    expect(keys.indexOf('merchant_id')).toBe(0)
    expect(keys.indexOf('merchant_key')).toBe(1)
    expect(keys.indexOf('return_url')).toBeLessThan(keys.indexOf('amount'))
    expect(keys.indexOf('amount')).toBeLessThan(keys.indexOf('item_name'))
  })
})

describe('plans and amounts', () => {
  it('only sells the yearly plan', () => {
    expect(isPlanId('yearly')).toBe(true)
    expect(isPlanId('monthly')).toBe(false)
    expect(isPlanId('lifetime')).toBe(false)
    expect(isPlanId(undefined)).toBe(false)
    expect(Object.keys(PLANS)).toEqual(['yearly'])
  })

  it('prices: R200 yearly, R150 referral first year', () => {
    expect(expectedAmountCents('yearly', false)).toBe(20_000)
    expect(expectedAmountCents('yearly', true)).toBe(REFERRAL_YEARLY_CENTS)
  })

  it('sandbox vs live host', () => {
    expect(payfastHost(true)).toBe('sandbox.payfast.co.za')
    expect(payfastHost(false)).toBe('www.payfast.co.za')
  })
})

describe('extendPaidUntil', () => {
  const TODAY = '2026-07-22'

  it('a first yearly payment runs a year from today', () => {
    expect(extendPaidUntil(null, TODAY, 'yearly')).toBe('2027-07-22')
  })

  it('a renewal close to expiry keeps the remaining days, capped at one year ahead', () => {
    expect(extendPaidUntil('2026-07-23', TODAY, 'yearly')).toBe('2027-07-22') // capped
    expect(extendPaidUntil('2026-07-10', TODAY, 'yearly')).toBe('2027-07-22') // lapsed → from today
  })

  it('yearly is auto-renewing at PayFast', () => {
    expect(PLANS.yearly.recurring).toBe(true)
    expect(PLANS.yearly.frequency).toBe('6')
  })
})
