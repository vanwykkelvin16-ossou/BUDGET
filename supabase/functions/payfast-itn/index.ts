/**
 * PayFast ITN (Instant Transaction Notification) handler.
 *
 * PayFast POSTs here after a checkout. We verify the notification —
 * status, amount, signature (when a passphrase is set) and a server
 * postback to PayFast — then extend the payer's membership by a year.
 * Runs with the service role; the memberships table has no client-write
 * policies, so this function is the only writer.
 *
 * Deploy:  supabase functions deploy payfast-itn --no-verify-jwt
 * Env:     PAYFAST_PASSPHRASE (optional but recommended)
 *          PAYFAST_SANDBOX=1 while testing
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'

const PLUS_PRICE = '200.00'
const REFERRAL_PRICE = '150.00' // first payment with an unlocked R50 reward
const YEAR_DAYS = 365

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const params = new URLSearchParams(raw)
  const data: Record<string, string> = {}
  for (const [k, v] of params) data[k] = v

  // 1) Status + amount must match the offer. A referral-discounted first
  //    payment (R150) is only accepted after checking the referral below.
  if (data.payment_status !== 'COMPLETE') return new Response('ignored', { status: 200 })
  const claimsDiscount = data.custom_str2 === 'ref50'
  const expected = Number.parseFloat(claimsDiscount ? REFERRAL_PRICE : PLUS_PRICE)
  if (Number.parseFloat(data.amount_gross ?? '0') < expected) {
    return new Response('amount mismatch', { status: 400 })
  }

  // 2) Signature check (parameter order as received, minus the signature).
  const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
  const pairs: string[] = []
  for (const [k, v] of params) {
    if (k === 'signature') continue
    pairs.push(`${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`)
  }
  let signable = pairs.join('&')
  if (passphrase) signable += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  if (data.signature && md5(signable) !== data.signature) {
    return new Response('bad signature', { status: 400 })
  }

  // 3) Ask PayFast to confirm this notification really came from them.
  const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
  const host = sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za'
  const validate = await fetch(`https://${host}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: raw,
  })
  if ((await validate.text()).trim() !== 'VALID') {
    return new Response('validation failed', { status: 400 })
  }

  // 4) Extend the membership: a year on top of what's left, or from today.
  const userId = data.custom_str1
  if (!userId) return new Response('no user reference', { status: 400 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('memberships')
    .select('paid_until')
    .eq('user_id', userId)
    .maybeSingle()

  // The R50 reward: first payment only. Allowed when the payer invited a
  // friend (referrer) OR entered someone's code / arrived via a share link
  // (referred).
  if (claimsDiscount) {
    if (existing) return new Response('discount only applies to the first payment', { status: 400 })
    const { count: asReferrer } = await supabase
      .from('referrals')
      .select('referred_user_id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId)
    const { count: asReferred } = await supabase
      .from('referrals')
      .select('referred_user_id', { count: 'exact', head: true })
      .eq('referred_user_id', userId)
    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .maybeSingle()
    const eligible =
      (asReferrer ?? 0) > 0 || (asReferred ?? 0) > 0 || Boolean(profile?.referred_by)
    if (!eligible) {
      return new Response('no referral discount on record', { status: 400 })
    }
  }

  // One year at a time: never further than 365 days from today.
  const cap = new Date(Date.parse(today) + YEAR_DAYS * 86_400_000).toISOString().slice(0, 10)
  const base =
    existing?.paid_until && existing.paid_until > today ? existing.paid_until : today
  let paidUntil = new Date(Date.parse(base) + YEAR_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  if (paidUntil > cap) paidUntil = cap

  const { error } = await supabase.from('memberships').upsert({
    user_id: userId,
    paid_until: paidUntil,
    payment_ref: data.pf_payment_id ?? '',
    amount_cents: Math.round(Number.parseFloat(data.amount_gross) * 100),
    updated_at: new Date().toISOString(),
  })
  if (error) return new Response('store failed', { status: 500 })

  return new Response('ok', { status: 200 })
})
