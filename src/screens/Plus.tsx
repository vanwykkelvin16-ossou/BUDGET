/**
 * PennyPlay Plus — R200 for a full year, billed yearly. One screen: what
 * you get, what it costs, current status, and the pay button. Real
 * checkout via PayFast when merchant keys are configured; otherwise a
 * clearly-labelled test mode so the flow works end to end.
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  hasShared,
  myReferralCode,
  plusPriceCents,
  rewardUnlocked,
  saveRewardUnlocked,
  shareApp,
  shouldOfferReferralBeforePay,
} from '../lib/referral'
import { formatDateLong, todaySAST } from '../lib/dates'
import { formatZAR } from '../lib/money'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Randy } from '../components/ui/Randy'
import { ReferralOfferPopup } from '../components/ReferralOfferPopup'

const PERKS: string[] = [
  'Fun money that always matches your real cash',
  'Savings goals, milestones & auto-save',
  'Quests, streaks, XP & rank themes',
  'Smart nudges: pay day, overspend, streaks',
  'Month tracker, year view & net worth',
  'Every new feature for the next 12 months',
]

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
  const [offerOpen, setOfferOpen] = useState(false)
  const isFirstPayment = membership === null
  const priceCents = plusPriceCents({
    fullPriceCents: PLUS_PRICE_CENTS,
    unlocked: reward,
    isFirstPayment,
  })

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
    // Price is decided at the moment of payment: the reward may have
    // unlocked while the referral popup was open and waiting.
    const unlockedNow = rewardUnlocked()
    const result = await payForYear({
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
    if (result !== 'redirected') setMembership(result)
    setBusy(false)
  }

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

      {/* Offer / member card */}
      <div
        className="rounded-[26px] p-[2px] mb-4"
        style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
      >
        <Card className="!border-transparent text-center pt-6 pb-5 relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 w-52 h-28
                       rounded-full bg-gold/15 blur-3xl"
          />
          <div className="relative">
            <Randy mood="celebrating" size={76} className="mx-auto" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-2">
              PennyPlay Plus
            </p>
            <p className="font-display font-extrabold leading-tight mt-1">
              <span className="text-gradient-gold animate-shimmer text-5xl">
                {formatZAR(PLUS_PRICE_CENTS, { showCents: false })}
              </span>
              <span className="text-base text-ink-soft"> / year</span>
            </p>
            {reward && isFirstPayment && (
              <p className="text-xs font-extrabold text-lime mt-1">
                🎁 {formatZAR(priceCents, { showCents: false })} for your first year — friend
                reward applied
              </p>
            )}

            <div className="flex items-stretch justify-center divide-x divide-edge mt-4">
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">One</span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">payment</span>
              </div>
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">Yearly</span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">billing</span>
              </div>
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">12 months</span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">full access</span>
              </div>
            </div>

            {status === 'active' && membership && (
              <div className="mt-4 px-2 text-left">
                <p className="text-center text-[11px] font-extrabold text-lime mb-1.5">
                  ✓ Active until {formatDateLong(membership.paidUntil)}{' '}
                  {membership.paidUntil.slice(0, 4)} · {remainingDays} days left
                </p>
                <div className="relative h-2 rounded-full bg-bg-deep border border-edge/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime to-aqua"
                    style={{ width: `${Math.max(3, Math.round((remainingDays / PLUS_DAYS) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
                  <span>Your year</span>
                  <span>Renews by choice 🎉</span>
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
          </div>
        </Card>
      </div>

      {status === 'active' ? (
        // One year at a time — no stacking. Renewal appears when it lapses.
        <p className="text-center text-sm text-ink-soft font-semibold py-2">
          🎉 You're all set for the year. Renewal opens here when your year is up.
        </p>
      ) : (
        <>
          <Button3D full size="lg" variant="gold" disabled={busy} onClick={pay}>
            {status === 'expired'
              ? `Renew — ${formatZAR(priceCents, { showCents: false })} for a year`
              : `Pay ${formatZAR(priceCents, { showCents: false })} for a year`}
          </Button3D>
          <p className="text-center text-[10px] text-ink-faint font-bold mt-3 pb-6">
            {config
              ? `Secure checkout by PayFast${config.sandbox ? ' (sandbox)' : ''}. No auto-renewal — you choose when to pay again.`
              : 'Test mode: payments aren’t connected yet, so this activates a trial year on this device.'}
          </p>
        </>
      )}

      {/* Give R50, get R50 off — the gift ticket */}
      <div
        className="rounded-[24px] p-[1.5px] mt-4 mb-4"
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

      {/* What you get */}
      <Card className="mb-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-3">
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
