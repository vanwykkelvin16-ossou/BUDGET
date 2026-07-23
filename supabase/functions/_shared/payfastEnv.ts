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
 * Going live is therefore either:
 *   supabase secrets set PAYFAST_MERCHANT_ID=… PAYFAST_MERCHANT_KEY=… \
 *     PAYFAST_PASSPHRASE=…
 * or a single row in payfast_config (sandbox=false).
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
const SANDBOX_MERCHANT_ID = '10000100'
const SANDBOX_MERCHANT_KEY = '46f0cd694581a'

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

function sandboxFallback(): PayfastEnv {
  return {
    merchantId: SANDBOX_MERCHANT_ID,
    merchantKey: SANDBOX_MERCHANT_KEY,
    passphrase: '',
    sandbox: true,
    live: false,
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

  return sandboxFallback()
}
