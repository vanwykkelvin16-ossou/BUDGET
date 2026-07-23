/**
 * payfast-checkout — builds a signed PayFast checkout for the signed-in
 * user. The price, plan details and referral discount are all decided
 * HERE, server-side, so a tampered client can never buy a year for one
 * rand: the ITN handler independently re-checks the amount against the
 * same plan table.
 *
 * PennyPlay Plus is a yearly auto-renewing PayFast subscription (R200/year).
 * A passphrase is required for LIVE subscriptions — PayFast rejects them
 * unsigned. If the configured live merchant cannot receive payments yet
 * (FICA pending), we automatically fall back to PayFast's public sandbox
 * so checkout still works, and return `livePending: true` for the UI.
 *
 * POST JSON { plan: 'yearly', origin: string }
 *   → { configured: true, host, fields, sandbox?, livePending? }
 *
 * Deploy: supabase functions deploy payfast-checkout
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'
import {
  buildCheckoutFields,
  checkoutSignature,
  expectedAmountCents,
  isPlanId,
  payfastHost,
} from '../_shared/payfast.ts'
import {
  payfastEnv,
  probeMerchantReady,
  sandboxMerchant,
} from '../_shared/payfastEnv.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const LIVE_PENDING_WARNING =
  'Your PayFast live account cannot receive payments yet (usually FICA still pending). Checkout is running in sandbox until Account → Verification Documents is approved.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
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

    let merchant = await payfastEnv()
    let livePending = false
    let warning: string | undefined

    if (merchant.live && !merchant.passphrase) {
      return json({ error: 'yearly auto-renew needs PAYFAST_PASSPHRASE configured' }, 503)
    }

    const body = await req.json()
    const plan = body.plan ?? 'yearly'
    if (!isPlanId(plan)) return json({ error: 'unknown plan' }, 400)
    const origin = typeof body.origin === 'string' ? body.origin : ''
    if (!/^https?:\/\/[^\s/]+$/.test(origin)) return json({ error: 'bad origin' }, 400)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const [{ data: membership }, { count }] = await Promise.all([
      db.from('memberships').select('user_id').eq('user_id', user.id).maybeSingle(),
      db
        .from('referrals')
        .select('referred_user_id', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id),
    ])
    const referralDiscount = !membership && (count ?? 0) > 0
    const amountCents = expectedAmountCents(plan, referralDiscount)

    const { data: profile } = await db
      .from('profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payfast-itn`
    const nameFirst = (profile?.display_name as string | undefined) || undefined
    const emailAddress = (profile?.email as string | undefined) || user.email || undefined

    function buildFields(m: typeof merchant, paymentId: string) {
      const fields = buildCheckoutFields({
        merchantId: m.merchantId,
        merchantKey: m.merchantKey,
        returnUrl: `${origin}/plus?paid=1`,
        cancelUrl: `${origin}/plus?cancelled=1`,
        notifyUrl,
        nameFirst,
        emailAddress,
        mPaymentId: paymentId,
        plan,
        amountCents,
        userId: user.id,
        referralDiscount,
      })
      if (m.passphrase) fields.signature = checkoutSignature(fields, m.passphrase, md5)
      return fields
    }

    // Live merchants that haven't finished FICA reject every checkout with
    // "not able to receive payments". Probe once with a throwaway id, then
    // fall back to the public sandbox so buyers aren't dumped on a 400 page.
    if (merchant.live) {
      const probe = buildFields(merchant, crypto.randomUUID())
      const reason = await probeMerchantReady(payfastHost(false), probe)
      if (reason === 'merchant_pending_verification') {
        merchant = sandboxMerchant()
        livePending = true
        warning = LIVE_PENDING_WARNING
      } else if (reason === 'bad_signature' || reason === 'bad_passphrase') {
        return json(
          {
            error:
              'PayFast rejected the live payment signature — check that PAYFAST_PASSPHRASE matches Settings → Security Passphrase exactly.',
          },
          503,
        )
      } else if (reason) {
        // Unknown reject — still try sandbox so the product keeps working.
        merchant = sandboxMerchant()
        livePending = true
        warning = `${LIVE_PENDING_WARNING} (probe: ${reason})`
      }
    }

    const fields = buildFields(merchant, crypto.randomUUID())

    return json({
      configured: true,
      host: payfastHost(merchant.sandbox),
      sandbox: merchant.sandbox,
      livePending,
      warning,
      amountCents,
      fields,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
