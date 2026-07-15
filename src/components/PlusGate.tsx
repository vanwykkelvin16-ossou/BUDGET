/**
 * Session premium gate.
 *
 * - Demo users: soft overlay after ~90s — Unlock or Keep exploring.
 * - Real non-members: hard undismissable overlay after 45s.
 * - Active Plus members: never shown.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import {
  loadMembership,
  membershipStatus,
  PLUS_PRICE_CENTS,
  type Membership,
} from '../lib/membership'
import { plusPriceCents, rewardUnlocked } from '../lib/referral'
import { payForYear } from '../lib/plusCheckout'
import {
  PLUS_HEADLINE,
  PLUS_PRICE_BLURB,
  PLUS_REFERRAL_BLURB,
  PLUS_VALUE_LINE,
} from '../lib/plusOffer'
import { gateModeFor, gateSecondsFor } from '../lib/plusGate'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for 12 months',
]

export function PlusGate() {
  const profile = useAppStore((s) => s.data.profile)
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const membershipActive = membershipStatus(loadMembership()) === 'active'
  const mode = gateModeFor(profile, membershipActive)

  useEffect(() => {
    if (mode === 'skip') {
      setBlocked(false)
      return
    }
    const seconds = gateSecondsFor(mode)
    const timer = window.setTimeout(() => {
      if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
    }, seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [mode, profile?.id])

  if (!profile || mode === 'skip') return null

  const reward = rewardUnlocked()
  const current: Membership | null = loadMembership()
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment: current === null,
  })
  const soft = mode === 'soft'

  async function subscribe() {
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

  function unlock() {
    setBlocked(false)
    navigate('/plus')
  }

  function keepExploring() {
    setBlocked(false)
  }

  return (
    <AnimatePresence>
      {blocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-bg overflow-y-auto"
        >
          <div className="max-w-md mx-auto px-5 py-10 flex flex-col items-center text-center min-h-full justify-center">
            <Randy mood="happy" size={96} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-4">
              PennyPlay Plus
            </p>
            <h2 className="font-display font-extrabold text-2xl mt-1">{PLUS_HEADLINE}</h2>
            <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">
              {PLUS_PRICE_BLURB}
            </p>
            <p className="text-sm text-ink-soft font-semibold mt-1.5 max-w-[34ch]">
              {PLUS_REFERRAL_BLURB}
            </p>
            <p className="text-xs text-ink-faint font-semibold italic mt-3 max-w-[36ch] leading-snug">
              {PLUS_VALUE_LINE}
            </p>

            <p className="font-display font-extrabold leading-tight mt-5">
              <span className="text-gradient-gold animate-shimmer text-5xl">
                {formatZAR(priceCents, { showCents: false })}
              </span>
              <span className="text-base text-ink-soft"> / year</span>
            </p>
            {reward && current === null && (
              <p className="text-xs font-extrabold text-lime mt-1">
                Friend reward applied — R50 off your first year
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

            <div className="w-full mt-6 flex flex-col gap-3">
              {soft ? (
                <>
                  <Button3D full size="lg" variant="gold" onClick={unlock}>
                    Unlock the full experience
                  </Button3D>
                  <Button3D full variant="ghost" onClick={keepExploring}>
                    Keep exploring
                  </Button3D>
                </>
              ) : (
                <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void subscribe()}>
                  Unlock a year — {formatZAR(priceCents, { showCents: false })}
                </Button3D>
              )}
            </div>
            <p className="text-[10px] text-ink-faint font-bold mt-3">
              Billed yearly · no auto-renewal · your data stays yours
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
