/**
 * PennyPlay Plus — the membership. Two paid plans:
 *
 *   monthly — R25/month, auto-billed by PayFast, cancel anytime
 *   yearly  — R200 once for 12 months (no auto-debit surprises: when the
 *             year is up, you pay again)
 *
 * Payments run through PayFast (South Africa). With merchant env vars set
 * on the edge functions, checkout is built and signed server-side
 * (payfast-checkout), confirmed server-side (payfast-itn) and cancelled
 * server-side (payfast-cancel); without them the flow runs in
 * clearly-labelled test mode so it can be tried end to end. Membership
 * state lives in Supabase when connected — the server row always wins —
 * and in localStorage in on-device mode.
 */

import { addDays, todaySAST } from './dates'

export type PlanId = 'monthly' | 'yearly'

export const PLUS_PRICE_CENTS = 20_000 // yearly: R200,00
export const MONTHLY_PRICE_CENTS = 2_500 // monthly: R25,00
export const PLUS_DAYS = 365

export interface Membership {
  /** ISO date the membership is paid up to (inclusive). */
  paidUntil: string
  /** Payment reference from the provider (or 'test-mode'). */
  paymentRef: string
  amountCents: number
  activatedAt: string
  /** Which plan the last successful payment bought. */
  plan: PlanId
  /** 'cancelled' = auto-billing stopped; access still runs to paidUntil. */
  billing: 'active' | 'cancelled'
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

/** Fill fields older stored versions didn't have. */
function normalise(raw: Partial<Membership>): Membership {
  return {
    paidUntil: raw.paidUntil ?? '',
    paymentRef: raw.paymentRef ?? '',
    amountCents: raw.amountCents ?? PLUS_PRICE_CENTS,
    activatedAt: raw.activatedAt ?? '',
    plan: raw.plan === 'monthly' ? 'monthly' : 'yearly',
    billing: raw.billing === 'cancelled' ? 'cancelled' : 'active',
  }
}

export function loadMembership(): Membership | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const clamped = clampToOneYear(normalise(JSON.parse(raw) as Partial<Membership>))
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

/** Server says there is no membership — drop the local cache. */
export function clearMembership(): void {
  try {
    localStorage.removeItem(KEY)
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

/** A month (with billing grace) of access — mirrors the ITN's arithmetic. */
export function monthFrom(m: Membership | null, today: string = todaySAST()): string {
  const base = m && today <= m.paidUntil ? m.paidUntil : today
  return addDays(base, 33)
}

/* ------------------------------------------------------------------ */
/* Legacy client-built PayFast checkout (yearly only)                   */
/*                                                                      */
/* Kept as a fallback for deployments that set the VITE_PAYFAST_* vars  */
/* but haven't configured the payfast-checkout edge function. The       */
/* subscription (monthly) plan REQUIRES the edge function because       */
/* PayFast only accepts signed subscription requests, and signing needs */
/* the server-side passphrase.                                          */
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

/** Build the PayFast checkout URL for one year of Plus. */
export function payfastCheckoutUrl(params: {
  config: PayfastConfig
  origin: string
  email?: string
  name?: string
  /** Passed back via ITN so the edge function knows whose year to activate. */
  userId?: string
  /** Defaults to the full R200; R150 when the referral reward applies. */
  amountCents?: number
  /** Marks the ITN as a referral-discounted first payment for validation. */
  referralDiscount?: boolean
}): string {
  const { config, origin } = params
  const host = config.sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za'
  const query = new URLSearchParams({
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: `${origin}/plus?paid=1`,
    cancel_url: `${origin}/plus?cancelled=1`,
    amount: ((params.amountCents ?? PLUS_PRICE_CENTS) / 100).toFixed(2),
    item_name: 'PennyPlay Plus — 1 year',
    item_description: 'Full access to PennyPlay for 12 months, billed yearly.',
  })
  if (params.email) query.set('email_address', params.email)
  if (params.name) query.set('name_first', params.name)
  if (params.userId) query.set('custom_str1', params.userId)
  if (params.referralDiscount) query.set('custom_str2', 'ref50')
  query.set('custom_str3', 'yearly')
  // Server-side confirmation: PayFast posts the ITN here and the edge
  // function writes the membership row.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (supabaseUrl) query.set('notify_url', `${supabaseUrl}/functions/v1/payfast-itn`)
  return `https://${host}/eng/process?${query.toString()}`
}
