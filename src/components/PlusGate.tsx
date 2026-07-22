/**
 * The 45-second gate. Real (non-demo) users get 45 seconds inside the app
 * per session; without an active PennyPlay Plus year, a full-screen,
 * undismissable offer takes over until they subscribe. Members and demo
 * mode never see it.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import {
  loadMembership,
  membershipStatus,
  PLUS_PRICE_CENTS,
  type Membership,
} from '../lib/membership'
import {
  myReferralCode,
  plusPriceCents,
  rewardUnlocked,
  shouldOfferReferralBeforePay,
} from '../lib/referral'
import { payForYear } from '../lib/plusCheckout'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'
import { ReferralOfferPopup } from './ReferralOfferPopup'

const GATE_SECONDS_KEY = 'pennyplay:gate-seconds' // test override
const DEFAULT_GATE_SECONDS = 45

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for 12 months',
]

export function PlusGate() {
  const profile = useAppStore((s) => s.data.profile)
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [offerOpen, setOfferOpen] = useState(false)

  useEffect(() => {
    if (!profile || profile.isDemo) return
    if (membershipStatus(loadMembership()) === 'active') return
    let seconds = DEFAULT_GATE_SECONDS
    try {
      seconds = Number(localStorage.getItem(GATE_SECONDS_KEY) ?? DEFAULT_GATE_SECONDS)
    } catch {
      /* default stands */
    }
    const timer = window.setTimeout(() => {
      // They may have subscribed during the grace period.
      if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
    }, seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [profile])

  if (!profile) return null

  const reward = rewardUnlocked()
  const current: Membership | null = loadMembership()
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment: current === null,
  })

  /** Tapping Unlock at the full R200 first opens the "save R50" popup. */
  function subscribe() {
    if (busy) return
    if (shouldOfferReferralBeforePay({ unlocked: reward, isFirstPayment: current === null })) {
      setOfferOpen(true)
      return
    }
    void startCheckout()
  }

  async function startCheckout() {
    if (busy) return
    setBusy(true)
    const result = await payForYear({
      priceCents,
      referralDiscount: reward && current === null,
      current,
      email: profile?.email || undefined,
      name: profile?.displayName || undefined,
    })
    setBusy(false)
    if (result !== 'redirected') setBlocked(false)
  }

  return (
    <AnimatePresence>
      {blocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[80] bg-bg overflow-y-auto"
        >
          <div className="max-w-md mx-auto px-5 py-10 flex flex-col items-center text-center min-h-full justify-center">
            <Randy mood="happy" size={96} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-4">
              PennyPlay Plus
            </p>
            <h2 className="font-display font-extrabold text-2xl mt-1">
              Your free look around is over 😄
            </h2>
            <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">
              Join Plus to keep playing — one payment, a full year of everything.
            </p>

            <p className="font-display font-extrabold leading-tight mt-5">
              <span className="text-gradient-gold animate-shimmer text-5xl">
                {formatZAR(priceCents, { showCents: false })}
              </span>
              <span className="text-base text-ink-soft"> / year</span>
            </p>
            {reward && current === null && (
              <p className="text-xs font-extrabold text-lime mt-1">
                🎁 Friend reward applied — R50 off your first year
              </p>
            )}

            <div className="w-full mt-6 rounded-[24px] border border-edge bg-card p-4 text-left">
              {GATE_PERKS.map((perk) => (
                <div key={perk} className="flex items-center gap-3 py-1.5">
                  <span
                    className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-b from-lime to-emerald
                               flex items-center justify-center text-[11px] font-extrabold text-[#1a2e05]"
                    aria-hidden
                  >
                    ✓
                  </span>
                  <p className="text-sm text-ink-soft font-semibold leading-snug">{perk}</p>
                </div>
              ))}
            </div>

            <div className="w-full mt-6">
              <Button3D full size="lg" variant="gold" disabled={busy} onClick={subscribe}>
                Unlock a year — {formatZAR(priceCents, { showCents: false })}
              </Button3D>
            </div>
            <p className="text-[10px] text-ink-faint font-bold mt-3">
              Billed yearly · no auto-renewal · your data stays yours
            </p>
          </div>

          {/* Refer-a-friend nudge before the full-price R200 checkout */}
          <ReferralOfferPopup
            open={offerOpen}
            code={myReferralCode()}
            fullPriceCents={PLUS_PRICE_CENTS}
            onClose={() => setOfferOpen(false)}
            onSkip={() => {
              setOfferOpen(false)
              void startCheckout()
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
