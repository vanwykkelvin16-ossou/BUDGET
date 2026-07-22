/**
 * The 45-second gate. Real (non-demo) users get 45 seconds inside the app
 * per session; without an active PennyPlay Plus year, a full-screen,
 * undismissable offer takes over until they subscribe. Members and demo
 * mode never see it.
 *
 * The gate is server-aware: before it blocks anyone it re-checks the
 * membership row in Supabase (so a plan bought on another device counts
 * immediately, and a stale local unlock doesn't), and while blocked it
 * keeps polling so a payment confirmed in another tab lifts it. The /plus
 * pricing page itself is never gated — people must be able to reach the
 * pay button.
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import {
  loadMembership,
  membershipStatus,
  PLUS_PRICE_CENTS,
  type Membership,
} from '../lib/membership'
import { plusPriceCents, rewardUnlocked } from '../lib/referral'
import { payForPlan } from '../lib/plusCheckout'
import { syncMembershipFromServer } from '../lib/plusServer'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'

const GATE_SECONDS_KEY = 'pennyplay:gate-seconds' // test override
const DEFAULT_GATE_SECONDS = 45
const BLOCKED_RECHECK_MS = 15_000

const GATE_PERKS = [
  'Fun money for today, always true to your cash',
  'Savings goals, quests, streaks & XP',
  'Smart nudges and the month tracker',
  'Every new feature for the next 12 months',
]

export function PlusGate() {
  const profile = useAppStore((s) => s.data.profile)
  const location = useLocation()
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Arm the timer: server check first, then the grace period.
  useEffect(() => {
    if (!profile || profile.isDemo) return
    if (membershipStatus(loadMembership()) === 'active') {
      // Trust but verify — a stale local unlock is cleared server-side.
      void syncMembershipFromServer()
    }
    let cancelled = false
    let timer = 0
    void (async () => {
      const server = await syncMembershipFromServer()
      if (cancelled || membershipStatus(server) === 'active') return
      let seconds = DEFAULT_GATE_SECONDS
      try {
        seconds = Number(localStorage.getItem(GATE_SECONDS_KEY) ?? DEFAULT_GATE_SECONDS)
      } catch {
        /* default stands */
      }
      timer = window.setTimeout(async () => {
        // They may have subscribed during the grace period (any device).
        const latest = await syncMembershipFromServer()
        if (!cancelled && membershipStatus(latest) !== 'active') setBlocked(true)
      }, seconds * 1000)
    })()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [profile])

  // While blocked, keep listening for the payment to land.
  useEffect(() => {
    if (!blocked) return
    const timer = window.setInterval(async () => {
      const latest = await syncMembershipFromServer()
      if (membershipStatus(latest) === 'active') setBlocked(false)
    }, BLOCKED_RECHECK_MS)
    return () => window.clearInterval(timer)
  }, [blocked])

  if (!profile) return null
  // The pricing page holds the pay button — never wall it off.
  const onPlusPage = location.pathname === '/plus'

  const reward = rewardUnlocked()
  const current: Membership | null = loadMembership()
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment: current === null,
  })

  async function subscribe() {
    if (busy) return
    setBusy(true)
    setNote(null)
    const result = await payForPlan({
      plan: 'yearly',
      priceCents,
      referralDiscount: reward && current === null,
      current,
      email: profile?.email || undefined,
      name: profile?.displayName || undefined,
    })
    if (result === 'redirected') return // browser is leaving for PayFast
    setBusy(false)
    if (typeof result === 'object' && 'error' in result) setNote(result.error)
    else setBlocked(false)
  }

  return (
    <AnimatePresence>
      {blocked && !onPlusPage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-bg overflow-y-auto"
        >
          <div className="max-w-md mx-auto px-5 py-10 flex flex-col items-center text-center min-h-full justify-center">
            <Randy mood="happy" size={88} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-4">
              PennyPlay Plus
            </p>
            <h2 className="font-display font-extrabold text-2xl mt-1">
              Your free look around is over 😄
            </h2>
            <p className="text-sm text-ink-soft font-semibold mt-2 max-w-[34ch]">
              Join Plus to keep playing — {formatZAR(priceCents, { showCents: false })} a year,
              auto-renews, cancel anytime.
            </p>

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

            {reward && current === null && (
              <p className="text-xs font-extrabold text-lime mt-4">
                🎁 Friend reward applied — R50 off your first year
              </p>
            )}

            <div className="w-full mt-5">
              <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void subscribe()}>
                {busy
                  ? 'Opening secure checkout…'
                  : `⭐ Join Plus — ${formatZAR(priceCents, { showCents: false })} / year`}
              </Button3D>
            </div>
            {note && <p className="text-xs text-coral font-bold mt-3 max-w-[38ch]">{note}</p>}

            <Link
              to="/plus"
              className="mt-4 text-xs font-extrabold text-aqua underline underline-offset-2"
            >
              See what's included →
            </Link>
            <p className="text-[10px] text-ink-faint font-bold mt-3">
              Secure checkout by PayFast · auto-renews yearly · cancel anytime · your data stays
              yours
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
