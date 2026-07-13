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
  daysLeft,
  loadMembership,
  membershipStatus,
  payfastCheckoutUrl,
  payfastConfig,
  PLUS_DAYS,
  PLUS_PRICE_CENTS,
  saveMembership,
  yearFrom,
  type Membership,
} from '../lib/membership'
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
        const server: Membership = {
          paidUntil: data.paid_until as string,
          paymentRef: (data.payment_ref as string) ?? 'payfast',
          amountCents: (data.amount_cents as number) ?? PLUS_PRICE_CENTS,
          activatedAt: (data.activated_at as string) ?? '',
        }
        saveMembership(server)
        setMembership(server)
      }
    })()
  }, [justPaid])

  async function pay() {
    if (busy) return
    if (config) {
      // Real checkout — PayFast confirms server-side via the ITN edge
      // function, which writes the memberships row.
      const supabase = getSupabaseClient()
      const userId = supabase ? (await supabase.auth.getUser()).data.user?.id : undefined
      window.location.href = payfastCheckoutUrl({
        config,
        origin: window.location.origin,
        email: profile?.email || undefined,
        name: profile?.displayName || undefined,
        userId,
      })
      return
    }
    // Test mode — no merchant keys configured yet.
    setBusy(true)
    const activated: Membership = {
      paidUntil: yearFrom(membership, today),
      paymentRef: 'test-mode',
      amountCents: PLUS_PRICE_CENTS,
      activatedAt: new Date().toISOString(),
    }
    saveMembership(activated)
    setMembership(activated)
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

      <Button3D full size="lg" variant="gold" disabled={busy} onClick={() => void pay()}>
        {status === 'active'
          ? `Add another year — ${formatZAR(PLUS_PRICE_CENTS, { showCents: false })}`
          : `Pay ${formatZAR(PLUS_PRICE_CENTS, { showCents: false })} for a year`}
      </Button3D>
      <p className="text-center text-[10px] text-ink-faint font-bold mt-3 pb-6">
        {config
          ? `Secure checkout by PayFast${config.sandbox ? ' (sandbox)' : ''}. No auto-renewal — you choose when to pay again.`
          : 'Test mode: payments aren’t connected yet, so this activates a trial year on this device.'}
      </p>
    </Screen>
  )
}
