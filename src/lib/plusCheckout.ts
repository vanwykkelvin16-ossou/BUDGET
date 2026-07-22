/**
 * One place that knows how to buy Plus — used by the /plus screen and the
 * 45-second gate. Resolution order:
 *
 *   1. payfast-checkout edge function → signed, server-priced form POST
 *      (the only path that can sell the monthly subscription)
 *   2. legacy client-built checkout URL from VITE_PAYFAST_* env (yearly)
 *   3. clearly-labelled test mode: activates locally on this device
 */

import { getSupabaseClient } from './supabaseClient'
import {
  monthFrom,
  payfastCheckoutUrl,
  payfastConfig,
  saveMembership,
  yearFrom,
  type Membership,
  type PlanId,
} from './membership'
import { requestServerCheckout, submitCheckoutForm } from './plusServer'
import { todaySAST } from './dates'

export type CheckoutResult = 'redirected' | Membership | { error: string }

export async function payForPlan(params: {
  plan: PlanId
  priceCents: number
  referralDiscount: boolean
  current: Membership | null
  email?: string
  name?: string
}): Promise<CheckoutResult> {
  // 1) Server-signed checkout (required for monthly, best for yearly).
  const server = await requestServerCheckout(params.plan)
  if (server !== 'unavailable' && server !== 'not-configured') {
    submitCheckoutForm(server)
    return 'redirected'
  }

  // 2) Legacy client-side checkout — yearly only (subscriptions need the
  //    server-held passphrase to sign).
  const config = payfastConfig()
  if (config && params.plan === 'yearly') {
    const supabase = getSupabaseClient()
    const userId = supabase ? (await supabase.auth.getUser()).data.user?.id : undefined
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
  if (config && params.plan === 'monthly') {
    return {
      error:
        'Monthly billing needs the payment server (payfast-checkout) configured — the yearly plan is available now.',
    }
  }

  // 3) Test mode — no merchant keys configured anywhere yet.
  const today = todaySAST()
  const activated: Membership = {
    paidUntil:
      params.plan === 'monthly'
        ? monthFrom(params.current, today)
        : yearFrom(params.current, today),
    paymentRef: 'test-mode',
    amountCents: params.priceCents,
    activatedAt: new Date().toISOString(),
    plan: params.plan,
    billing: 'active',
  }
  saveMembership(activated)
  return activated
}
