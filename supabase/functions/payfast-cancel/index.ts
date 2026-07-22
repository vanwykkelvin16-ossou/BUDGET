/**
 * payfast-cancel — the signed-in user cancels their yearly Plus
 * auto-renew subscription. We tell PayFast to stop billing
 * (subscriptions API) and mark the membership cancelled; access continues
 * until paid_until, which is never clawed back.
 *
 * POST (no body) with the user's JWT.
 *   → { cancelled: true, paidUntil }
 *
 * Deploy: supabase functions deploy payfast-cancel
 * Env:    PAYFAST_MERCHANT_ID, PAYFAST_PASSPHRASE, PAYFAST_SANDBOX=1 while testing
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { md5 } from 'npm:js-md5@0.8.3'
import { apiSignature } from '../_shared/payfast.ts'

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

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: membership } = await db
      .from('memberships')
      .select('paid_until, plan, status, payfast_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) return json({ error: 'no membership' }, 404)
    if (membership.status === 'cancelled') {
      return json({ cancelled: true, paidUntil: membership.paid_until })
    }

    // Stop the yearly auto-renew at PayFast. Without a token on record
    // (e.g. a membership from before tokens were stored, or test mode) we
    // still mark it cancelled locally so billing-state and app-state can't
    // disagree after the user asked to stop.
    if (membership.payfast_token) {
      const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
      const passphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
      if (!merchantId || !passphrase) return json({ error: 'merchant env missing' }, 503)
      const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
      const timestamp = new Date().toISOString().slice(0, 19)
      const headers = { 'merchant-id': merchantId, version: 'v1', timestamp }
      const signature = apiSignature(headers, passphrase, md5)
      const res = await fetch(
        `https://api.payfast.co.za/subscriptions/${encodeURIComponent(
          membership.payfast_token,
        )}/cancel${sandbox ? '?testing=true' : ''}`,
        { method: 'PUT', headers: { ...headers, signature } },
      )
      // 404 means PayFast no longer knows the subscription (already
      // cancelled there) — treat as done rather than stranding the user.
      if (!res.ok && res.status !== 404) {
        return json({ error: `payfast cancel failed (${res.status})` }, 502)
      }
    }

    const { error } = await db
      .from('memberships')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
    if (error) return json({ error: 'store failed' }, 500)

    return json({ cancelled: true, paidUntil: membership.paid_until })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
