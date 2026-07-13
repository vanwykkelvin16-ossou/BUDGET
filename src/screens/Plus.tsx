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

const PERKS: [string, string][] = [
  ['🪙', 'Fun money for today — always true to your real cash'],
  ['🏆', 'Savings goals with milestones and auto-save'],
  ['🎯', 'Quests, streaks, XP and rank themes'],
  ['🔔', 'Pay-day, overspend and streak nudges'],
  ['📆', 'Month tracker, year view and net worth'],
  ['✨', 'Every new feature we ship this year'],
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

      {/* Offer card */}
      <div
        className="rounded-[26px] p-[2px] mb-4"
        style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
      >
        <Card className="!border-transparent text-center py-6">
          <Randy mood="celebrating" size={84} className="mx-auto" />
          <p className="font-display font-extrabold text-4xl mt-2">
            <span className="text-gradient-win">{formatZAR(PLUS_PRICE_CENTS, { showCents: false })}</span>
            <span className="text-lg text-ink-soft"> / year</span>
          </p>
          <p className="text-xs text-ink-faint font-bold mt-1">
            One payment · billed yearly · full access for 12 months
          </p>

          {status === 'active' && membership && (
            <p
              className="inline-block mt-3 px-3 py-1 rounded-full bg-lime/15 border border-lime/40
                         text-lime text-xs font-extrabold"
            >
              ✓ Active until {formatDateLong(membership.paidUntil)} ·{' '}
              {daysLeft(membership, today)} days left
            </p>
          )}
          {status === 'expired' && (
            <p
              className="inline-block mt-3 px-3 py-1 rounded-full bg-coral/15 border border-coral/40
                         text-coral text-xs font-extrabold"
            >
              Your year is up — renew to keep full access
            </p>
          )}
          {justPaid && status !== 'active' && (
            <p className="text-xs text-aqua font-bold mt-3">
              Payment received — your year activates as soon as PayFast confirms it. Pull down to
              refresh in a minute.
            </p>
          )}
          {cancelled && (
            <p className="text-xs text-ink-faint font-bold mt-3">Payment cancelled — no charge.</p>
          )}
        </Card>
      </div>

      {/* What you get */}
      <Card className="mb-4">
        <p className="text-xs font-extrabold uppercase tracking-widest text-ink-faint mb-3">
          A full year of everything
        </p>
        <div className="flex flex-col gap-2.5">
          {PERKS.map(([icon, text]) => (
            <div key={text} className="flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5">{icon}</span>
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
