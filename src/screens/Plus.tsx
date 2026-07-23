/**
 * PennyPlay Plus — the pricing page. One paid plan: yearly auto-renew at
 * R200/year (with the free look as the alternative), shown with features,
 * honest pros AND cons, the member's current status with days-left meter,
 * cancel controls, payment confirmation states (confirming → active /
 * failed / cancelled) and payment history. Real checkout via the
 * payfast-checkout edge function; clearly-labelled test mode otherwise.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import {
  daysLeft,
  loadMembership,
  membershipStatus,
  payfastConfig,
  PLUS_DAYS,
  PLUS_PRICE_CENTS,
  type Membership,
} from '../lib/membership'
import { FEATURE_MATRIX, TIERS, type PlanTier } from '../lib/plans'
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
  shouldOfferReferralBeforePay,
} from '../lib/referral'
import { ReferralOfferPopup } from '../components/ReferralOfferPopup'
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

export function Plus({ locked = false }: { locked?: boolean }) {
  const profile = useAppStore((s) => s.data.profile)
  const refreshPlus = useAppStore((s) => s.refreshPlus)
  const [membership, setMembership] = useState<Membership | null>(loadMembership)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [busy, setBusy] = useState(false)
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
  const [offerOpen, setOfferOpen] = useState(false)
  const isFirstPayment = membership === null
  const priceCents = plusPriceCents({
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
        refreshPlus()
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

  /** Tapping Pay at the full R200 first opens the "save R50" popup. */
  function pay() {
    if (busy) return
    if (shouldOfferReferralBeforePay({ unlocked: reward, isFirstPayment })) {
      setOfferOpen(true)
      return
    }
    void startCheckout()
  }

  async function startCheckout() {
    if (busy) return
    setBusy(true)
    setCheckoutError(null)
    // Price is decided at the moment of payment: the reward may have
    // unlocked while the referral popup was open and waiting.
    const unlockedNow = rewardUnlocked()
    const result = await payForPlan({
      plan: 'yearly',
      priceCents: plusPriceCents({
        fullPriceCents: PLUS_PRICE_CENTS,
        unlocked: unlockedNow,
        isFirstPayment,
      }),
      referralDiscount: unlockedNow && isFirstPayment,
      current: membership,
      email: profile?.email || undefined,
      name: profile?.displayName || undefined,
    })
    if (result === 'redirected') return // browser is leaving for PayFast
    if (typeof result === 'object' && 'error' in result) setCheckoutError(result.error)
    else {
      setMembership(result)
      // Lift the members-only lock the moment the year activates.
      refreshPlus()
    }
    setBusy(false)
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
    <Screen withTabBar>
      <header className="flex items-center gap-3 mb-4">
        {!locked && (
          <Link
            to="/profile"
            className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                       font-display font-extrabold flex items-center justify-center"
            aria-label="Back"
          >
            ←
          </Link>
        )}
        <h1 className="font-display font-extrabold text-2xl">PennyPlay Plus</h1>
      </header>

      {locked && status !== 'active' && (
        <div
          className="mb-4 px-4 py-3 rounded-2xl border border-lime/40 bg-lime/10
                     text-sm font-bold text-ink"
        >
          ✓ You're signed up! One last step — a year of Plus unlocks the full app.
        </div>
      )}

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
            Payment cancelled — no charge. Whenever you're ready, Plus is below.
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
                    ⭐ PennyPlay Plus
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
                        Auto-renew stopped — access until{' '}
                        <b className="text-ink">
                          {formatDateLong(membership.paidUntil)} {membership.paidUntil.slice(0, 4)}
                        </b>{' '}
                        · {remainingDays} days left
                      </>
                    ) : (
                      <>
                        Renews around{' '}
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
                          Math.min(100, Math.round((remainingDays / PLUS_DAYS) * 100)),
                        )}%`,
                      }}
                    />
                  </div>
                  {!isCancelled ? (
                    <div className="mt-4">
                      <Button3D full variant="ghost" size="sm" onClick={() => setCancelSheet(true)}>
                        Cancel auto-renew
                      </Button3D>
                      <p className="text-[10px] text-ink-faint font-bold text-center mt-2">
                        You'll keep full access until the end of your paid year.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <Button3D full variant="gold" size="md" disabled={busy} onClick={() => void pay()}>
                        {busy ? 'Opening secure checkout…' : 'Restart auto-renew — R200 / year'}
                      </Button3D>
                      <p className="text-[10px] text-ink-faint font-bold text-center mt-2">
                        Your remaining days carry over when you restart.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-xs text-coral font-extrabold">
                    Your plan lapsed on {formatDateLong(membership.paidUntil)}{' '}
                    {membership.paidUntil.slice(0, 4)} — rejoin below to jump back in.
                  </p>
                  <div className="mt-3">
                    <Button3D full variant="gold" size="md" disabled={busy} onClick={() => void pay()}>
                      {busy
                        ? 'Opening secure checkout…'
                        : `Renew — ${formatZAR(priceCents, { showCents: false })} / year`}
                    </Button3D>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ----- Pricing table ----- */}
      {!(status === 'active' && !isCancelled) && status !== 'expired' && (
        <>
          <div className="text-center mt-6 mb-4">
            <Randy mood="happy" size={64} className="mx-auto" />
            <h2 className="font-display font-extrabold text-xl mt-2">
              {status === 'active' ? 'Restart Plus' : 'Join PennyPlay Plus'}
            </h2>
            <p className="text-xs text-ink-soft font-semibold mt-1 max-w-[36ch] mx-auto">
              One plan. R200 a year. Auto-renews — cancel anytime.
            </p>
          </div>

          <div className="flex flex-col gap-4 mb-2">
            {TIERS.map((t) => (
              <TierCard
                key={t.id}
                tier={t}
                isMember={status === 'active'}
                busy={busy}
                displayPriceCents={
                  t.id === 'yearly' && reward && isFirstPayment ? priceCents : t.priceCents
                }
                discounted={t.id === 'yearly' && reward && isFirstPayment}
                onPay={() => void pay()}
              />
            ))}
          </div>
          <p className="text-center text-[10px] text-ink-faint font-bold mb-5">
            {paymentsConfigured
              ? 'Secure checkout by PayFast — cards, EFT & more. Your card details never touch PennyPlay.'
              : 'Test mode: payments aren’t connected yet, so Plus activates a trial year on this device.'}
          </p>

          {/* Feature comparison matrix */}
          <Card className="mb-5 !px-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-2 px-1">
              Compare everything
            </p>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 pr-1 font-extrabold w-[55%]">Feature</th>
                  <th className="py-1.5 text-center">Free</th>
                  <th className="py-1.5 text-center text-gold">Plus</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.label} className="border-t border-edge/60">
                    <td className="py-2 pr-1 text-[11px] font-bold text-ink-soft leading-tight">
                      {row.label}
                    </td>
                    <MatrixCell value={row.free} />
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
              <div
                key={`${p.pfPaymentId}-${p.status}-${p.createdAt}`}
                className="flex items-center gap-3 py-2"
              >
                <span aria-hidden className="text-base">
                  {p.status === 'complete' ? '✅' : p.status === 'cancelled' ? '🛑' : '⚠️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold leading-tight truncate">
                    PennyPlay Plus
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
                        ? 'Auto-renew cancelled'
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

      {/* ----- Fine print (Apple-style grouped list) ----- */}
      <section className="mb-6">
        <p className="px-1 mb-2 text-[11px] font-semibold tracking-tight text-ink-faint">
          The honest fine print
        </p>
        <div className="rounded-[22px] overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <FinePrintRow
            icon={<LockGlyph />}
            iconClass="bg-violet"
            title="Secured by PayFast"
            body="Your card details never touch PennyPlay. Every payment is verified server-side before anything unlocks."
          />
          <FinePrintRow
            icon={<RenewGlyph />}
            iconClass="bg-ember"
            title="R200 a year, auto-renews"
            body="Renews each year via PayFast until you cancel. Cancel in one tap — keep access to the end of the year you paid for."
          />
          <FinePrintRow
            icon={<ShieldGlyph />}
            iconClass="bg-lime"
            title="Failed renewals stay soft"
            body="A declined charge never removes access you've already paid for."
          />
          <FinePrintRow
            icon={<GiftGlyph />}
            iconClass="bg-coral"
            title="R50 off with a friend"
            body="A friend who signs up with your link unlocks R50 off your first year only."
            last
          />
        </div>
      </section>

      {/* ----- Cancel confirmation ----- */}
      <Sheet open={cancelSheet} onClose={() => setCancelSheet(false)} title="Cancel auto-renew?">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            This stops the yearly R200 auto-renew at PayFast. You keep full access until{' '}
            <b className="text-ink">
              {membership
                ? `${formatDateLong(membership.paidUntil)} ${membership.paidUntil.slice(0, 4)}`
                : ''}
            </b>
            , then the app locks until you subscribe again. Nothing already paid is lost.
          </p>
          {cancelError && <p className="text-xs text-coral font-bold">{cancelError}</p>}
          <Button3D variant="coral" full disabled={cancelBusy} onClick={() => void confirmCancel()}>
            {cancelBusy ? 'Cancelling…' : 'Yes, stop auto-renew'}
          </Button3D>
          <Button3D variant="ghost" full onClick={() => setCancelSheet(false)}>
            Keep auto-renewing
          </Button3D>
        </div>
      </Sheet>

      {/* Refer-a-friend nudge before the full-price R200 checkout */}
      <ReferralOfferPopup
        open={offerOpen}
        code={refCode}
        fullPriceCents={PLUS_PRICE_CENTS}
        onClose={() => setOfferOpen(false)}
        onShared={() => setShared(true)}
        onUnlocked={() => setReward(true)}
        onProceed={() => {
          setOfferOpen(false)
          void startCheckout()
        }}
      />
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function TierCard({
  tier,
  isMember,
  busy,
  displayPriceCents,
  discounted,
  onPay,
}: {
  tier: PlanTier
  isMember: boolean
  busy: boolean
  displayPriceCents: number
  discounted: boolean
  onPay: () => void
}) {
  const isPaid = tier.id !== 'free'
  const highlight = tier.badge !== undefined

  const inner = (
    <Card className={`relative overflow-hidden ${highlight ? '!border-transparent' : ''}`}>
      {tier.badge && (
        <span
          className="absolute top-3 right-3 text-[9px] px-2.5 py-1 rounded-full font-extrabold
                     uppercase tracking-wider bg-gold/15 text-gold border border-gold/40"
        >
          🔁 {tier.badge}
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

      {/* Pros & cons — stacked, detached, clean */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="rounded-2xl border border-lime/20 bg-lime/[0.06] px-3.5 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-lime mb-2.5">
            Pros
          </p>
          <ul className="flex flex-col gap-2">
            {tier.pros.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-lime/20 text-lime
                             flex items-center justify-center text-[10px] font-extrabold leading-none"
                  aria-hidden
                >
                  +
                </span>
                <span className="text-[12px] text-ink-soft font-semibold leading-snug">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-coral/20 bg-coral/[0.06] px-3.5 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-coral mb-2.5">
            Cons
          </p>
          <ul className="flex flex-col gap-2">
            {tier.cons.map((c) => (
              <li key={c} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-coral/20 text-coral
                             flex items-center justify-center text-[10px] font-extrabold leading-none"
                  aria-hidden
                >
                  −
                </span>
                <span className="text-[12px] text-ink-soft font-semibold leading-snug">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isPaid && (
        <div className="mt-3.5">
          {isMember ? (
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
              disabled={busy}
              onClick={onPay}
            >
              {busy ? 'Opening secure checkout…' : tier.cta}
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

/** Apple Settings-style row: soft icon well + title + supporting line. */
function FinePrintRow({
  icon,
  iconClass,
  title,
  body,
  last = false,
}: {
  icon: ReactNode
  iconClass: string
  title: string
  body: string
  last?: boolean
}) {
  return (
    <div className={`flex gap-3 px-3.5 py-3.5 ${last ? '' : 'border-b border-white/10'}`}>
      <span
        className={`mt-0.5 w-7 h-7 shrink-0 rounded-[8px] ${iconClass}
                    flex items-center justify-center text-white shadow-sm`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold tracking-tight text-ink leading-snug">{title}</p>
        <p className="mt-0.5 text-[12px] font-medium text-ink-soft leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" />
    </svg>
  )
}

function RenewGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 1 1-2.3-5.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShieldGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2 4.5 5v6.5c0 5 3.4 9.4 7.5 10.5 4.1-1.1 7.5-5.5 7.5-10.5V5L12 2Z" />
      <path
        d="M10.2 12.8 8.5 11l-1.2 1.2 2.9 2.9 5-5-1.2-1.2-3.8 3.9Z"
        fill="white"
        fillOpacity="0.92"
      />
    </svg>
  )
}

function GiftGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" fill="currentColor" />
      <path d="M3 10h18V6.5A1.5 1.5 0 0 0 19.5 5H4.5A1.5 1.5 0 0 0 3 6.5V10Z" fill="currentColor" />
      <path d="M12 5v16" stroke="#1a1033" strokeWidth="1.8" opacity="0.35" />
      <path
        d="M12 5c-1.8-2.4-4.5-1.6-4.5.4C7.5 7.2 10 8 12 8c2 0 4.5-.8 4.5-2.6C16.5 3.4 13.8 2.6 12 5Z"
        fill="currentColor"
      />
    </svg>
  )
}
