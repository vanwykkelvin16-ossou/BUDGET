/**
 * PennyPlay Plus — R200 / year, auto-renews yearly. One screen: what you
 * get, what it costs, current status, and the subscribe button. Real
 * PayFast subscription checkout when merchant keys are configured;
 * otherwise a clearly-labelled test mode so the flow works end to end.
 */

import { useEffect, useState } from 'react'
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
import { payForYear } from '../lib/plusCheckout'
import {
  hasShared,
  myReferralCode,
  plusPriceCents,
  rewardUnlocked,
  shareApp,
  syncReferralRewards,
} from '../lib/referral'
import { hydrateMembershipFromServer } from '../lib/membershipSync'
import {
  PLUS_HEADLINE,
  PLUS_PRICE_BLURB,
  PLUS_REFERRAL_BLURB,
  PLUS_VALUE_LINE,
} from '../lib/plusOffer'
import { formatDateLong, todaySAST } from '../lib/dates'
import { formatZAR } from '../lib/money'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Randy } from '../components/ui/Randy'
import { ReferralCodeInput } from '../components/ReferralCodeInput'

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

  // Supabase mode: membership + referral rewards come from the server.
  useEffect(() => {
    void (async () => {
      const hydrated = await hydrateMembershipFromServer()
      if (hydrated) setMembership(hydrated)
      await syncReferralRewards()
      setReward(rewardUnlocked())
      setRefCode(myReferralCode())

      // After PayFast return, poll briefly until ITN writes the membership.
      if (!justPaid) return
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => window.setTimeout(r, 1500))
        const again = await hydrateMembershipFromServer()
        if (again && membershipStatus(again) === 'active') {
          setMembership(again)
          return
        }
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
    // Tab bar stays visible on /plus (see App.tsx), so keep the matching
    // bottom padding — otherwise the share + perks cards sit under the FAB.
    <Screen>
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

      {/* Randy's monthly save → free year */}
      {status !== 'active' && (
        <div
          className="relative rounded-[26px] p-[1.5px] mb-4 animate-pop-in"
          style={{ background: 'linear-gradient(135deg,#ffd700 0%,#a3e635 50%,#22d3ee 100%)' }}
        >
          <Card glow="gold" className="!border-transparent relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br
                         from-gold/10 via-transparent to-lime/10"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 w-36 h-36
                         rounded-full bg-gold/15 blur-3xl -translate-y-1/3 translate-x-1/4"
            />
            <div className="relative flex items-center gap-4">
              <Randy mood="celebrating" size={78} className="shrink-0 animate-bounce-fab" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-gold">
                  This month with Randy
                </p>
                <p className="font-display font-extrabold text-lg leading-[1.15] mt-1">
                  Let Randy save you{' '}
                  <span className="text-gradient-gold animate-shimmer">R150</span>
                </p>
                <p className="text-xs text-ink-soft font-semibold leading-snug mt-1.5">
                  That makes the app{' '}
                  <span className="text-lime font-extrabold">free for you</span> for{' '}
                  <span className="text-aqua font-extrabold">{PLUS_DAYS} days</span>.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

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
            <h2 className="font-display font-extrabold text-xl mt-1 leading-tight">
              {PLUS_HEADLINE}
            </h2>
            <p className="text-sm text-ink-soft font-semibold mt-2">{PLUS_PRICE_BLURB}</p>
            <p className="text-sm text-ink-soft font-semibold mt-1">{PLUS_REFERRAL_BLURB}</p>
            <p className="text-xs text-ink-faint font-semibold italic mt-3 max-w-[36ch] mx-auto leading-snug">
              {PLUS_VALUE_LINE}
            </p>
            <p className="font-display font-extrabold leading-tight mt-4">
              <span className="text-gradient-gold animate-shimmer text-5xl">
                {formatZAR(priceCents, { showCents: false })}
              </span>
              <span className="text-base text-ink-soft"> / year</span>
            </p>
            {reward && isFirstPayment && priceCents < PLUS_PRICE_CENTS && (
              <p className="text-xs font-extrabold text-lime mt-1">
                Was {formatZAR(PLUS_PRICE_CENTS, { showCents: false })} — R50 referral discount
                applied
              </p>
            )}

            <div className="flex items-stretch justify-center divide-x divide-edge mt-4">
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">Yearly</span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">billing</span>
              </div>
              <div className="flex-1 px-1.5 flex flex-col items-center gap-1">
                <span className="font-display font-extrabold text-[13px] text-ink leading-none">Auto</span>
                <span className="text-[9.5px] text-ink-faint font-bold leading-tight">renews</span>
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
                  <span>Auto-renews yearly</span>
                </div>
              </div>
            )}
            {status === 'expired' && (
              <p
                className="inline-block mt-4 px-3 py-1 rounded-full bg-coral/15 border border-coral/40
                           text-coral text-xs font-extrabold"
              >
                Membership lapsed — resubscribe to restore full access
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
        <p className="text-center text-sm text-ink-soft font-semibold py-2">
          You&apos;re all set. Your subscription auto-renews yearly
          {membership ? ` around ${formatDateLong(membership.paidUntil)}` : ''}.
        </p>
      ) : (
        <>
          <Card className="mb-4">
            <ReferralCodeInput
              disabled={busy || (reward && isFirstPayment)}
              onApplied={() => setReward(true)}
            />
          </Card>
          <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void pay()}>
            {status === 'expired'
              ? `Resubscribe — ${formatZAR(priceCents, { showCents: false })}/year`
              : `Subscribe — ${formatZAR(priceCents, { showCents: false })}/year`}
          </Button3D>
          <p className="text-center text-[10px] text-ink-faint font-bold mt-3 pb-6">
            {config
              ? `Secure checkout by PayFast${config.sandbox ? ' (sandbox)' : ''}. Yearly · auto-renews · cancel anytime.`
              : 'Test mode: payments aren’t connected yet, so this activates a trial year on this device.'}{' '}
            <Link to="/terms" className="underline">
              Terms
            </Link>
            {' · '}
            <Link to="/privacy" className="underline">
              Privacy
            </Link>
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
                {PLUS_REFERRAL_BLURB}
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
      <Card className="mb-4">
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

    </Screen>
  )
}
