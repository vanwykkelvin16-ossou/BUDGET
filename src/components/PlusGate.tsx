/**
 * Session premium gate.
 *
 * - Demo users: soft overlay after ~90s — Unlock or Keep exploring.
 * - Real non-members: hard undismissable overlay after 45s (persisted so
 *   refresh cannot restart the free look).
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
import { hasActiveMembership } from '../lib/membershipSync'
import { plusPriceCents, rewardUnlocked, syncReferralRewards } from '../lib/referral'
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
import { ReferralCodeInput } from './ReferralCodeInput'

const EXPLORE_STARTED_KEY = 'pennyplay:explore-started:v1'

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for 12 months',
]

function readExploreStarted(): number | null {
  try {
    const raw = localStorage.getItem(EXPLORE_STARTED_KEY)
    if (!raw) return null
    const n = Date.parse(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function markExploreStarted(at: number = Date.now()): void {
  try {
    if (!localStorage.getItem(EXPLORE_STARTED_KEY)) {
      localStorage.setItem(EXPLORE_STARTED_KEY, new Date(at).toISOString())
    }
  } catch {
    /* ignore */
  }
}

export function PlusGate() {
  const profile = useAppStore((s) => s.data.profile)
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [reward, setReward] = useState(rewardUnlocked)
  const [tick, setTick] = useState(0)
  const membershipActive = membershipStatus(loadMembership()) === 'active'
  const mode = gateModeFor(profile, membershipActive)

  useEffect(() => {
    if (mode === 'skip') {
      setBlocked(false)
      setSecondsLeft(null)
      return
    }

    if (mode === 'soft') {
      const seconds = gateSecondsFor('soft')
      const timer = window.setTimeout(() => {
        if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
      }, seconds * 1000)
      return () => window.clearTimeout(timer)
    }

    // Hard gate: persisted explore window for real users.
    let cancelled = false
    let interval: number | undefined
    let timeout: number | undefined

    void (async () => {
      await syncReferralRewards()
      if (cancelled) return
      setReward(rewardUnlocked())

      if (await hasActiveMembership()) {
        if (!cancelled) {
          setBlocked(false)
          setSecondsLeft(null)
        }
        return
      }
      if (cancelled) return

      const total = gateSecondsFor('hard')
      const now = Date.now()
      let started = readExploreStarted()
      if (started == null) {
        markExploreStarted(now)
        started = now
      }
      const elapsed = Math.max(0, (now - started) / 1000)
      const remaining = Math.max(0, total - elapsed)

      if (remaining <= 0) {
        if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
        setSecondsLeft(0)
        return
      }

      setSecondsLeft(Math.ceil(remaining))
      interval = window.setInterval(() => {
        const left = Math.max(0, total - (Date.now() - (readExploreStarted() ?? now)) / 1000)
        setSecondsLeft(Math.ceil(left))
        if (left <= 0) {
          if (interval) window.clearInterval(interval)
          if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
        }
      }, 250)

      timeout = window.setTimeout(() => {
        if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
        setSecondsLeft(0)
      }, remaining * 1000)
    })()

    return () => {
      cancelled = true
      if (interval) window.clearInterval(interval)
      if (timeout) window.clearTimeout(timeout)
    }
  }, [mode, profile?.id])

  if (!profile || mode === 'skip') return null

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
    if (result !== 'redirected') {
      setBlocked(false)
      setSecondsLeft(null)
      setTick((n) => n + 1)
    }
  }

  function unlock() {
    setBlocked(false)
    navigate('/plus')
  }

  function keepExploring() {
    setBlocked(false)
  }

  return (
    <>
      {mode === 'hard' && (
        <AnimatePresence>
          {secondsLeft != null && secondsLeft > 0 && !blocked && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed top-[max(env(safe-area-inset-top),12px)] inset-x-0 z-[70] flex justify-center pointer-events-none"
            >
              <div
                className="px-3 py-1.5 rounded-full bg-card/95 border border-edge backdrop-blur
                           text-[11px] font-extrabold text-ink-soft shadow-lg"
              >
                Free explore · {secondsLeft}s
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {blocked && (
          <motion.div
            key={tick}
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
              <h2 className="font-display font-extrabold text-2xl mt-1">
                {soft ? PLUS_HEADLINE : 'Your free look around is over'}
              </h2>
              <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">
                {soft
                  ? PLUS_PRICE_BLURB
                  : 'Unlock the full app — billed yearly, and the amount auto-renews each year.'}
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

              {!soft && (
                <div className="w-full mt-5 rounded-[24px] border border-edge bg-card p-4 text-left">
                  <ReferralCodeInput
                    disabled={busy || (reward && current === null)}
                    onApplied={() => setReward(true)}
                  />
                </div>
              )}

              <div className="w-full mt-4 rounded-[24px] border border-edge bg-card p-4 text-left">
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
                    Subscribe — {formatZAR(priceCents, { showCents: false })}/year
                  </Button3D>
                )}
              </div>
              <p className="text-[10px] text-ink-faint font-bold mt-3 pb-8">
                {soft
                  ? 'Billed yearly · cancel anytime · your data stays yours'
                  : 'Yearly subscription · auto-renews · cancel anytime in PayFast'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
