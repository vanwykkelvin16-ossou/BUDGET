/**
 * Give PennyPlay, get R50 — the referral reward for Plus.
 *
 * Every user has a share code. A friend who opens the share link (or enters
 * the code on the Plus page) is credited against that code. Once a referral
 * is on record for either side of the deal, R50 comes off the FIRST Plus
 * payment (R200 → R150). Verified server-side in Supabase mode.
 */

import { getSupabaseClient } from './supabaseClient'

export const REFERRAL_DISCOUNT_CENTS = 5_000 // R50 off…
export const FIRST_YEAR_PRICE_CENTS = 15_000 // …makes the first year R150

const CODE_KEY = 'pennyplay:ref-code:v1'
const REFERRED_BY_KEY = 'pennyplay:referred-by:v1'
const SHARED_KEY = 'pennyplay:ref-shared:v1'
const ELIGIBLE_KEY = 'pennyplay:ref-eligible:v1'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

/** My share code — generated once per device, replaced by the server code
 *  when signed in (so links keep working across devices). */
export function myReferralCode(): string {
  try {
    const existing = localStorage.getItem(CODE_KEY)
    if (existing) return existing
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
    localStorage.setItem(CODE_KEY, code)
    return code
  } catch {
    return 'PENNY1'
  }
}

export function adoptServerReferralCode(code: string): void {
  try {
    if (code) localStorage.setItem(CODE_KEY, code)
  } catch {
    /* ignore */
  }
}

/** Call at boot: if the app was opened from a share link, remember whose. */
export function captureIncomingRef(search: string = window.location.search): void {
  try {
    const code = new URLSearchParams(search).get('ref')
    if (code && !localStorage.getItem(REFERRED_BY_KEY)) {
      localStorage.setItem(REFERRED_BY_KEY, normalizeReferralCode(code))
    }
  } catch {
    /* ignore */
  }
}

export function referredBy(): string | null {
  try {
    return localStorage.getItem(REFERRED_BY_KEY)
  } catch {
    return null
  }
}

