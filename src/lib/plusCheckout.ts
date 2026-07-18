/**
 * One place that knows how to buy a year of Plus — used by the /plus
 * screen and the 30-second subscription gate. Real PayFast yearly
 * auto-renew subscription when merchant keys exist (the browser leaves
 * for the payment page); test-mode activation otherwise.
 *
 * A real payment must belong to an account: the ITN edge function keys the
 * membership on the Supabase user id. A signed-out payer (demo mode) gets
 * 'needs-account' back so the caller can route them through sign-up first
 * instead of taking money that can't be attached to anyone.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import {
  payfastCheckoutUrl,
  payfastConfig,
  saveMembership,
  yearFrom,
  type Membership,
} from './membership'
import { todaySAST } from './dates'

export type PayResult = 'redirected' | 'needs-account' | Membership

/**
 * Marker set when the browser leaves for PayFast. While it is fresh the
 * gate polls the server for the ITN confirmation instead of blocking the
 * payer. Cleared on confirmation, cancellation, or expiry.
 */
const PENDING_KEY = 'pennyplay:payment-pending:v1'
const PENDING_MAX_AGE_MS = 10 * 60 * 1000

export function markPaymentPending(at: number = Date.now()): void {
  try {
    localStorage.setItem(PENDING_KEY, new Date(at).toISOString())
  } catch {
    /* ignore */
  }
}

export function clearPaymentPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

export function paymentPending(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return false
    const at = Date.parse(raw)
    if (!Number.isFinite(at) || now - at > PENDING_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function payForYear(params: {
  priceCents: number
  referralDiscount: boolean
  current: Membership | null
  email?: string
  name?: string
}): Promise<PayResult> {
  const config = payfastConfig()
  if (config) {
    const supabase = getSupabaseClient()
    const userId = supabase ? (await supabase.auth.getUser()).data.user?.id : undefined
    if (isSupabaseConfigured() && !userId) return 'needs-account'
    markPaymentPending()
    window.location.href = payfastCheckoutUrl({
      config,
      origin: window.location.origin,
      email: params.email,
      name: params.name,
      userId,
      amountCents: params.priceCents,
      referralDiscount: params.referralDiscount,
    })
    return 'redirected'
  }
  // Test mode — no merchant keys configured yet.
  const activated: Membership = {
    paidUntil: yearFrom(params.current, todaySAST()),
    paymentRef: 'test-mode',
    amountCents: params.priceCents,
    activatedAt: new Date().toISOString(),
  }
  saveMembership(activated)
  return activated
}
