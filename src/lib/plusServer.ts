/**
 * The Supabase side of Plus: hydrate the membership from the server (the
 * server row always beats local state for signed-in users), read payment
 * history, request a signed checkout and cancel a subscription. Every
 * function degrades to null/[] when the app runs without Supabase.
 */

import { getSupabaseClient } from './supabaseClient'
import {
  clampToOneYear,
  clearMembership,
  loadMembership,
  PLUS_PRICE_CENTS,
  saveMembership,
  type Membership,
  type PlanId,
} from './membership'

function rowToMembership(row: Record<string, unknown>): Membership {
  return clampToOneYear({
    paidUntil: (row.paid_until as string) ?? '',
    paymentRef: (row.payment_ref as string) || 'payfast',
    amountCents: (row.amount_cents as number) ?? PLUS_PRICE_CENTS,
    activatedAt: (row.activated_at as string) ?? '',
        plan: 'yearly',
        billing: row.status === 'cancelled' ? 'cancelled' : 'active',
      })
    }

/**
 * Reconcile local membership state with the server. Signed-in users get
 * the server row as truth: it is saved locally when present, and a stale
 * local PayFast membership is dropped when the server has none (a device-
 * level 'test-mode' unlock is the one thing allowed to stand, since local
 * installs without payment rails have no server row by design).
 */
export async function syncMembershipFromServer(): Promise<Membership | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return loadMembership()
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return loadMembership()
    const { data, error } = await supabase
      .from('memberships')
      .select('paid_until, payment_ref, amount_cents, activated_at, plan, status')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (error) return loadMembership() // offline etc. — local cache stands
    if (data?.paid_until) {
      const server = rowToMembership(data)
      saveMembership(server)
      return server
    }
    const local = loadMembership()
    if (local && local.paymentRef !== 'test-mode') {
      clearMembership()
      return null
    }
    return local
  } catch {
    return loadMembership()
  }
}

export interface PaymentRecord {
  pfPaymentId: string
  plan: PlanId
  status: 'complete' | 'failed' | 'cancelled' | 'pending'
  amountCents: number
  itemName: string
  createdAt: string
}

/** Always yearly — older rows may still say monthly; coerce for display. */
function coercePlan(_value: unknown): PlanId {
  return 'yearly'
}

/** Recent payment history, newest first. Empty in on-device mode. */
export async function fetchPayments(limit = 12): Promise<PaymentRecord[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return []
    const { data } = await supabase
      .from('payments')
      .select('pf_payment_id, plan, status, amount_cents, item_name, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((row) => ({
      pfPaymentId: (row.pf_payment_id as string) ?? '',
      plan: coercePlan(row.plan),
      status: (row.status as PaymentRecord['status']) ?? 'complete',
      amountCents: (row.amount_cents as number) ?? 0,
      itemName: (row.item_name as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
    }))
  } catch {
    return []
  }
}

export interface ServerCheckout {
  host: string
  sandbox: boolean
  amountCents: number
  fields: Record<string, string>
  /** Live merchant is configured but PayFast says it can't receive yet. */
  livePending?: boolean
  warning?: string
}

/**
 * Ask the payfast-checkout edge function for a signed, server-priced
 * checkout. Returns:
 *   ServerCheckout      — POST fields to https://{host}/eng/process
 *   'not-configured'    — merchant env not set server-side (fall back)
 *   'unavailable'       — no Supabase / not signed in / function missing
 *   { error }           — server returned an actionable error message
 */
export async function requestServerCheckout(
  plan: PlanId,
): Promise<ServerCheckout | 'not-configured' | 'unavailable' | { error: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) return 'unavailable'
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return 'unavailable'
    const { data, error } = await supabase.functions.invoke('payfast-checkout', {
      body: { plan, origin: window.location.origin },
    })
    if (error && !data) return 'unavailable'
    if (data?.error && typeof data.error === 'string') return { error: data.error }
    if (data?.configured === false) return 'not-configured'
    if (!data?.fields || !data?.host) return 'unavailable'
    return {
      host: data.host as string,
      sandbox: Boolean(data.sandbox),
      amountCents: (data.amountCents as number) ?? 0,
      fields: data.fields as Record<string, string>,
      livePending: Boolean(data.livePending),
      warning: typeof data.warning === 'string' ? data.warning : undefined,
    }
  } catch {
    return 'unavailable'
  }
}

/** Leave the page for PayFast by submitting the signed fields as a form. */
export function submitCheckoutForm(checkout: ServerCheckout): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `https://${checkout.host}/eng/process`
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

/**
 * Cancel the yearly auto-renew (stops PayFast billing; access runs to
 * the end of the paid period). Returns the updated membership, or an
 * error message.
 */
export async function cancelPlusSubscription(): Promise<
  { ok: true; membership: Membership | null } | { ok: false; message: string }
> {
  const supabase = getSupabaseClient()
  const local = loadMembership()
  if (!supabase || local?.paymentRef === 'test-mode') {
    // On-device / test-mode membership — cancel locally.
    if (!local) return { ok: false, message: 'No membership to cancel.' }
    const cancelled: Membership = { ...local, billing: 'cancelled' }
    saveMembership(cancelled)
    return { ok: true, membership: cancelled }
  }
  try {
    const { data, error } = await supabase.functions.invoke('payfast-cancel', { body: {} })
    if (error || !data?.cancelled) {
      return {
        ok: false,
        message:
          (data?.error as string | undefined) ??
          'Could not reach PayFast — please try again in a minute.',
      }
    }
    const membership = await syncMembershipFromServer()
    return { ok: true, membership }
  } catch {
    return { ok: false, message: 'Could not reach PayFast — please try again in a minute.' }
  }
}
