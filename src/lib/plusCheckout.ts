/**
 * One place that knows how to buy a year of Plus — used by the /plus
 * screen and the 35-second gate. Real PayFast checkout when merchant
 * keys exist (the browser leaves for the payment page); test-mode
 * activation otherwise.
 */

import { getSupabaseClient } from './supabaseClient'
import {
  payfastCheckoutUrl,
  payfastConfig,
  saveMembership,
  yearFrom,
  type Membership,
} from './membership'
import { todaySAST } from './dates'

export async function payForYear(params: {
  priceCents: number
  referralDiscount: boolean
  current: Membership | null
  email?: string
  name?: string
}): Promise<'redirected' | Membership> {
  const config = payfastConfig()
  if (config) {
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
