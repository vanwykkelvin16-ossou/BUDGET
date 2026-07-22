/**
 * PayFast ITN (Instant Transaction Notification) handler.
 *
 * PayFast POSTs here after every payment event — first checkouts, yearly
 * subscription renewals, failed charges and subscription cancellations.
 * Each notification is verified (merchant id, signature, server postback
 * to PayFast, and for successful payments the amount against the plan's
 * server-side price) and then:
 *
 *   COMPLETE  → recorded in the payments ledger + membership extended by
 *               a year (capped at 365 days from today)
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
 *          (required for the yearly subscription), PAYFAST_SANDBOX=1 while testing
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'
import {
  expectedAmountCents,
  extendPaidUntil,
  isPlanId,
  itnSignatureValid,
  payfastHost,
  type PlanId,
} from '../_shared/payfast.ts'
import { payfastEnv } from '../_shared/payfastEnv.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const params = new URLSearchParams(raw)
  const data: Record<string, string> = {}
  for (const [k, v] of params) data[k] = v

  // 1) The notification must be addressed to OUR merchant account
  //    (live secrets, or the public sandbox merchant before any are set).
  const { merchantId, passphrase, sandbox } = payfastEnv()
  if (data.merchant_id !== merchantId) {
    return new Response('merchant mismatch', { status: 400 })
  }

  // 2) Signature check (parameter order as received, minus the signature).
  //    Only enforceable when we know the account's passphrase — the shared
  //    sandbox fallback signs with a salt we don't have, so there the
  //    postback to PayFast below is the authenticity check.
  if (passphrase && !itnSignatureValid(params, data.signature, passphrase, md5)) {
    return new Response('bad signature', { status: 400 })
  }

  // 3) Ask PayFast to confirm this notification really came from them.
  const validate = await fetch(`https://${payfastHost(sandbox)}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: raw,
  })
  if ((await validate.text()).trim() !== 'VALID') {
    return new Response('validation failed', { status: 400 })
  }

  // 4) Whose payment is this? Plus is yearly-only.
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
    if (existing) {
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

  // 9) Extend the membership by a year (capped — one year at a time).
  const paidUntil = extendPaidUntil(existing?.paid_until ?? null, today, plan)
  const token = data.token ?? existing?.payfast_token ?? ''

  const { error } = await supabase.from('memberships').upsert({
    user_id: userId,
    paid_until: paidUntil,
    payment_ref: data.pf_payment_id ?? '',
    amount_cents: amountCents,
    plan: 'yearly',
    status: 'active',
    payfast_token: token,
    cancelled_at: null,
    updated_at: new Date().toISOString(),
  })
  if (error) return new Response('store failed', { status: 500 })

  return new Response('ok', { status: 200 })
})
