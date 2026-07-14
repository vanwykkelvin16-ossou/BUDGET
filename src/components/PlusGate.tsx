/**
 * Post-signup explore gate. Real (non-demo) users get 35 seconds inside the
 * app after their profile is ready; without an active PennyPlay Plus year, a
 * full-screen, undismissable offer takes over until they pay once for the
 * year. Members and demo mode never see it. Explore start is persisted so a
 * refresh cannot restart the free look.
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
import { hasActiveMembership } from '../lib/membershipSync'
import { plusPriceCents, rewardUnlocked, syncReferralRewards } from '../lib/referral'
import { payForYear } from '../lib/plusCheckout'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'
import { ReferralCodeInput } from './ReferralCodeInput'

const GATE_SECONDS_KEY = 'pennyplay:gate-seconds' // test override
const EXPLORE_STARTED_KEY = 'pennyplay:explore-started:v1'
const DEFAULT_GATE_SECONDS = 35

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for 12 months',
]

function gateSeconds(): number {
  try {
    const raw = localStorage.getItem(GATE_SECONDS_KEY)
    if (raw != null && raw !== '') {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) return n
    }
  } catch {
    /* default stands */
  }
  return DEFAULT_GATE_SECONDS
}

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
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [reward, setReward] = useState(rewardUnlocked)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!profile || profile.isDemo) return
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

      const total = gateSeconds()
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
  }, [profile])

  if (!profile || profile.isDemo) return null

  const current: Membership | null = loadMembership()
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment: current === null,
  })

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

  return (
    <>
      {/* Explore countdown chip — only while the free look is still running. */}
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

      <AnimatePresence>
        {blocked && (
          <motion.div
            key={tick}
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
                Your free look around is over
              </h2>
              <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">
                One payment unlocks the full app for a year — billed yearly, no auto-renewal.
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

              <div className="w-full mt-5 rounded-[24px] border border-edge bg-card p-4 text-left">
                <ReferralCodeInput
                  disabled={busy || (reward && current === null)}
                  onApplied={() => setReward(true)}
                />
              </div>

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

              <div className="w-full mt-6">
                <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void subscribe()}>
                  Unlock a year — {formatZAR(priceCents, { showCents: false })}
                </Button3D>
              </div>
              <p className="text-[10px] text-ink-faint font-bold mt-3 pb-8">
                One-time payment · covers 12 months · renew only when you choose
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
