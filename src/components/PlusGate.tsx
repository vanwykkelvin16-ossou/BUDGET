/**
 * The subscription gate — the heart of the Plus payment workflow.
 *
 * Everyone without an active membership gets 30 seconds to scroll around
 * (demo explorers and freshly activated accounts alike), then the
 * subscription paywall appears. It cannot be dismissed: the year must be
 * paid — referral code welcome — before the app opens up. The explore
 * window is persisted, so a refresh cannot restart the free look.
 *
 * Signed-out demo users are routed through account creation first, because
 * a real PayFast subscription must belong to an account. After a PayFast
 * redirect returns (?paid=1) the gate polls the server until the ITN
 * confirms the payment instead of blocking the payer.
 */

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { useJuiceStore } from '../state/juiceStore'
import {
  loadMembership,
  membershipStatus,
  PLUS_PRICE_CENTS,
  type Membership,
} from '../lib/membership'
import { hasActiveMembership, hydrateMembershipFromServer } from '../lib/membershipSync'
import { plusPriceCents, rewardUnlocked, syncReferralRewards } from '../lib/referral'
import { clearPaymentPending, payForYear, paymentPending } from '../lib/plusCheckout'
import { clearLocalDemo } from '../lib/data/demoLocal'
import { getSupabaseClient } from '../lib/supabaseClient'
import { PLUS_HEADLINE, PLUS_REFERRAL_BLURB, PLUS_VALUE_LINE } from '../lib/plusOffer'
import {
  gateModeFor,
  gateSecondsFor,
  markExploreStarted,
  readExploreStarted,
  remainingExploreSeconds,
} from '../lib/plusGate'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'
import { ReferralCodeInput } from './ReferralCodeInput'

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for 12 months',
]

/** How long we poll for the ITN after a PayFast return before blocking. */
const CONFIRM_POLL_MS = 2_500
const CONFIRM_POLL_TRIES = 48 // ≈ 2 minutes

export function PlusGate() {
  const profile = useAppStore((s) => s.data.profile)
  const location = useLocation()
  const [membershipActive, setMembershipActive] = useState(
    () => membershipStatus(loadMembership()) === 'active',
  )
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reward, setReward] = useState(rewardUnlocked)
  const [signedOut, setSignedOut] = useState(false)

  const mode = gateModeFor(profile, membershipActive)
  const isDemo = mode === 'demo'

  useEffect(() => {
    if (mode === 'skip') {
      setBlocked(false)
      setSecondsLeft(null)
      return
    }

    let cancelled = false
    let interval: number | undefined
    let timeout: number | undefined

    const query = new URLSearchParams(location.search)
    if (query.get('cancelled') === '1') clearPaymentPending()
    const awaitingItn = query.get('paid') === '1' || paymentPending()

    async function block(): Promise<void> {
      // Never block a payer whose PayFast return is still being confirmed
      // by the ITN — poll the server first.
      if (awaitingItn) {
        setConfirming(true)
        for (let i = 0; i < CONFIRM_POLL_TRIES && !cancelled; i++) {
          const m = await hydrateMembershipFromServer()
          if (membershipStatus(m) === 'active') {
            if (!cancelled) {
              clearPaymentPending()
              setConfirming(false)
              setMembershipActive(true)
            }
            return
          }
          await new Promise((r) => window.setTimeout(r, CONFIRM_POLL_MS))
        }
        if (cancelled) return
        setConfirming(false)
      }
      if (membershipStatus(loadMembership()) !== 'active') setBlocked(true)
      setSecondsLeft(0)
    }

    void (async () => {
      await syncReferralRewards()
      if (cancelled) return
      setReward(rewardUnlocked())

      const supabase = getSupabaseClient()
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (!cancelled) setSignedOut(!data.session)
      }
      if (cancelled) return

      if (await hasActiveMembership()) {
        if (!cancelled) {
          setMembershipActive(true)
          setBlocked(false)
          setSecondsLeft(null)
        }
        return
      }
      if (cancelled) return

      const total = gateSecondsFor()
      const now = Date.now()
      let started = readExploreStarted(mode)
      if (started == null) {
        markExploreStarted(mode, now)
        started = now
      }
      const remaining = remainingExploreSeconds(total, started, now)

      if (remaining <= 0) {
        await block()
        return
      }

      setSecondsLeft(Math.ceil(remaining))
      interval = window.setInterval(() => {
        const left = remainingExploreSeconds(total, readExploreStarted(mode) ?? now, Date.now())
        setSecondsLeft(Math.ceil(left))
        if (left <= 0 && interval) window.clearInterval(interval)
      }, 250)

      timeout = window.setTimeout(() => {
        void block()
      }, remaining * 1000)
    })()

    return () => {
      cancelled = true
      if (interval) window.clearInterval(interval)
      if (timeout) window.clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile?.id, location.search])

  if (!profile || mode === 'skip') return null

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
    if (result === 'redirected') return // browser is leaving for PayFast
    if (result === 'needs-account') {
      // A subscription lives on an account — take the demo explorer
      // through sign-up; their referral code and share link survive in
      // localStorage and apply right after.
      await clearLocalDemo()
      await useAppStore.getState().reload()
      return
    }
    setBusy(false)
    setBlocked(false)
    setSecondsLeft(null)
    setMembershipActive(true)
    useJuiceStore.getState().push({ kind: 'confetti' }, { kind: 'coins' })
  }

  const needsAccountFirst = isDemo && signedOut
  const headline = isDemo ? PLUS_HEADLINE : 'Your free look around is over'
  const blurb = isDemo
    ? 'You’ve seen PennyPlay in action. Subscribe to make it yours — billed yearly, and it auto-renews each year.'
    : 'Unlock the full app — billed yearly, and the amount auto-renews each year.'

  return (
    <>
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
              {isDemo ? 'Demo explore' : 'Free explore'} · {secondsLeft}s
            </div>
          </motion.div>
        )}
        {confirming && !blocked && (
          <motion.div
            key="confirming"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed top-[max(env(safe-area-inset-top),12px)] inset-x-0 z-[70] flex justify-center pointer-events-none"
          >
            <div
              className="px-3 py-1.5 rounded-full bg-card/95 border border-edge backdrop-blur
                         text-[11px] font-extrabold text-aqua shadow-lg"
            >
              Confirming your payment…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <h2 className="font-display font-extrabold text-2xl mt-1">{headline}</h2>
              <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">{blurb}</p>
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

              <div className="w-full mt-6 flex flex-col gap-3">
                <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void subscribe()}>
                  {needsAccountFirst
                    ? `Create account & subscribe — ${formatZAR(priceCents, { showCents: false })}/year`
                    : `Subscribe — ${formatZAR(priceCents, { showCents: false })}/year`}
                </Button3D>
              </div>
              <p className="text-[10px] text-ink-faint font-bold mt-3 pb-8">
                {needsAccountFirst
                  ? 'Your subscription lives on your account · yearly · auto-renews · cancel anytime in PayFast'
                  : 'Yearly subscription · auto-renews · cancel anytime in PayFast'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
