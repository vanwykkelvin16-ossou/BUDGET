/**
 * One place that knows how to buy Plus — used by the /plus screen and the
 * 45-second gate. Resolution order:
 *
 *   1. payfast-checkout edge function → signed, server-priced form POST
 *      (the only path that can sell the yearly auto-renew subscription)
 *   2. legacy client-built checkout URL from VITE_PAYFAST_* env (unsigned
 *      fallback — cannot create a real PayFast subscription)
 *   3. clearly-labelled test mode: activates locally on this device
 */

import { getSupabaseClient } from './supabaseClient'
import {
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
  plan?: PlanId
  priceCents: number
  referralDiscount: boolean
  current: Membership | null
  email?: string
  name?: string
}): Promise<CheckoutResult> {
  const plan: PlanId = params.plan ?? 'yearly'

  // 1) Server-signed checkout (required for the yearly auto-renew
  //    subscription — PayFast only accepts signed subscription requests).
  const server = await requestServerCheckout(plan)
  if (server !== 'unavailable' && server !== 'not-configured') {
    submitCheckoutForm(server)
    return 'redirected'
  }

  // 2) Legacy client-side checkout — unsigned yearly URL. Prefer the
  //    edge function; this path cannot start a real PayFast subscription.
  const config = payfastConfig()
  if (config) {
    if (server === 'not-configured') {
      return {
        error:
          'Yearly auto-renew needs the payment server (payfast-checkout + PAYFAST_PASSPHRASE) configured.',
      }
    }
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

  // 3) Test mode — no merchant keys configured anywhere yet.
  const activated: Membership = {
    paidUntil: yearFrom(params.current, todaySAST()),
    paymentRef: 'test-mode',
    amountCents: params.priceCents,
    activatedAt: new Date().toISOString(),
    plan: 'yearly',
    billing: 'active',
  }
  saveMembership(activated)
  return activated
}