export function markShared(): void {
  try {
    localStorage.setItem(SHARED_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

export function hasShared(): boolean {
  try {
    return localStorage.getItem(SHARED_KEY) !== null
  } catch {
    return false
  }
}

/** Set when a referral discount is confirmed (friend signed up, or code applied). */
export function saveRewardUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(ELIGIBLE_KEY, '1')
    else localStorage.removeItem(ELIGIBLE_KEY)
  } catch {
    /* ignore */
  }
}

export function rewardUnlocked(): boolean {
  try {
    return localStorage.getItem(ELIGIBLE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Is the R50 unlocked *right now*? Checks the local flag first, then asks
 * the server whether a friend has signed up with my code (and remembers a
 * yes). The popup polls this while the user waits for their friend.
 */
export async function refreshRewardUnlocked(): Promise<boolean> {
  if (rewardUnlocked()) return true
  const supabase = getSupabaseClient()
  if (!supabase) return false
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return false
    const { count } = await supabase
      .from('referrals')
      .select('referred_user_id', { count: 'exact', head: true })
      .eq('referrer_user_id', auth.user.id)
    const unlocked = (count ?? 0) > 0
    if (unlocked) saveRewardUnlocked(true)
    return unlocked
  } catch {
    return false
  }
}

/**
 * Should the "refer a friend, get R50 off" popup interrupt checkout?
 * Only when the user is about to pay the FULL R200 on their FIRST
 * payment — i.e. the R50 is still on the table. Never for renewals
 * (the discount is first-payment-only) and never once it's unlocked.
 */
export function shouldOfferReferralBeforePay(params: {
  unlocked: boolean
  isFirstPayment: boolean
}): boolean {
  return params.isFirstPayment && !params.unlocked
}

/** First payment with an unlocked reward → R150; everything else → R200. */
export function plusPriceCents(params: {
  fullPriceCents: number
  unlocked: boolean
  isFirstPayment: boolean
}): number {
  return params.unlocked && params.isFirstPayment
    ? params.fullPriceCents - REFERRAL_DISCOUNT_CENTS
    : params.fullPriceCents
}

export function shareLink(code: string, origin: string = window.location.origin): string {
  return `${origin}/?ref=${code}`
}

export function shareMessage(code: string, origin?: string): string {
  return (
    `Join me on PennyPlay 🪙 — budgeting that feels like a game. ` +
    `Know your fun money for today, every day. ${shareLink(code, origin)}`
  )
}

/** Share via the system sheet, falling back to the clipboard. True when copied. */
export async function shareApp(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const text = shareMessage(code)
  try {
    if (navigator.share) {
      await navigator.share({ title: 'PennyPlay', text, url: shareLink(code) })
      markShared()
      return 'shared'
    }
  } catch {
    /* user closed the sheet — fall through to clipboard */
  }
  try {
    await navigator.clipboard.writeText(text)
    markShared()
    return 'copied'
  } catch {
    return 'failed'
  }
}

export type ApplyCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: string }

/**
 * Apply a friend's referral code for R50 off the first Plus year.
 * With Supabase connected, credits the referrer and unlocks the discount
 * server-side. On-device / test mode accepts any valid foreign code locally.
 */
export async function applyReferralDiscountCode(raw: string): Promise<ApplyCodeResult> {
  const code = normalizeReferralCode(raw)
  if (code.length < 4) {
    return { ok: false, error: 'Enter a valid referral code (at least 4 characters).' }
  }
  if (code === myReferralCode()) {
    return { ok: false, error: "That's your own code — share it with a friend instead." }
  }

  const supabase = getSupabaseClient()
  if (supabase) {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      // Remember for after sign-up; discount unlocks once apply RPC runs post-auth.
      try {
        localStorage.setItem(REFERRED_BY_KEY, code)
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error: 'Sign in first, then apply the code to unlock R50 off.',
      }
    }
    const { data, error } = await supabase.rpc('apply_referral_code', { p_code: code })
    if (error) {
      return { ok: false, error: error.message || 'Could not apply that code.' }
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (!payload?.ok) {
      return { ok: false, error: payload?.error || 'That referral code is not valid.' }
    }
    try {
      localStorage.setItem(REFERRED_BY_KEY, code)
    } catch {
      /* ignore */
    }
    saveRewardUnlocked(true)
    return { ok: true, code }
  }

  // On-device / no backend: accept the code locally so the pay flow can show R150.
  try {
    localStorage.setItem(REFERRED_BY_KEY, code)
  } catch {
    /* ignore */
  }
  saveRewardUnlocked(true)
  return { ok: true, code }
}

/**
 * After sign-in: if a share link left a referred_by code, credit it now.
 * Also refreshes unlock when we're the referrer with ≥1 signup.
 */
export async function syncReferralRewards(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  const pending = referredBy()
  if (pending) {
    await applyReferralDiscountCode(pending)
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('referral_code, referred_by')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (me?.referral_code) adoptServerReferralCode(me.referral_code as string)
  if (me?.referred_by) {
    try {
      localStorage.setItem(REFERRED_BY_KEY, normalizeReferralCode(me.referred_by as string))
    } catch {
      /* ignore */
    }
  }

  // Unlock when a friend signed up with our code OR we were referred.
  const { count: asReferrer } = await supabase
    .from('referrals')
    .select('referred_user_id', { count: 'exact', head: true })
    .eq('referrer_user_id', auth.user.id)
  const { count: asReferred } = await supabase
    .from('referrals')
    .select('referred_user_id', { count: 'exact', head: true })
    .eq('referred_user_id', auth.user.id)
  if ((asReferrer ?? 0) > 0 || (asReferred ?? 0) > 0 || Boolean(me?.referred_by)) {
    saveRewardUnlocked(true)
  }
}
