/**
 * Keep local Membership in sync with the server when Supabase is connected.
 * PlusGate and boot both need this so a paid year isn't lost on refresh
 * before the ITN-written memberships row is re-read.
 */

import { getSupabaseClient } from './supabaseClient'
import {
  clampToOneYear,
  loadMembership,
  membershipStatus,
  saveMembership,
  type Membership,
  PLUS_PRICE_CENTS,
} from './membership'

/** Fetch the signed-in user's membership row and mirror it into localStorage. */
export async function hydrateMembershipFromServer(): Promise<Membership | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return loadMembership()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return loadMembership()

  const { data } = await supabase
    .from('memberships')
    .select('paid_until, payment_ref, amount_cents, activated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (!data?.paid_until) return loadMembership()

  const server: Membership = clampToOneYear({
    paidUntil: data.paid_until as string,
    paymentRef: (data.payment_ref as string) ?? 'payfast',
    amountCents: (data.amount_cents as number) ?? PLUS_PRICE_CENTS,
    activatedAt: (data.activated_at as string) ?? '',
  })
  saveMembership(server)
  return server
}

export async function hasActiveMembership(): Promise<boolean> {
  const m = await hydrateMembershipFromServer()
  return membershipStatus(m) === 'active'
}
