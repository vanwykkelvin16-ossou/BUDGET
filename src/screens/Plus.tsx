/**
 * PennyPlay Plus — R200 for a full year, billed yearly. One screen: what
 * you get, what it costs, current status, and the pay button. Real
 * checkout via PayFast when merchant keys are configured; otherwise a
 * clearly-labelled test mode so the flow works end to end.
 *
 * Story order (top → bottom):
 *  1. Randy’s R150 “paid for itself” value prop
 *  2. Annual subscription price + pay / renew
 *  3. Refer a friend → R50 off + your code
 *  4. What’s unlocked
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { getSupabaseClient } from '../lib/supabaseClient'
import {
  clampToOneYear,
  daysLeft,
  loadMembership,
  membershipStatus,
  payfastConfig,
  PLUS_DAYS,
  PLUS_PRICE_CENTS,
  saveMembership,
  type Membership,
} from '../lib/membership'
import { payForYear } from '../lib/plusCheckout'
import {
  adoptServerReferralCode,
  FIRST_YEAR_PRICE_CENTS,
  hasShared,
  myReferralCode,
  plusPriceCents,
  REFERRAL_DISCOUNT_CENTS,
  rewardUnlocked,
  saveRewardUnlocked,
  shareApp,
} from '../lib/referral'
import { formatDateLong, todaySAST } from '../lib/dates'
import { formatZAR } from '../lib/money'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Randy } from '../components/ui/Randy'

const PERKS: string[] = [
  'Fun money that always matches your real cash',
  'Savings goals, milestones & auto-save',
  'Quests, streaks, XP & rank themes',
  'Smart nudges: pay day, overspend, streaks',
  'Month tracker, year view & net worth',
  'Every new feature for the next 12 months',
]

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, type: 'spring' as const, stiffness: 320, damping: 28 },
  }),
}

export function Plus() {
  const profile = useAppStore((s) => s.data.profile)
  const [membership, setMembership] = useState<Membership | null>(loadMembership)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const justPaid = params.get('paid') === '1'
  const cancelled = params.get('cancelled') === '1'

  const today = todaySAST()
  const status = membershipStatus(membership, today)
  const remainingDays = daysLeft(membership, today)
  const config = payfastConfig()

  // Give R… get R50: share code + reward state.
  const [refCode, setRefCode] = useState(myReferralCode)
  const [shared, setShared] = useState(hasShared)
  const [reward, setReward] = useState(rewardUnlocked)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const isFirstPayment = membership === null
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment,
  })
  const fullPrice = formatZAR(PLUS_PRICE_CENTS, { showCents: false })
  const payPrice = formatZAR(priceCents, { showCents: false })

  async function share() {
    const result = await shareApp(refCode)
    if (result !== 'failed') setShared(true)
    setShareNote(
      result === 'copied'
        ? 'Link copied — paste it to a friend!'
        : result === 'shared'
          ? 'Shared! Your R50 unlocks when they sign up.'
          : 'Sharing is blocked here — your code is above.',
    )
    window.setTimeout(() => setShareNote(null), 3000)
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(refCode)
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      /* ignore — share button still works */
    }
  }

  // Supabase mode: the server-verified membership wins over local state.
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    void (async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase
        .from('memberships')
        .select('paid_until, payment_ref, amount_cents, activated_at')
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (data?.paid_until) {
        const server: Membership = clampToOneYear({
          paidUntil: data.paid_until as string,
          paymentRef: (data.payment_ref as string) ?? 'payfast',
          amountCents: (data.amount_cents as number) ?? PLUS_PRICE_CENTS,
          activatedAt: (data.activated_at as string) ?? '',
        })
        saveMembership(server)
        setMembership(server)
      }
      // Share links must use the account's code, and a signed-up friend
      // unlocks the R50 — both server truths.
      const { data: me } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', auth.user.id)
        .maybeSingle()
      if (me?.referral_code) {
        adoptServerReferralCode(me.referral_code as string)
        setRefCode(me.referral_code as string)
      }
      const { count } = await supabase
        .from('referrals')
        .select('referred_user_id', { count: 'exact', head: true })
        .eq('referrer_user_id', auth.user.id)
      if ((count ?? 0) > 0) {
        saveRewardUnlocked(true)
        setReward(true)
      }
    })()
  }, [justPaid])

  async function pay() {
    if (busy) return
    setBusy(true)
    const result = await payForYear({
      priceCents,
      referralDiscount: reward && isFirstPayment,
      current: membership,
      email: profile?.email || undefined,
      name: profile?.displayName || undefined,
    })
    if (result !== 'redirected') setMembership(result)
    setBusy(false)
  }

  return (
    <Screen withTabBar={false}>
      <header className="flex items-center gap-3 mb-5">
        <Link
          to="/profile"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     font-display font-extrabold flex items-center justify-center"
          aria-label="Back to profile"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="font-display font-extrabold text-2xl leading-none">PennyPlay Plus</h1>
          <p className="text-[11px] text-ink-faint font-bold mt-1">
            Activate · refer · watch it pay for itself
          </p>
        </div>
      </header>

      {/* ── 1. Value: Randy + paid for itself ───────────────────────── */}
      {status !== 'active' && (
        <motion.section
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          aria-labelledby="plus-value-title"
          className="relative rounded-[28px] p-[2px] mb-4 overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#ffd700 0%,#a3e635 45%,#22d3ee 100%)' }}
        >
          <Card glow="gold" className="!border-transparent relative overflow-hidden !p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br
                         from-gold/15 via-transparent to-aqua/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-10 w-44 h-44
                         rounded-full bg-gold/20 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 bottom-0 w-36 h-36
                         rounded-full bg-lime/15 blur-3xl"
            />

            <div className="relative flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              >
                <Randy mood="celebrating" size={92} className="animate-bounce-fab" />
              </motion.div>

              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-gold mt-3">
                Why it&apos;s an easy yes
              </p>
              <h2
                id="plus-value-title"
                className="font-display font-extrabold text-[1.35rem] leading-[1.2] mt-2 max-w-[22ch]"
              >
                If Randy helps you save your first{' '}
                <span className="text-gradient-gold animate-shimmer">R150</span> this month,
              </h2>
              <p className="text-sm text-ink-soft font-semibold leading-snug mt-2 max-w-[30ch]">
                the app has essentially{' '}
                <span className="text-lime font-extrabold">paid for itself</span>.
              </p>

              <div className="mt-4 flex items-center gap-2 text-[11px] font-extrabold text-ink-faint">
                <span className="px-2.5 py-1 rounded-full bg-bg-deep/70 border border-edge">
                  Save R150
                </span>
                <span aria-hidden className="text-ink-faint">
                  →
                </span>
                <span className="px-2.5 py-1 rounded-full bg-lime/15 border border-lime/40 text-lime">
                  Year covered
                </span>
              </div>
            </div>
          </Card>
        </motion.section>
      )}

      {/* ── 2. Price: annual subscription ───────────────────────────── */}
      <motion.section
        custom={1}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        aria-labelledby="plus-price-title"
        className="rounded-[28px] p-[2px] mb-4"
        style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
      >
        <Card className="!border-transparent text-center pt-6 pb-5 relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 w-56 h-32
                       rounded-full bg-gold/15 blur-3xl"
          />

          <div className="relative">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint">
              Step 1 · Activate
            </p>
            <h2 id="plus-price-title" className="font-display font-extrabold text-lg mt-1">
              Annual subscription
            </h2>

            <p className="font-display font-extrabold leading-none mt-3">
              {reward && isFirstPayment ? (
                <>
                  <span className="text-ink-faint line-through text-2xl mr-2">{fullPrice}</span>
                  <span className="text-gradient-gold animate-shimmer text-5xl">{payPrice}</span>
                </>
              ) : (
                <span className="text-gradient-gold animate-shimmer text-5xl">{fullPrice}</span>
              )}
              <span className="text-base text-ink-soft font-extrabold"> / year</span>
            </p>

            {reward && isFirstPayment ? (
              <p className="text-xs font-extrabold text-lime mt-2">
                Friend reward applied — R50 off your first year
              </p>
            ) : (
              <p className="text-xs text-ink-soft font-semibold mt-2">
                One payment · billed yearly · no auto-renewal
              </p>
            )}

            <div className="flex items-stretch justify-center divide-x divide-edge mt-5 mx-1">
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">
                  One
                </span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">payment</span>
              </div>
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">
                  Yearly
                </span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">billing</span>
              </div>
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">
                  {PLUS_DAYS}
                </span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">
                  days access
                </span>
              </div>
            </div>

            {status === 'active' && membership && (
              <div className="mt-5 px-2 text-left">
                <p className="text-center text-[11px] font-extrabold text-lime mb-1.5">
                  ✓ Active until {formatDateLong(membership.paidUntil)}{' '}
                  {membership.paidUntil.slice(0, 4)} · {remainingDays} days left
                </p>
                <div className="relative h-2 rounded-full bg-bg-deep border border-edge/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime to-aqua"
                    style={{
                      width: `${Math.max(3, Math.round((remainingDays / PLUS_DAYS) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
                  <span>Your year</span>
                  <span>Renews by choice</span>
                </div>
              </div>
            )}
            {status === 'expired' && (
              <p
                className="inline-block mt-4 px-3 py-1 rounded-full bg-coral/15 border border-coral/40
                           text-coral text-xs font-extrabold"
              >
                Your year is up — renew to keep full access
              </p>
            )}
            {justPaid && status !== 'active' && (
              <p className="text-xs text-aqua font-bold mt-4">
                Payment received — your year activates as soon as PayFast confirms it. Check back in
                a minute.
              </p>
            )}
            {cancelled && (
              <p className="text-xs text-ink-faint font-bold mt-4">Payment cancelled — no charge.</p>
            )}

            {status === 'active' ? (
              <p className="text-center text-sm text-ink-soft font-semibold mt-5">
                You&apos;re all set for the year. Renewal opens here when your year is up.
              </p>
            ) : (
              <div className="mt-5 px-1">
                <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void pay()}>
                  {status === 'expired'
                    ? `Renew — ${payPrice} for a year`
                    : `Pay ${payPrice} for a year`}
                </Button3D>
                <p className="text-center text-[10px] text-ink-faint font-bold mt-3">
                  {config
                    ? `Secure checkout by PayFast${config.sandbox ? ' (sandbox)' : ''}. No auto-renewal — you choose when to pay again.`
                    : 'Test mode: payments aren’t connected yet, so this activates a trial year on this device.'}
                </p>
              </div>
            )}
          </div>
        </Card>
      </motion.section>

      {/* ── 3. Referral: code + R50 off ──────────────────────────────── */}
      <motion.section
        custom={2}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        aria-labelledby="plus-refer-title"
        className="rounded-[28px] p-[1.5px] mb-4"
        style={{ background: 'linear-gradient(120deg,#22d3ee,#7c3aed)' }}
      >
        <Card className="!border-transparent !p-5 relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 w-32 h-32
                       rounded-full bg-aqua/10 blur-3xl"
          />

          <div className="relative">
            <div className="flex items-start gap-3">
              <span
                className="w-12 h-12 shrink-0 rounded-[18px] bg-aqua/15 border border-aqua/40
                           flex items-center justify-center text-xl"
                aria-hidden
              >
                🤝
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-aqua">
                  Step 2 · Refer a friend
                </p>
                <h2
                  id="plus-refer-title"
                  className="font-display font-extrabold text-[1.05rem] leading-tight mt-1"
                >
                  Refer a friend and receive{' '}
                  <span className="text-lime">R50 off</span> your subscription
                </h2>
              </div>
            </div>

            <p className="text-xs text-ink-soft font-semibold leading-snug mt-3">
              Share your code. When they <span className="text-ink font-extrabold">sign up</span>,
              your first year drops from {fullPrice} to{' '}
              <span className="text-lime font-extrabold">
                {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })}
              </span>
              .
            </p>

            {/* Price math strip — instant comprehension */}
            <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-bg-deep/80 border border-edge px-2 py-2.5">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
                  Full
                </p>
                <p className="font-display font-extrabold text-sm mt-0.5">{fullPrice}</p>
              </div>
              <div className="rounded-2xl bg-aqua/10 border border-aqua/35 px-2 py-2.5">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-aqua">
                  Friend
                </p>
                <p className="font-display font-extrabold text-sm text-aqua mt-0.5">
                  −{formatZAR(REFERRAL_DISCOUNT_CENTS, { showCents: false })}
                </p>
              </div>
              <div className="rounded-2xl bg-lime/10 border border-lime/35 px-2 py-2.5">
                <p className="text-[9px] font-extrabold uppercase tracking-wider text-lime">
                  You pay
                </p>
                <p className="font-display font-extrabold text-sm text-lime mt-0.5">
                  {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })}
                </p>
              </div>
            </div>

            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink-faint mt-4 mb-1.5 text-center">
              Your referral code
            </p>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="w-full px-3 py-3.5 rounded-[18px] border-2 border-dashed border-aqua/45
                         bg-bg-deep text-center transition-colors active:bg-card-raised
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua"
              aria-label={`Referral code ${refCode}. Tap to copy.`}
            >
              <span className="font-display font-extrabold tracking-[0.28em] text-ink text-xl">
                {refCode}
              </span>
              <span className="block text-[10px] font-bold text-ink-faint mt-1">
                {copiedCode ? 'Copied ✓' : 'Tap to copy'}
              </span>
            </button>

            <div className="mt-3">
              <Button3D full variant="aqua" onClick={() => void share()}>
                Share my link
              </Button3D>
            </div>
            {shareNote && (
              <p className="text-xs text-aqua font-bold mt-2 text-center">{shareNote}</p>
            )}
            <p className="text-[11px] font-bold mt-2.5 text-center">
              {reward ? (
                <span className="text-lime">✓ A friend signed up — your R50 is unlocked!</span>
              ) : shared ? (
                <span className="text-ink-faint">
                  Link shared · your R50 unlocks the moment a friend signs up with it
                </span>
              ) : (
                <span className="text-ink-faint">
                  Waiting for a friend to sign up with your code
                </span>
              )}
            </p>
          </div>
        </Card>
      </motion.section>

      {/* ── 4. What you get ─────────────────────────────────────────── */}
      <motion.section
        custom={3}
        variants={fadeUp}
        initial="hidden"
        animate="show"
        aria-labelledby="plus-perks-title"
      >
        <Card className="mb-8 !p-5">
          <p
            id="plus-perks-title"
            className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-3"
          >
            Everything, unlocked
          </p>
          <div className="flex flex-col gap-2.5">
            {PERKS.map((text) => (
              <div key={text} className="flex items-center gap-3">
                <span
                  className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-b from-lime to-emerald
                             flex items-center justify-center text-[11px] font-extrabold text-[#1a2e05]"
                  aria-hidden
                >
                  ✓
                </span>
                <p className="text-sm text-ink-soft font-semibold leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.section>
    </Screen>
  )
}
