/**
 * The Plus pricing catalog — everything the pricing table shows about the
 * free preview and the yearly auto-renew plan (features, honest pros AND
 * cons, prices, CTA copy). Amounts here are display data; the amounts that
 * actually get charged and verified live server-side in the
 * payfast-checkout / payfast-itn edge functions and must match.
 */

import { PLUS_PRICE_CENTS, type PlanId } from './membership'

export type TierId = 'free' | PlanId

export interface PlanTier {
  id: TierId
  name: string
  emoji: string
  tagline: string
  priceCents: number
  /** '/ year' — empty for free. */
  per: string
  /** Extra price context under the big number. */
  priceNote: string
  /** Ribbon like 'Auto-renews'. */
  badge?: string
  /** Included features, shown as ✓ list. */
  includes: string[]
  pros: string[]
  cons: string[]
  cta?: string
  /** Button variant for the UI kit. */
  ctaVariant?: 'gold' | 'aqua' | 'ghost'
}

export const TIERS: PlanTier[] = [
  {
    id: 'free',
    name: 'Free look',
    emoji: '👀',
    tagline: 'Kick the tyres, no card needed',
    priceCents: 0,
    per: '',
    priceNote: 'R0 — forever',
    includes: [
      '45 seconds of the full app per visit',
      'Unlimited demo mode with sample data',
      'See every screen before you pay',
    ],
    pros: ['Costs nothing', 'No account or card required'],
    cons: ['Locks after 45 seconds', 'Progress paused until you join'],
  },
  {
    id: 'yearly',
    name: 'PennyPlay Plus',
    emoji: '⭐',
    tagline: 'Full access, renews every year',
    priceCents: PLUS_PRICE_CENTS,
    per: '/ year',
    priceNote: '≈ R17 a month · cancel anytime',
    badge: 'Auto-renews yearly',
    includes: [
      'Everything in PennyPlay, unlocked',
      'Auto-renews each year via PayFast',
      'Cancel anytime — keep access to the end of your year',
      'R50 off your first year with a friend referral',
    ],
    pros: [
      'One simple price for the whole year',
      'Never get locked out mid-year — renewals happen for you',
      'Cancel in one tap whenever you like',
      'Friend reward eligible on the first year',
    ],
    cons: ['Pay the year upfront', 'Auto-billed once a year until you cancel'],
    cta: 'Join Plus — R200 / year',
    ctaVariant: 'gold',
  },
]

export function tier(id: TierId): PlanTier {
  return TIERS.find((t) => t.id === id)!
}

/** Rows of the feature comparison matrix: what each tier gets. */
export interface FeatureRow {
  label: string
  free: boolean | string
  yearly: boolean | string
}

export const FEATURE_MATRIX: FeatureRow[] = [
  { label: 'Safe-to-spend & fun money', free: '45 s', yearly: true },
  { label: 'Savings goals, milestones & auto-save', free: false, yearly: true },
  { label: 'Quests, streaks, XP & rank themes', free: false, yearly: true },
  { label: 'Smart nudges: pay day, overspend, streaks', free: false, yearly: true },
  { label: 'Month tracker, year view & net worth', free: false, yearly: true },
  { label: 'Every new feature while active', free: false, yearly: true },
  { label: 'Auto-renews yearly via PayFast', free: '—', yearly: true },
  { label: 'Cancel anytime', free: '—', yearly: true },
  { label: 'Friend referral: R50 off first year', free: false, yearly: true },
]
