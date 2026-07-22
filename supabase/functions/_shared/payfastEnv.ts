/**
 * Merchant credentials for the PayFast edge functions, resolved one way
 * everywhere so checkout, ITN verification and cancellation can never
 * disagree about which account (and host) is in play:
 *
 *   PAYFAST_MERCHANT_ID + PAYFAST_MERCHANT_KEY set
 *     → that account; PAYFAST_SANDBOX=1 picks the sandbox host and
 *       PAYFAST_PASSPHRASE must match the account's salt passphrase.
 *
 *   secrets not set
 *     → PayFast's public sandbox merchant (from their developer docs),
 *       always on the sandbox host. Checkout and billing run for real
 *       against sandbox.payfast.co.za, but no actual money moves.
 *
 * Going live is therefore only:
 *   supabase secrets set PAYFAST_MERCHANT_ID=… PAYFAST_MERCHANT_KEY=… \
 *     PAYFAST_PASSPHRASE=…
 * (and no PAYFAST_SANDBOX, or PAYFAST_SANDBOX=0).
 */

export interface PayfastEnv {
  merchantId: string
  merchantKey: string
  /** Required for subscriptions — PayFast rejects unsigned requests. */
  passphrase: string
  sandbox: boolean
  /** False while running on the public sandbox fallback account. */
  live: boolean
}

// The shared sandbox merchant from https://developers.payfast.co.za —
// public by design, usable by anyone for integration testing.
const SANDBOX_MERCHANT_ID = '10000100'
const SANDBOX_MERCHANT_KEY = '46f0cd694581a'
const SANDBOX_PASSPHRASE = 'jt7NOE43FZPn'

export function payfastEnv(): PayfastEnv {
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID') ?? ''
  const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY') ?? ''
  if (merchantId && merchantKey) {
    const sandbox = Deno.env.get('PAYFAST_SANDBOX') === '1'
    return {
      merchantId,
      merchantKey,
      passphrase: Deno.env.get('PAYFAST_PASSPHRASE') ?? '',
      sandbox,
      live: !sandbox,
    }
  }
  return {
    merchantId: SANDBOX_MERCHANT_ID,
    merchantKey: SANDBOX_MERCHANT_KEY,
    passphrase: SANDBOX_PASSPHRASE,
    sandbox: true,
    live: false,
  }
}
