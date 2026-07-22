/**
 * payfast-checkout — builds a signed PayFast checkout for the signed-in
 * user. The price, plan details and referral discount are all decided
 * HERE, server-side, so a tampered client can never buy a year for one
 * rand: the ITN handler independently re-checks the amount against the
 * same plan table.
 *
 * POST JSON { plan: 'monthly' | 'yearly', origin: string }
 *   → { configured: true, host, fields }  — client POSTs `fields` to
 *     https://{host}/eng/process as a form
 *   → { configured: false }               — merchant env not set; the
 *     client falls back to its legacy/test-mode flow
 *
 * Deploy: supabase functions deploy payfast-checkout
 * Env:    PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY,
 *         PAYFAST_PASSPHRASE (required for the monthly subscription),
 *         PAYFAST_SANDBOX=1 while testing
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'
import {
  buildCheckoutFields,
  checkoutSignature,
  expectedAmountCents,
  isPlanId,
  payfastHost,
  PLANS,
} from '../_shared/payfast.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    // Who is paying? Identify the caller from their JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
    const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY') ?? ''
    const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
    const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
    if (!merchantId || !merchantKey) return json({ configured: false })

    const body = await req.json()
    const plan = body.plan
    if (!isPlanId(plan)) return json({ error: 'unknown plan' }, 400)
    // PayFast rejects unsigned subscription requests, so without a
    // passphrase only the once-off yearly plan can be sold.
    if (PLANS[plan].recurring && !passphrase) {
      return json({ error: 'monthly billing needs PAYFAST_PASSPHRASE configured' }, 503)
    }
    const origin = typeof body.origin === 'string' ? body.origin : ''
    if (!/^https?:\/\/[^\s/]+$/.test(origin)) return json({ error: 'bad origin' }, 400)

    // Server truth for the price: the R50 friend reward applies to the
    // first yearly payment only, and only with a signed-up referral.
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    let referralDiscount = false
    if (plan === 'yearly') {
      const [{ data: membership }, { count }] = await Promise.all([
        db.from('memberships').select('user_id').eq('user_id', user.id).maybeSingle(),
        db
          .from('referrals')
          .select('referred_user_id', { count: 'exact', head: true })
          .eq('referrer_user_id', user.id),
      ])
      referralDiscount = !membership && (count ?? 0) > 0
    }
    const amountCents = expectedAmountCents(plan, referralDiscount)

    const { data: profile } = await db
      .from('profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const fields = buildCheckoutFields({
      merchantId,
      merchantKey,
      returnUrl: `${origin}/plus?paid=1`,
      cancelUrl: `${origin}/plus?cancelled=1`,
      notifyUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payfast-itn`,
      nameFirst: (profile?.display_name as string | undefined) || undefined,
      emailAddress: (profile?.email as string | undefined) || user.email || undefined,
      mPaymentId: crypto.randomUUID(),
      plan,
      amountCents,
      userId: user.id,
      referralDiscount,
    })
    if (passphrase) fields.signature = checkoutSignature(fields, passphrase, md5)

    return json({
      configured: true,
      host: payfastHost(sandbox),
      sandbox,
      amountCents,
      fields,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
