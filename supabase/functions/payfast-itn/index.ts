/**
 * PayFast ITN (Instant Transaction Notification) handler.
 *
 * PayFast POSTs here after every payment event — first checkouts, monthly
 * subscription charges, failed charges and subscription cancellations.
 * Each notification is verified (merchant id, signature, server postback
 * to PayFast, and for successful payments the amount against the plan's
 * server-side price) and then:
 *
 *   COMPLETE  → recorded in the payments ledger + membership extended by
 *               the plan's period (monthly +33 days, yearly +365, capped)
 *   CANCELLED → recorded + membership marked cancelled (access continues
 *               until paid_until — no clawback of paid time)
 *   other     → recorded (failed/pending) so the app can surface it
 *
 * Redeliveries are idempotent: the (pf_payment_id, status) pair is unique
 * in the ledger and a duplicate is acknowledged without reprocessing.
 * Runs with the service role; memberships/payments have no client-write
 * policies, so this function is the only writer.
 *
 * Deploy:  supabase functions deploy payfast-itn --no-verify-jwt
 * Env:     PAYFAST_MERCHANT_ID (recommended), PAYFAST_PASSPHRASE
 *          (required for subscriptions), PAYFAST_SANDBOX=1 while testing
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'
import {
  apiSignature,
  expectedAmountCents,
  extendPaidUntil,
  isPlanId,
  itnSignatureValid,
  payfastHost,
  type PlanId,
} from '../_shared/payfast.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const params = new URLSearchParams(raw)
  const data: Record<string, string> = {}
  for (const [k, v] of params) data[k] = v

  // 1) The notification must be addressed to OUR merchant account.
  const ourMerchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
  if (ourMerchantId && data.merchant_id !== ourMerchantId) {
    return new Response('merchant mismatch', { status: 400 })
  }

  // 2) Signature check (parameter order as received, minus the signature).
  const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
  if (!itnSignatureValid(params, data.signature, passphrase, md5)) {
    return new Response('bad signature', { status: 400 })
  }

  // 3) Ask PayFast to confirm this notification really came from them.
  const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
  const validate = await fetch(`https://${payfastHost(sandbox)}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: raw,
  })
  if ((await validate.text()).trim() !== 'VALID') {
    return new Response('validation failed', { status: 400 })
  }

  // 4) Whose payment is this, and for which plan?
  const userId = data.custom_str1
  if (!userId) return new Response('no user reference', { status: 400 })
  const plan: PlanId = isPlanId(data.custom_str3) ? data.custom_str3 : 'yearly'
  const pfStatus = (data.payment_status ?? '').toUpperCase()
  const amountCents = Math.round(Number.parseFloat(data.amount_gross ?? '0') * 100)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 5) Ledger first — this also makes redeliveries idempotent.
  const ledgerStatus =
    pfStatus === 'COMPLETE' ? 'complete' : pfStatus === 'CANCELLED' ? 'cancelled' : 'failed'
  const { error: ledgerError } = await supabase.from('payments').insert({
    user_id: userId,
    pf_payment_id: data.pf_payment_id ?? '',
    m_payment_id: data.m_payment_id ?? '',
    plan,
    status: ledgerStatus,
    amount_cents: Number.isFinite(amountCents) ? amountCents : 0,
    item_name: data.item_name ?? '',
  })
  if (ledgerError) {
    // 23505 = unique violation → this exact notification was already
    // processed; acknowledge so PayFast stops retrying.
    if (ledgerError.code === '23505') return new Response('already processed', { status: 200 })
    return new Response('ledger failed', { status: 500 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
  const { data: existing } = await supabase
    .from('memberships')
    .select('paid_until, plan, status, payfast_token')
    .eq('user_id', userId)
    .maybeSingle()

  // 6) Subscription cancelled at PayFast (by us, the user's bank, or
  //    PayFast support) — flag it, keep the paid-up time.
  if (pfStatus === 'CANCELLED') {
    if (existing) {
      await supabase
        .from('memberships')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }
    return new Response('ok', { status: 200 })
  }

  // 7) Failed / pending charges never move the membership.
  if (pfStatus !== 'COMPLETE') return new Response('ok', { status: 200 })

  // 8) The money must match the plan's server-side price. A
  //    referral-discounted first yearly payment (R150) is only accepted
  //    with a real signed-up referral on record.
  const claimsDiscount = data.custom_str2 === 'ref50'
  if (claimsDiscount) {
    if (plan !== 'yearly' || existing) {
      return new Response('discount only applies to the first yearly payment', { status: 400 })
    }
    const { count } = await supabase
      .from('referrals')
      .select('referred_user_id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId)
    if (!count || count < 1) {
      return new Response('no signed-up referral on record', { status: 400 })
    }
  }
  if (amountCents < expectedAmountCents(plan, claimsDiscount)) {
    return new Response('amount mismatch', { status: 400 })
  }

  // 9) Extend the membership by the plan's period (capped — one year at a
  //    time, and an upgrade replaces rather than stacks).
  const paidUntil = extendPaidUntil(existing?.paid_until ?? null, today, plan)
  const token = data.token ?? (plan === existing?.plan ? existing?.payfast_token ?? '' : '')

  const { error } = await supabase.from('memberships').upsert({
    user_id: userId,
    paid_until: paidUntil,
    payment_ref: data.pf_payment_id ?? '',
    amount_cents: amountCents,
    plan,
    status: 'active',
    payfast_token: token,
    cancelled_at: null,
    updated_at: new Date().toISOString(),
  })
  if (error) return new Response('store failed', { status: 500 })

  // 10) A yearly purchase supersedes a running monthly subscription —
  //     cancel the old subscription at PayFast so the R25 debits stop.
  if (
    plan === 'yearly' &&
    existing?.plan === 'monthly' &&
    existing.payfast_token &&
    existing.status === 'active'
  ) {
    try {
      await cancelSubscription(existing.payfast_token, sandbox, passphrase)
    } catch {
      // Best effort — the user can still cancel from the app or PayFast
      // dashboard; their access is already upgraded either way.
    }
  }

  return new Response('ok', { status: 200 })
})

/** PayFast subscriptions API: PUT /subscriptions/{token}/cancel. */
async function cancelSubscription(
  token: string,
  sandbox: boolean,
  passphrase: string,
): Promise<void> {
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
  if (!merchantId || !passphrase) throw new Error('merchant credentials missing')
  const timestamp = new Date().toISOString().slice(0, 19)
  const headers = { 'merchant-id': merchantId, version: 'v1', timestamp }
  const signature = apiSignature(headers, passphrase, md5)
  const testing = sandbox ? '?testing=true' : ''
  const res = await fetch(
    `https://api.payfast.co.za/subscriptions/${encodeURIComponent(token)}/cancel${testing}`,
    { method: 'PUT', headers: { ...headers, signature } },
  )
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`)
}
