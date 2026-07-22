/**
 * PennyPlay Plus — the pricing page. A world-class-but-honest pricing
 * table (free look vs monthly vs yearly with features, pros AND cons),
 * the member's current status with days-left meter, cancel/upgrade
 * controls, payment confirmation states (confirming → active / failed /
 * cancelled) and the payment history. Real checkout via the
 * payfast-checkout edge function (or legacy client URL); clearly-labelled
 * test mode otherwise.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import {
  daysLeft,
  loadMembership,
  membershipStatus,
  MONTHLY_PRICE_CENTS,
  payfastConfig,
  PLUS_DAYS,
  PLUS_PRICE_CENTS,
  type Membership,
  type PlanId,
} from '../lib/membership'
import { FEATURE_MATRIX, TIERS, YEARLY_SAVING_CENTS, type PlanTier } from '../lib/plans'
import { payForPlan } from '../lib/plusCheckout'
import {
  cancelPlusSubscription,
  fetchPayments,
  syncMembershipFromServer,
  type PaymentRecord,
} from '../lib/plusServer'
import {
  adoptServerReferralCode,
  hasShared,
  myReferralCode,
  plusPriceCents,
  rewardUnlocked,
  saveRewardUnlocked,
  shareApp,
} from '../lib/referral'
import { getSupabaseClient } from '../lib/supabaseClient'
import { formatDateLong, todaySAST } from '../lib/dates'
import { formatZAR } from '../lib/money'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Sheet } from '../components/ui/Sheet'
import { Randy } from '../components/ui/Randy'

const CONFIRM_POLL_MS = 4_000
const CONFIRM_TIMEOUT_MS = 90_000

export function Plus() {
  const profile = useAppStore((s) => s.data.profile)
  const [membership, setMembership] = useState<Membership | null>(loadMembership)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const justPaid = params.get('paid') === '1'
  const wasCancelled = params.get('cancelled') === '1'
  const [confirming, setConfirming] = useState(false)
  const [confirmTimedOut, setConfirmTimedOut] = useState(false)
  const [cancelSheet, setCancelSheet] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const pollUntil = useRef(0)

  const today = todaySAST()
  const status = membershipStatus(membership, today)
  const remainingDays = daysLeft(membership, today)
  const isCancelled = membership?.billing === 'cancelled'
  const connected = getSupabaseClient() !== null
  const paymentsConfigured = connected || payfastConfig() !== null

  // Give R… get R50: share code + reward state.
  const [refCode, setRefCode] = useState(myReferralCode)
  const [shared, setShared] = useState(hasShared)
  const [reward, setReward] = useState(rewardUnlocked)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const isFirstPayment = membership === null
  const yearlyPriceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment,
  })

  // Server truth: membership row, referral state and payment history.
  useEffect(() => {
    void (async () => {
      const server = await syncMembershipFromServer()
      setMembership(server)
      setPayments(await fetchPayments())
      const supabase = getSupabaseClient()
      if (!supabase) return
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
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

  // Back from PayFast with ?paid=1: the ITN usually lands within seconds —
  // poll the server until the membership activates (or we stop hoping).
  useEffect(() => {
    if (!justPaid || !connected) return
    if (membershipStatus(loadMembership(), todaySAST()) === 'active') return
    setConfirming(true)
    pollUntil.current = Date.now() + CONFIRM_TIMEOUT_MS
    const timer = window.setInterval(async () => {
      const server = await syncMembershipFromServer()
      if (membershipStatus(server, todaySAST()) === 'active') {
        setMembership(server)
        setPayments(await fetchPayments())
        setConfirming(false)
        window.clearInterval(timer)
      } else if (Date.now() > pollUntil.current) {
        setConfirming(false)
        setConfirmTimedOut(true)
        window.clearInterval(timer)
      }
    }, CONFIRM_POLL_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPaid, connected])

  async function pay(plan: PlanId) {
    if (busyPlan) return
    setBusyPlan(plan)
    setCheckoutError(null)
    const result = await payForPlan({
      plan,
      priceCents: plan === 'yearly' ? yearlyPriceCents : MONTHLY_PRICE_CENTS,
      referralDiscount: plan === 'yearly' && reward && isFirstPayment,
      current: membership,
      email: profile?.email || undefined,
      name: profile?.displayName || undefined,
    })
    if (result === 'redirected') return // browser is leaving for PayFast
    if (typeof result === 'object' && 'error' in result) setCheckoutError(result.error)
    else setMembership(result)
    setBusyPlan(null)
  }

  async function confirmCancel() {
    if (cancelBusy) return
    setCancelBusy(true)
    setCancelError(null)
    const result = await cancelPlusSubscription()
    setCancelBusy(false)
    if (result.ok) {
      setMembership(result.membership)
      setCancelSheet(false)
    } else {
      setCancelError(result.message)
    }
  }

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

  const lastPayment = payments[0]
  const showFailedBanner =
    lastPayment && lastPayment.status === 'failed' && !confirming && status !== 'active'

  return (
    <Screen withTabBar={false}>
      <header className="flex items-center gap-3 mb-4">
        <Link
          to="/profile"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     font-display font-extrabold flex items-center justify-center"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">PennyPlay Plus</h1>
      </header>

      {/* ----- Payment outcome banners ----- */}
      {confirming && (
        <Card className="mb-4 flex items-center gap-3 !border-aqua/40">
          <span
            aria-hidden
            className="w-5 h-5 shrink-0 rounded-full border-2 border-aqua border-t-transparent animate-spin"
          />
          <div>
            <p className="font-display font-extrabold text-sm text-aqua">Confirming your payment…</p>
            <p className="text-xs text-ink-soft font-semibold">
              PayFast is telling us it went through — this usually takes a few seconds.
            </p>
          </div>
        </Card>
      )}
      {confirmTimedOut && status !== 'active' && (
        <Card className="mb-4 !border-gold/40">
          <p className="font-display font-extrabold text-sm text-gold">Still waiting on PayFast</p>
          <p className="text-xs text-ink-soft font-semibold mt-1">
            Your payment is taking longer than usual to confirm. If you were charged, your plan
            will activate automatically — check back in a few minutes. If you weren't charged, you
            can simply try again below. No double-billing: every payment is verified before it
            counts.
          </p>
        </Card>
      )}
      {wasCancelled && status !== 'active' && !confirming && (
        <Card className="mb-4">
          <p className="text-xs text-ink-soft font-bold">
            Payment cancelled — no charge. Whenever you're ready, the plans are below.
          </p>
        </Card>
      )}
      {showFailedBanner && (
        <Card className="mb-4 !border-coral/40">
          <p className="font-display font-extrabold text-sm text-coral">Your last payment failed</p>
          <p className="text-xs text-ink-soft font-semibold mt-1">
            The bank declined the charge — no money moved and nothing was activated. Check your
            card and try again below.
          </p>
        </Card>
      )}
      {checkoutError && (
        <Card className="mb-4 !border-coral/40">
          <p className="text-xs text-coral font-bold">{checkoutError}</p>
        </Card>
      )}

      {/* ----- Member status card ----- */}
      {membership && status !== 'none' && (
        <div
          className="rounded-[26px] p-[2px] mb-4"
          style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
        >
          <Card className="!border-transparent relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent"
            />
            <div className="relative">
              <div className="flex items-center gap-3">
                <Randy mood={status === 'active' ? 'celebrating' : 'happy'} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint">
                    Your plan
                  </p>
                  <p className="font-display font-extrabold text-lg leading-tight">
                    {membership.plan === 'monthly' ? '🌙 Plus Monthly' : '⭐ Plus Yearly'}
                    {membership.paymentRef === 'test-mode' && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gold/15 text-gold font-bold uppercase">
                        test
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider ${
                    status === 'active'
                      ? isCancelled
                        ? 'bg-gold/15 text-gold'
                        : 'bg-lime/15 text-lime'
                      : 'bg-coral/15 text-coral'
                  }`}
                >
                  {status === 'active' ? (isCancelled ? 'ending' : 'active') : 'expired'}
                </span>
              </div>

              {status === 'active' ? (
                <div className="mt-3">
                  <p className="text-[11px] font-extrabold text-ink-soft mb-1.5">
                    {isCancelled ? (
                      <>
                        Auto-billing stopped — access until{' '}
                        <b className="text-ink">
                          {formatDateLong(membership.paidUntil)} {membership.paidUntil.slice(0, 4)}
                        </b>{' '}
                        · {remainingDays} days left
                      </>
                    ) : (
                      <>
                        {membership.plan === 'monthly' ? 'Renews around' : 'Paid up to'}{' '}
                        <b className="text-ink">
                          {formatDateLong(membership.paidUntil)} {membership.paidUntil.slice(0, 4)}
                        </b>{' '}
                        · {remainingDays} days left
                      </>
                    )}
                  </p>
                  <div className="relative h-2 rounded-full bg-bg-deep border border-edge/60">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime to-aqua"
                      style={{
                        width: `${Math.max(
                          3,
                          Math.min(
                            100,
                            Math.round(
                              (remainingDays / (membership.plan === 'monthly' ? 33 : PLUS_DAYS)) * 100,
                            ),
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-coral font-extrabold mt-2">
                  Your plan lapsed on {formatDateLong(membership.paidUntil)}{' '}
                  {membership.paidUntil.slice(0, 4)} — pick a plan below to jump back in.
                </p>
              )}

              {/* Plan management */}
              {status === 'active' && membership.plan === 'monthly' && (
                <div className="flex flex-col gap-2 mt-4">
                  <Button3D
                    full
                    variant="gold"
                    size="md"
                    disabled={busyPlan !== null}
                    onClick={() => void pay('yearly')}
                  >
                    ⭐ Upgrade to Yearly — save R{YEARLY_SAVING_CENTS / 100} a year
                  </Button3D>
                  {!isCancelled && (
                    <Button3D full variant="ghost" size="sm" onClick={() => setCancelSheet(true)}>
                      Cancel subscription
                    </Button3D>
                  )}
                  {isCancelled && (
                    <p className="text-[10px] text-ink-faint font-bold text-center">
                      Changed your mind? Pick a plan below to restart — your remaining days carry
                      over.
                    </p>
                  )}
                </div>
              )}
              {status === 'active' && membership.plan === 'yearly' && (
                <p className="text-[11px] text-ink-soft font-semibold mt-3 text-center">
                  🎉 You're set for the year. No auto-renewal — renewal opens here when your year
                  is up.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ----- Pricing table ----- */}
      {!(status === 'active' && membership?.plan === 'yearly') && (
        <>
          <div className="text-center mt-6 mb-4">
            <Randy mood="happy" size={64} className="mx-auto" />
            <h2 className="font-display font-extrabold text-xl mt-2">Pick your plan</h2>
            <p className="text-xs text-ink-soft font-semibold mt-1 max-w-[36ch] mx-auto">
              Same full app on both paid plans — the only difference is how you pay.
            </p>
          </div>

          <div className="flex flex-col gap-4 mb-2">
            {TIERS.map((t) => (
              <TierCard
                key={t.id}
                tier={t}
                currentPlan={status === 'active' ? membership?.plan ?? null : null}
                busy={busyPlan}
                displayPriceCents={
                  t.id === 'yearly' && reward && isFirstPayment ? yearlyPriceCents : t.priceCents
                }
                discounted={t.id === 'yearly' && reward && isFirstPayment}
                onPay={(plan) => void pay(plan)}
              />
            ))}
          </div>
          <p className="text-center text-[10px] text-ink-faint font-bold mb-5">
            {paymentsConfigured
              ? 'Secure checkout by PayFast — cards, EFT & more. Your card details never touch PennyPlay.'
              : 'Test mode: payments aren’t connected yet, so plans activate a trial on this device.'}
          </p>

          {/* Feature comparison matrix */}
          <Card className="mb-5 !px-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-2 px-1">
              Compare everything
            </p>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 pr-1 font-extrabold w-[46%]">Feature</th>
                  <th className="py-1.5 text-center">Free</th>
                  <th className="py-1.5 text-center">Monthly</th>
                  <th className="py-1.5 text-center text-gold">Yearly</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.label} className="border-t border-edge/60">
                    <td className="py-2 pr-1 text-[11px] font-bold text-ink-soft leading-tight">
                      {row.label}
                    </td>
                    <MatrixCell value={row.free} />
                    <MatrixCell value={row.monthly} />
                    <MatrixCell value={row.yearly} />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ----- Give R50, get R50 off ----- */}
      <div
        className="rounded-[24px] p-[1.5px] mb-4"
        style={{ background: 'linear-gradient(120deg,#22d3ee,#7c3aed)' }}
      >
        <Card className="!border-transparent">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 shrink-0 rounded-2xl bg-aqua/15 border border-aqua/40
                         flex items-center justify-center text-lg"
              aria-hidden
            >
              🎁
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint">
                Share &amp; save R50
              </p>
              <p className="font-display font-extrabold text-sm leading-tight">
                Give PennyPlay, get R50 off your first year
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-soft font-semibold leading-snug mt-2.5">
            Send your link to a friend. The moment they <b className="text-ink">sign up</b>, your
            first year drops from {formatZAR(PLUS_PRICE_CENTS, { showCents: false })} to{' '}
            <b className="text-lime">R 150</b>.
          </p>
          <div
            className="mt-3 px-3 py-2.5 rounded-2xl border-2 border-dashed border-aqua/40 bg-bg-deep
                       text-center font-display font-extrabold tracking-[0.25em] text-ink"
          >
            {refCode}
          </div>
          <div className="mt-3">
            <Button3D full variant="aqua" onClick={() => void share()}>
              Share my link
            </Button3D>
          </div>
          {shareNote && <p className="text-xs text-aqua font-bold mt-2 text-center">{shareNote}</p>}
          <p className="text-[11px] font-bold mt-2.5 text-center">
            {reward ? (
              <span className="text-lime">✓ A friend signed up — your R50 is unlocked!</span>
            ) : shared ? (
              <span className="text-ink-faint">
                Link shared · your R50 unlocks the moment a friend signs up with it
              </span>
            ) : (
              <span className="text-ink-faint">No sign-up from your link yet</span>
            )}
          </p>
        </Card>
      </div>

      {/* ----- Payment history ----- */}
      {payments.length > 0 && (
        <Card className="mb-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-2">
            Payment history
          </p>
          <div className="flex flex-col divide-y divide-edge/60">
            {payments.map((p) => (
              <div key={`${p.pfPaymentId}-${p.status}-${p.createdAt}`} className="flex items-center gap-3 py-2">
                <span aria-hidden className="text-base">
                  {p.status === 'complete' ? '✅' : p.status === 'cancelled' ? '🛑' : '⚠️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold leading-tight truncate">
                    {p.plan === 'monthly' ? 'Plus Monthly' : 'Plus Yearly'}
                    <span className="text-ink-faint font-bold"> · {p.createdAt.slice(0, 10)}</span>
                  </p>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      p.status === 'complete'
                        ? 'text-lime'
                        : p.status === 'cancelled'
                          ? 'text-ink-faint'
                          : 'text-coral'
                    }`}
                  >
                    {p.status === 'complete'
                      ? 'Paid'
                      : p.status === 'cancelled'
                        ? 'Subscription cancelled'
                        : 'Failed — not charged'}
                  </p>
                </div>
                {p.status === 'complete' && (
                  <span className="font-display font-extrabold text-sm">
                    {formatZAR(p.amountCents, { showCents: false })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ----- Fine print ----- */}
      <Card className="mb-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-2">
          The honest fine print
        </p>
        <ul className="flex flex-col gap-1.5 text-[11px] text-ink-soft font-semibold leading-snug">
          <li>
            🔐 Payments are processed by <b className="text-ink">PayFast</b> — your card details
            never touch PennyPlay's servers, and every payment is verified server-side before it
            activates anything.
          </li>
          <li>
            🌙 Monthly auto-renews via PayFast until you cancel. Cancel in one tap here — you keep
            access to the end of the period you paid for.
          </li>
          <li>⭐ Yearly is a single payment. It never auto-renews; you choose when to pay again.</li>
          <li>💳 A failed charge never removes access you already paid for.</li>
          <li>📈 Upgrading from Monthly to Yearly stops the monthly billing automatically.</li>
        </ul>
      </Card>

      {/* ----- Cancel confirmation ----- */}
      <Sheet open={cancelSheet} onClose={() => setCancelSheet(false)} title="Cancel Plus Monthly?">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            This stops the R25 monthly billing at PayFast. You keep full access until{' '}
            <b className="text-ink">
              {membership ? `${formatDateLong(membership.paidUntil)} ${membership.paidUntil.slice(0, 4)}` : ''}
            </b>
            , then the app locks until you subscribe again. Nothing already paid is lost.
          </p>
          {cancelError && <p className="text-xs text-coral font-bold">{cancelError}</p>}
          <Button3D variant="coral" full disabled={cancelBusy} onClick={() => void confirmCancel()}>
            {cancelBusy ? 'Cancelling…' : 'Yes, stop billing'}
          </Button3D>
          <Button3D variant="ghost" full onClick={() => setCancelSheet(false)}>
            Keep my subscription
          </Button3D>
        </div>
      </Sheet>
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function TierCard({
  tier,
  currentPlan,
  busy,
  displayPriceCents,
  discounted,
  onPay,
}: {
  tier: PlanTier
  currentPlan: PlanId | null
  busy: PlanId | null
  displayPriceCents: number
  discounted: boolean
  onPay: (plan: PlanId) => void
}) {
  const isPaid = tier.id !== 'free'
  const isCurrent = isPaid && currentPlan === tier.id
  const highlight = tier.badge !== undefined

  const inner = (
    <Card className={`relative overflow-hidden ${highlight ? '!border-transparent' : ''}`}>
      {tier.badge && (
        <span
          className="absolute top-3 right-3 text-[9px] px-2.5 py-1 rounded-full font-extrabold
                     uppercase tracking-wider bg-gold/15 text-gold border border-gold/40"
        >
          🏆 {tier.badge}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {tier.emoji}
        </span>
        <div>
          <p className="font-display font-extrabold text-base leading-tight">{tier.name}</p>
          <p className="text-[11px] text-ink-faint font-bold">{tier.tagline}</p>
        </div>
      </div>

      <p className="font-display font-extrabold leading-tight mt-3">
        <span className={`text-4xl ${highlight ? 'text-gradient-gold animate-shimmer' : ''}`}>
          {formatZAR(displayPriceCents, { showCents: false })}
        </span>
        <span className="text-sm text-ink-soft"> {tier.per}</span>
        {discounted && (
          <span className="ml-2 text-xs text-ink-faint line-through font-bold">
            {formatZAR(tier.priceCents, { showCents: false })}
          </span>
        )}
      </p>
      <p className="text-[10px] text-ink-faint font-bold mt-0.5">
        {discounted ? '🎁 Friend reward applied to your first year' : tier.priceNote}
      </p>

      <div className="flex flex-col gap-1.5 mt-3">
        {tier.includes.map((f) => (
          <div key={f} className="flex items-start gap-2">
            <span
              className="mt-[1px] w-[18px] h-[18px] shrink-0 rounded-full bg-gradient-to-b from-lime to-emerald
                         flex items-center justify-center text-[9px] font-extrabold text-[#1a2e05]"
              aria-hidden
            >
              ✓
            </span>
            <p className="text-xs text-ink-soft font-semibold leading-snug">{f}</p>
          </div>
        ))}
      </div>

      {/* Pros & cons */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-2xl bg-bg-deep border border-edge/60 p-2.5">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-lime mb-1">Pros</p>
          {tier.pros.map((p) => (
            <p key={p} className="text-[10.5px] text-ink-soft font-semibold leading-snug py-0.5">
              <span className="text-lime">+</span> {p}
            </p>
          ))}
        </div>
        <div className="rounded-2xl bg-bg-deep border border-edge/60 p-2.5">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-coral mb-1">Cons</p>
          {tier.cons.map((c) => (
            <p key={c} className="text-[10.5px] text-ink-soft font-semibold leading-snug py-0.5">
              <span className="text-coral">−</span> {c}
            </p>
          ))}
        </div>
      </div>

      {isPaid && (
        <div className="mt-3.5">
          {isCurrent ? (
            <p
              className="text-center text-[11px] font-extrabold text-lime bg-lime/10 border border-lime/30
                         rounded-2xl py-2.5"
            >
              ✓ Your current plan
            </p>
          ) : (
            <Button3D
              full
              size="md"
              variant={tier.ctaVariant ?? 'gold'}
              disabled={busy !== null}
              onClick={() => onPay(tier.id as PlanId)}
            >
              {busy === tier.id ? 'Opening secure checkout…' : tier.cta}
            </Button3D>
          )}
        </div>
      )}
      {!isPaid && (
        <p className="text-center text-[10px] text-ink-faint font-bold mt-3.5">
          You're on it right now — that's the countdown you keep hitting 😄
        </p>
      )}
    </Card>
  )

  if (!highlight) return inner
  return (
    <div
      className="rounded-[26px] p-[2px]"
      style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
    >
      {inner}
    </div>
  )
}

function MatrixCell({ value }: { value: boolean | string }) {
  return (
    <td className="py-2 text-center align-middle">
      {value === true ? (
        <span className="text-lime font-extrabold" aria-label="included">
          ✓
        </span>
      ) : value === false ? (
        <span className="text-ink-faint font-extrabold" aria-label="not included">
          ✗
        </span>
      ) : (
        <span className="text-[10px] text-ink-soft font-bold">{value}</span>
      )}
    </td>
  )
}
