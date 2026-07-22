/**
 * The Plus pricing catalog — everything the pricing table shows about the
 * free preview and the two paid plans (features, honest pros AND cons,
 * prices, CTA copy). Amounts here are display data; the amounts that
 * actually get charged and verified live server-side in the
 * payfast-checkout / payfast-itn edge functions and must match.
 */

import { MONTHLY_PRICE_CENTS, PLUS_PRICE_CENTS, type PlanId } from './membership'

export type TierId = 'free' | PlanId

export interface PlanTier {
  id: TierId
  name: string
  emoji: string
  tagline: string
  priceCents: number
  /** '/ month', '/ year' — empty for free. */
  per: string
  /** What the yearly plan works out to monthly, etc. */
  priceNote: string
  /** Ribbon like 'Best value'. */
  badge?: string
  /** Included features, shown as ✓ list. */
  includes: string[]
  pros: string[]
  cons: string[]
  cta?: string
  /** Button variant for the UI kit. */
  ctaVariant?: 'gold' | 'aqua' | 'ghost'
}

/** Yearly saves this much versus 12 months of monthly. */
export const YEARLY_SAVING_CENTS = MONTHLY_PRICE_CENTS * 12 - PLUS_PRICE_CENTS

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
    id: 'monthly',
    name: 'Plus Monthly',
    emoji: '🌙',
    tagline: 'Full access, small monthly tap',
    priceCents: MONTHLY_PRICE_CENTS,
    per: '/ month',
    priceNote: 'R300 over a year',
    includes: [
      'Everything in PennyPlay, unlocked',
      'Auto-renews monthly via PayFast',
      'Cancel anytime — keep access to the end of your month',
      'Upgrade to Yearly whenever you like',
    ],
    pros: ['Lowest upfront cost', 'Cancel anytime in one tap', 'Spread the cost'],
    cons: [`R${YEARLY_SAVING_CENTS / 100} a year more than Yearly`, 'Auto-billed each month'],
    cta: 'Go monthly — R25',
    ctaVariant: 'aqua',
  },
  {
    id: 'yearly',
    name: 'Plus Yearly',
    emoji: '⭐',
    tagline: 'One payment, a whole year',
    priceCents: PLUS_PRICE_CENTS,
    per: '/ year',
    priceNote: '≈ R17 a month',
    badge: 'Best value',
    includes: [
      'Everything in PennyPlay, unlocked',
      `Save R${YEARLY_SAVING_CENTS / 100} vs paying monthly`,
      'One payment — no auto-debits, ever',
      'R50 off your first year with a friend referral',
    ],
    pros: ['Cheapest overall (33% off)', 'No recurring debit orders', 'Friend reward eligible'],
    cons: ['Pay the year upfront', 'Renews by choice when the year ends'],
    cta: 'Get the year — R200',
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
  monthly: boolean | string
  yearly: boolean | string
}

export const FEATURE_MATRIX: FeatureRow[] = [
  { label: 'Safe-to-spend & fun money', free: '45 s', monthly: true, yearly: true },
  { label: 'Savings goals, milestones & auto-save', free: false, monthly: true, yearly: true },
  { label: 'Quests, streaks, XP & rank themes', free: false, monthly: true, yearly: true },
  { label: 'Smart nudges: pay day, overspend, streaks', free: false, monthly: true, yearly: true },
  { label: 'Month tracker, year view & net worth', free: false, monthly: true, yearly: true },
  { label: 'Every new feature while active', free: false, monthly: true, yearly: true },
  { label: 'Auto-renews', free: '—', monthly: 'Monthly', yearly: 'Never' },
  { label: 'Cancel anytime', free: '—', monthly: true, yearly: 'Nothing to cancel' },
  { label: 'Friend referral: R50 off first year', free: false, monthly: false, yearly: true },
]
