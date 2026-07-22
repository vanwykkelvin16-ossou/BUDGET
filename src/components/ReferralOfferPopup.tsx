/**
 * The last-chance referral popup. Shown the moment someone taps Pay for
 * the full R200 first year. Two ways forward:
 *
 *  - Refer a friend → share the link, then WAIT: the R50 only unlocks
 *    once the friend actually signs up. The popup keeps checking, and
 *    the moment the sign-up lands it flips to a "Pay R150" button.
 *  - Skip for now → straight to the full R200 checkout.
 *
 * Renewals and already-unlocked rewards never see it (see
 * shouldOfferReferralBeforePay in lib/referral.ts).
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FIRST_YEAR_PRICE_CENTS,
  hasShared,
  refreshRewardUnlocked,
  shareApp,
} from '../lib/referral'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'

const CHECK_EVERY_MS = 4_000

interface Props {
  open: boolean
  /** The user's share code (e.g. P3BXKM). */
  code: string
  /** Full yearly price in cents (R200). */
  fullPriceCents: number
  /** Dismiss without paying (backdrop / ✕). */
  onClose: () => void
  /** Continue to checkout — parent charges the CURRENT price (R200
   *  skipped, R150 once the reward has unlocked). */
  onProceed: () => void
  /** Fired the moment a friend's sign-up unlocks the R50. */
  onUnlocked?: () => void
  /** Fired after a successful share so the parent can update its state. */
  onShared?: () => void
}

export function ReferralOfferPopup({
  open,
  code,
  fullPriceCents,
  onClose,
  onProceed,
  onUnlocked,
  onShared,
}: Props) {
  // waiting = link shared, friend hasn't signed up yet.
  const [waiting, setWaiting] = useState(hasShared)
  const [unlocked, setUnlocked] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // While the popup is open, keep checking whether the friend signed up.
  useEffect(() => {
    if (!open || unlocked) return
    let cancelled = false
    const check = async () => {
      const ok = await refreshRewardUnlocked()
      if (!cancelled && ok) {
        setUnlocked(true)
        onUnlocked?.()
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unlocked])

  async function share() {
    const result = await shareApp(code)
    if (result !== 'failed') {
      setWaiting(true)
      onShared?.()
    }
    setNote(
      result === 'copied'
        ? 'Link copied — paste it to a friend!'
        : result === 'shared'
          ? 'Link sent!'
          : 'Sharing is blocked here — send your code above to a friend instead.',
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/70 z-[90]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Refer a friend and save R50"
            className="fixed inset-x-0 top-1/2 z-[95] mx-auto w-[calc(100%-2.5rem)] max-w-sm"
            initial={{ opacity: 0, y: '-42%', scale: 0.92 }}
            animate={{ opacity: 1, y: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: '-42%', scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div
              className="rounded-[28px] p-[2px]"
              style={{ background: 'linear-gradient(120deg,#22d3ee,#7c3aed,#a3e635)' }}
            >
              <div className="rounded-[26px] bg-card p-5 text-center relative overflow-hidden">
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 w-48 h-24
                             rounded-full bg-aqua/15 blur-3xl"
                />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute right-3 top-3 z-10 w-8 h-8 rounded-full bg-bg-deep border border-edge
                             text-ink-faint font-extrabold flex items-center justify-center"
                >
                  ✕
                </button>

                <div className="relative">
                  <Randy mood="celebrating" size={64} className="mx-auto" />

                  {unlocked ? (
                    <>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-lime mt-2">
                        R50 unlocked 🎉
                      </p>
                      <h2 className="font-display font-extrabold text-xl leading-tight mt-1">
                        Your friend signed up!
                      </h2>
                      <p className="text-xs text-ink-soft font-semibold leading-snug mt-2">
                        The R50 is yours — your first year is now{' '}
                        <b className="text-lime">
                          {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })}
                        </b>{' '}
                        instead of {formatZAR(fullPriceCents, { showCents: false })}.
                      </p>
                      <div className="mt-4">
                        <Button3D full variant="lime" onClick={onProceed}>
                          Pay {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })} — R50
                          applied
                        </Button3D>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-2">
                        {waiting ? 'Almost there… 🎁' : 'Wait — save R50 first? 🎁'}
                      </p>
                      <h2 className="font-display font-extrabold text-xl leading-tight mt-1">
                        {waiting ? (
                          <>Waiting for your friend to sign up</>
                        ) : (
                          <>
                            Refer a friend to get <span className="text-lime">R50 off</span> now
                          </>
                        )}
                      </h2>
                      <p className="text-xs text-ink-soft font-semibold leading-snug mt-2">
                        {waiting ? (
                          <>
                            The moment your friend <b className="text-ink">signs up</b> with your
                            link, this unlocks and your first year drops to{' '}
                            <b className="text-lime">
                              {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })}
                            </b>
                            . We're checking automatically.
                          </>
                        ) : (
                          <>
                            Send your link before you pay. The moment your friend{' '}
                            <b className="text-ink">signs up</b>, your first year drops from{' '}
                            <b className="text-ink">
                              {formatZAR(fullPriceCents, { showCents: false })}
                            </b>{' '}
                            to{' '}
                            <b className="text-lime">
                              {formatZAR(FIRST_YEAR_PRICE_CENTS, { showCents: false })}
                            </b>
                            .
                          </>
                        )}
                      </p>

                      <div
                        className="mt-3 px-3 py-2.5 rounded-2xl border-2 border-dashed border-aqua/40 bg-bg-deep
                                   text-center font-display font-extrabold tracking-[0.25em] text-ink"
                      >
                        {code}
                      </div>

                      {waiting && (
                        <p
                          className="mt-3 text-[11px] font-extrabold text-aqua animate-pulse"
                          role="status"
                        >
                          ⏳ Watching for your friend's sign-up…
                        </p>
                      )}

                      <div className="mt-4">
                        <Button3D full variant="aqua" onClick={() => void share()}>
                          {waiting ? 'Share my link again' : 'Refer a friend — save R50'}
                        </Button3D>
                      </div>
                      {note && (
                        <p className="text-[11px] text-aqua font-bold mt-2 leading-snug">{note}</p>
                      )}
                      <div className="mt-2.5">
                        <Button3D full variant="ghost" onClick={onProceed}>
                          Skip for now — pay {formatZAR(fullPriceCents, { showCents: false })}
                        </Button3D>
                      </div>
                      <p className="text-[10px] text-ink-faint font-bold mt-2.5">
                        The R50 only unlocks once a friend signs up with your link.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
