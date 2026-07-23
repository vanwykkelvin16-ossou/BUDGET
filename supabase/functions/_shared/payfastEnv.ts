/**
 * Merchant credentials for the PayFast edge functions, resolved one way
 * everywhere so checkout, ITN verification and cancellation can never
 * disagree about which account (and host) is in play.
 *
 * Resolution order:
 *   1. Deno.env secrets (PAYFAST_MERCHANT_ID / KEY / PASSPHRASE / SANDBOX)
 *   2. public.payfast_config row (service-role only; set via SQL)
 *   3. PayFast's public sandbox merchant (unsigned sandbox checkout)
 *
 * When a configured LIVE merchant is not yet able to receive payments
 * (FICA pending), checkout falls back to the public sandbox so the app
 * keeps working; ITN accepts notifications from either merchant.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

export interface PayfastEnv {
  merchantId: string
  merchantKey: string
  /** Required for subscriptions — PayFast rejects unsigned requests. */
  passphrase: string
  /** sandbox host when true */
  sandbox: boolean
  /** False while running on the public sandbox fallback account. */
  live: boolean
}

// The shared sandbox merchant from https://developers.payfast.co.za —
// public by design, usable by anyone for integration testing.
export const SANDBOX_MERCHANT_ID = '10000100'
export const SANDBOX_MERCHANT_KEY = '46f0cd694581a'

export function sandboxMerchant(): PayfastEnv {
  return {
    merchantId: SANDBOX_MERCHANT_ID,
    merchantKey: SANDBOX_MERCHANT_KEY,
    passphrase: '',
    sandbox: true,
    live: false,
  }
}

function fromEnv(): PayfastEnv | null {
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
  const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY') ?? ''
  if (!merchantId || !merchantKey) return null
  const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
  return {
    merchantId,
    merchantKey,
    passphrase: Deno.env.get('PAYFAST_PASSPHRASE') ?? '',
    sandbox,
    live: !sandbox,
  }
}

/**
 * Resolve merchant credentials. Prefer Deno.env; fall back to the
 * service-role-only payfast_config row; finally the public sandbox.
 */
export async function payfastEnv(): Promise<PayfastEnv> {
  const env = fromEnv()
  if (env) return env

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data } = await db
      .from('payfast_config')
      .select('merchant_id, merchant_key, passphrase, sandbox')
      .eq('id', 1)
      .maybeSingle()
    if (data?.merchant_id && data?.merchant_key) {
      const sandbox = Boolean(data.sandbox)
      return {
        merchantId: data.merchant_id as string,
        merchantKey: data.merchant_key as string,
        passphrase: (data.passphrase as string) ?? '',
        sandbox,
        live: !sandbox,
      }
    }
  } catch {
    /* fall through to sandbox */
  }

  return sandboxMerchant()
}

/**
 * Probe PayFast with a throwaway payment id. Returns null when the
 * merchant can receive payments, or a short reason string when not.
 * A 302/303 to the payment page (or 200) counts as ready.
 */
export async function probeMerchantReady(
  host: string,
  fields: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await fetch(`https://${host}/eng/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      redirect: 'manual',
    })
    if (res.status === 200 || res.status === 302 || res.status === 303) return null
    const text = await res.text()
    if (/not able to receive payments/i.test(text) || /unable to receive payments/i.test(text)) {
      return 'merchant_pending_verification'
    }
    if (/signature/i.test(text) && /match|invalid|generated/i.test(text)) {
      return 'bad_signature'
    }
    if (/passphrase/i.test(text)) return 'bad_passphrase'
    return `payfast_http_${res.status}`
  } catch (err) {
    return `payfast_probe_failed:${String(err)}`
  }
}
