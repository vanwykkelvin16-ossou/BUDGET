/**
 * Give PennyPlay, get R50 — the referral reward for Plus.
 *
 * Every user has a share code. A friend who opens the share link carries
 * the code through sign-up (auth metadata → referrals table). Once at
 * least one friend has actually signed up, R50 comes off the referrer's
 * FIRST Plus payment (R200 → R150). Verified server-side in Supabase
 * mode; in on-device mode the screen shows the waiting state until the
 * app is connected to accounts.
 */

export const REFERRAL_DISCOUNT_CENTS = 5_000 // R50 off…
export const FIRST_YEAR_PRICE_CENTS = 15_000 // …makes the first year R150

const CODE_KEY = 'pennyplay:ref-code:v1'
const REFERRED_BY_KEY = 'pennyplay:referred-by:v1'
const SHARED_KEY = 'pennyplay:ref-shared:v1'
const ELIGIBLE_KEY = 'pennyplay:ref-eligible:v1'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

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
      localStorage.setItem(REFERRED_BY_KEY, code.toUpperCase().slice(0, 12))
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

/** Set when the server confirms ≥1 friend signed up with my code. */
export function saveRewardUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(ELIGIBLE_KEY, '1')
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
