/**
 * PennyPlay Plus — the yearly membership. R200 unlocks the full app for
 * 12 months and auto-renews each year via PayFast recurring billing.
 *
 * Payments run through PayFast (South Africa). With merchant env vars set
 * the Pay button redirects to a yearly subscription checkout and the
 * payfast-itn edge function activates/extends the membership server-side;
 * without them the flow runs in clearly-labelled test mode so it can be
 * tried end to end. Membership state lives in Supabase when connected,
 * and in localStorage in on-device mode.
 */

import { addDays, todaySAST } from './dates'

export const PLUS_PRICE_CENTS = 20_000 // R200,00
export const PLUS_DAYS = 365

export interface Membership {
  /** ISO date the membership is paid up to (inclusive). */
  paidUntil: string
  /** Payment reference from the provider (or 'test-mode'). */
  paymentRef: string
  amountCents: number
  activatedAt: string
}

const KEY = 'pennyplay:membership:v1'

/**
 * One year at a time: a membership can never run further than 365 days
 * from today. Also self-heals over-stacked dates from older builds.
 */
export function clampToOneYear(m: Membership, today: string = todaySAST()): Membership {
  const cap = addDays(today, PLUS_DAYS)
  return m.paidUntil > cap ? { ...m, paidUntil: cap } : m
}

export function loadMembership(): Membership | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const clamped = clampToOneYear(JSON.parse(raw) as Membership)
    localStorage.setItem(KEY, JSON.stringify(clamped))
    return clamped
  } catch {
    return null
  }
}

export function saveMembership(m: Membership): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* storage unavailable */
  }
}

export type MembershipStatus = 'active' | 'expired' | 'none'

export function membershipStatus(m: Membership | null, today: string = todaySAST()): MembershipStatus {
  if (!m) return 'none'
  return today <= m.paidUntil ? 'active' : 'expired'
}

/** Days of access remaining, 0 when lapsed. */
export function daysLeft(m: Membership | null, today: string = todaySAST()): number {
  if (!m || today > m.paidUntil) return 0
  return Math.round((Date.parse(m.paidUntil) - Date.parse(today)) / 86_400_000)
}

/** A fresh year of access starting today (renewals extend from paidUntil). */
export function yearFrom(m: Membership | null, today: string = todaySAST()): string {
  const base = m && today <= m.paidUntil ? m.paidUntil : today
  return addDays(base, PLUS_DAYS)
}

/* ------------------------------------------------------------------ */
/* PayFast checkout                                                     */
/* ------------------------------------------------------------------ */

export interface PayfastConfig {
  merchantId: string
  merchantKey: string
  sandbox: boolean
}

/** Merchant config from build-time env; null → test mode. */
export function payfastConfig(): PayfastConfig | null {
  const merchantId = import.meta.env.VITE_PAYFAST_MERCHANT_ID as string | undefined
  const merchantKey = import.meta.env.VITE_PAYFAST_MERCHANT_KEY as string | undefined
  if (!merchantId || !merchantKey) return null
  return {
    merchantId,
    merchantKey,
    sandbox: (import.meta.env.VITE_PAYFAST_SANDBOX as string | undefined) === '1',
  }
}

/** Build the PayFast yearly auto-renew subscription checkout URL. */
export function payfastCheckoutUrl(params: {
  config: PayfastConfig
  origin: string
  email?: string
  name?: string
  /** Passed back via ITN so the edge function knows whose year to activate. */
  userId?: string
  /** Defaults to the full R200; R150 when the referral reward applies (first year only). */
  amountCents?: number
  /** Marks the ITN as a referral-discounted first payment for validation. */
  referralDiscount?: boolean
}): string {
  const { config, origin } = params
  const host = config.sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za'
  const firstAmount = ((params.amountCents ?? PLUS_PRICE_CENTS) / 100).toFixed(2)
  // Renewals are always full price — the R50 referral cut is first year only.
  const renewAmount = (PLUS_PRICE_CENTS / 100).toFixed(2)
  const query = new URLSearchParams({
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: `${origin}/plus?paid=1`,
    cancel_url: `${origin}/plus?cancelled=1`,
    amount: firstAmount,
    item_name: 'PennyPlay Plus — yearly',
    item_description: 'Full access to PennyPlay. Billed yearly and auto-renews.',
    // PayFast recurring billing: charge again every year until cancelled.
    subscription_type: '1',
    recurring_amount: renewAmount,
    frequency: '6', // annual
    cycles: '0', // indefinite
  })
  if (params.email) query.set('email_address', params.email)
  if (params.name) query.set('name_first', params.name)
  if (params.userId) query.set('custom_str1', params.userId)
  if (params.referralDiscount) query.set('custom_str2', 'ref50')
  // Server-side confirmation: PayFast posts the ITN here and the edge
  // function writes the membership row (including each auto-renewal).
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (supabaseUrl) query.set('notify_url', `${supabaseUrl}/functions/v1/payfast-itn`)
  return `https://${host}/eng/process?${query.toString()}`
}
