/**
 * PayFast protocol helpers — pure functions shared by every payment edge
 * function and unit-tested from the app's vitest suite. No Deno or browser
 * APIs are used, and md5 is injected so each runtime brings its own
 * implementation (npm:js-md5 in Deno, js-md5 in tests).
 *
 * The three signature schemes PayFast uses are all here:
 *  - checkout form signature   → fields in DOCUMENTED order + passphrase
 *  - ITN verification          → fields in RECEIVED order + passphrase
 *  - REST API signature        → params in ALPHABETICAL order + passphrase
 */

export type Md5 = (input: string) => string

/* ------------------------------------------------------------------ */
/* Plans — priced server-side; the client can never choose an amount.  */
/* ------------------------------------------------------------------ */

export interface PlanSpec {
  amountCents: number
  itemName: string
  itemDescription: string
  /** Days of access granted per successful charge. */
  daysPerPayment: number
  /** paid_until may never run further than this many days from today. */
  maxDaysAhead: number
  /** True when PayFast bills this plan automatically (subscription). */
  recurring: boolean
}

export const PLANS: Record<'monthly' | 'yearly', PlanSpec> = {
  monthly: {
    amountCents: 2_500, // R25,00
    itemName: 'PennyPlay Plus — monthly',
    itemDescription: 'Full access to PennyPlay, billed monthly. Cancel anytime.',
    daysPerPayment: 33, // a full month + a little grace for billing delays
    maxDaysAhead: 66,
    recurring: true,
  },
  yearly: {
    amountCents: 20_000, // R200,00
    itemName: 'PennyPlay Plus — 1 year',
    itemDescription: 'Full access to PennyPlay for 12 months, billed yearly.',
    daysPerPayment: 365,
    maxDaysAhead: 365,
    recurring: false,
  },
}

export type PlanId = keyof typeof PLANS

/** First yearly payment with the unlocked R50 friend reward. */
export const REFERRAL_YEARLY_CENTS = 15_000

export function isPlanId(value: unknown): value is PlanId {
  return value === 'monthly' || value === 'yearly'
}

/** The rand amount PayFast must report for a payment to count. */
export function expectedAmountCents(plan: PlanId, referralDiscount: boolean): number {
  if (plan === 'yearly' && referralDiscount) return REFERRAL_YEARLY_CENTS
  return PLANS[plan].amountCents
}

/* ------------------------------------------------------------------ */
/* Encoding + signatures                                                */
/* ------------------------------------------------------------------ */

/**
 * PHP-urlencode style encoding, which PayFast's signature examples use:
 * uppercase hex, spaces as '+', and `!'()*~` escaped (encodeURIComponent
 * leaves those bare, PHP does not).
 */
export function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/**
 * Checkout form signature: non-empty fields in the order given (which must
 * be the documented attribute order — see buildCheckoutFields), then the
 * passphrase.
 */
export function checkoutSignature(
  fields: Record<string, string>,
  passphrase: string,
  md5: Md5,
): string {
  const pairs: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || value === '') continue
    pairs.push(`${key}=${pfEncode(value.trim())}`)
  }
  let signable = pairs.join('&')
  if (passphrase) signable += `&passphrase=${pfEncode(passphrase.trim())}`
  return md5(signable)
}

/**
 * Verify an ITN: rebuild the parameter string in the exact order received
 * (minus the signature itself) and compare hashes. When a passphrase is
 * configured an unsigned notification is never acceptable.
 */
export function itnSignatureValid(
  received: Iterable<[string, string]>,
  signature: string | undefined,
  passphrase: string,
  md5: Md5,
): boolean {
  if (!signature) return !passphrase
  const pairs: string[] = []
  for (const [key, value] of received) {
    if (key === 'signature') continue
    pairs.push(`${key}=${pfEncode(value)}`)
  }
  let signable = pairs.join('&')
  if (passphrase) signable += `&passphrase=${pfEncode(passphrase.trim())}`
  return md5(signable) === signature
}

/**
 * REST API signature (subscription cancel etc.): every header/body param
 * plus the passphrase, sorted alphabetically. The `testing` query flag is
 * excluded by convention — simply never pass it in `params`.
 */
export function apiSignature(
  params: Record<string, string>,
  passphrase: string,
  md5: Md5,
): string {
  const merged: Record<string, string> = { ...params }
  if (passphrase) merged.passphrase = passphrase.trim()
  const signable = Object.keys(merged)
    .filter((key) => merged[key] !== '')
    .sort()
    .map((key) => `${key}=${pfEncode(merged[key])}`)
    .join('&')
  return md5(signable)
}

/* ------------------------------------------------------------------ */
/* Checkout form                                                        */
/* ------------------------------------------------------------------ */

export interface CheckoutParams {
  merchantId: string
  merchantKey: string
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  nameFirst?: string
  emailAddress?: string
  /** Unique id for this payment attempt on our side. */
  mPaymentId: string
  plan: PlanId
  amountCents: number
  /** Whose membership the ITN should activate (custom_str1). */
  userId: string
  /** Marks a referral-discounted first yearly payment (custom_str2). */
  referralDiscount?: boolean
}

/**
 * The checkout fields in the exact order PayFast's attribute documentation
 * lists them — the order is load-bearing because the form signature hashes
 * the pairs in this sequence.
 */
export function buildCheckoutFields(p: CheckoutParams): Record<string, string> {
  const rands = (cents: number) => (cents / 100).toFixed(2)
  const plan = PLANS[p.plan]
  const fields: Record<string, string> = {
    merchant_id: p.merchantId,
    merchant_key: p.merchantKey,
    return_url: p.returnUrl,
    cancel_url: p.cancelUrl,
    notify_url: p.notifyUrl,
  }
  if (p.nameFirst) fields.name_first = p.nameFirst
  if (p.emailAddress) fields.email_address = p.emailAddress
  fields.m_payment_id = p.mPaymentId
  fields.amount = rands(p.amountCents)
  fields.item_name = plan.itemName
  fields.item_description = plan.itemDescription
  fields.custom_str1 = p.userId
  if (p.referralDiscount) fields.custom_str2 = 'ref50'
  fields.custom_str3 = p.plan
  if (plan.recurring) {
    fields.subscription_type = '1' // subscription (not tokenization)
    fields.recurring_amount = rands(plan.amountCents)
    fields.frequency = '3' // monthly
    fields.cycles = '0' // runs until cancelled
  }
  return fields
}

export function payfastHost(sandbox: boolean): string {
  return sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za'
}

/* ------------------------------------------------------------------ */
/* Membership arithmetic                                                */
/* ------------------------------------------------------------------ */

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Where a successful payment moves paid_until: stack the plan's days on the
 * remaining time (or on today when lapsed), but never further than the
 * plan's cap from today. A monthly→yearly upgrade therefore lands on
 * today + 365 rather than stacking the leftover month on top.
 */
export function extendPaidUntil(
  existingPaidUntil: string | null,
  today: string,
  plan: PlanId,
): string {
  const spec = PLANS[plan]
  const base = existingPaidUntil && existingPaidUntil > today ? existingPaidUntil : today
  const next = addDaysISO(base, spec.daysPerPayment)
  const cap = addDaysISO(today, spec.maxDaysAhead)
  return next > cap ? cap : next
}
