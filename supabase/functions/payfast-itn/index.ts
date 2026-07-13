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
const YEAR_DAYS = 365

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const params = new URLSearchParams(raw)
  const data: Record<string, string> = {}
  for (const [k, v] of params) data[k] = v

  // 1) Status + amount must match the offer.
  if (data.payment_status !== 'COMPLETE') return new Response('ignored', { status: 200 })
  if (Number.parseFloat(data.amount_gross ?? '0') < Number.parseFloat(PLUS_PRICE)) {
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
  const base =
    existing?.paid_until && existing.paid_until > today ? existing.paid_until : today
  const paidUntil = new Date(Date.parse(base) + YEAR_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

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
