/**
 * The last-chance referral popup. Shown the moment someone taps Pay for
 * the full R200 first year: refer a friend now and the first year drops
 * to R150, or skip and continue straight to the R200 checkout. Renewals
 * and already-unlocked rewards never see it (see
 * shouldOfferReferralBeforePay in lib/referral.ts).
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FIRST_YEAR_PRICE_CENTS,
  shareApp,
} from '../lib/referral'
import { formatZAR } from '../lib/money'
import { Button3D } from './ui/Button3D'
import { Randy } from './ui/Randy'

interface Props {
  open: boolean
  /** The user's share code (e.g. P3BXKM). */
  code: string
  /** Full yearly price in cents (R200). */
  fullPriceCents: number
  /** Dismiss without paying (backdrop / ✕). */
  onClose: () => void
  /** "Skip for now" — continue straight to the R200 checkout. */
  onSkip: () => void
  /** Fired after a successful share so the parent can update its state. */
  onShared?: () => void
}

export function ReferralOfferPopup({
  open,
  code,
  fullPriceCents,
  onClose,
  onSkip,
  onShared,
}: Props) {
  const [note, setNote] = useState<string | null>(null)

  async function share() {
    const result = await shareApp(code)
    if (result !== 'failed') onShared?.()
    setNote(
      result === 'copied'
        ? 'Link copied — paste it to a friend! Your R50 unlocks when they sign up.'
        : result === 'shared'
          ? 'Shared! Your R50 unlocks the moment your friend signs up.'
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
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mt-2">
                    Wait — save R50 first? 🎁
                  </p>
                  <h2 className="font-display font-extrabold text-xl leading-tight mt-1">
                    Refer a friend to get{' '}
                    <span className="text-lime">R50 off</span> now
                  </h2>
                  <p className="text-xs text-ink-soft font-semibold leading-snug mt-2">
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
                  </p>

                  <div
                    className="mt-3 px-3 py-2.5 rounded-2xl border-2 border-dashed border-aqua/40 bg-bg-deep
                               text-center font-display font-extrabold tracking-[0.25em] text-ink"
                  >
                    {code}
                  </div>

                  <div className="mt-4">
                    <Button3D full variant="aqua" onClick={() => void share()}>
                      Refer a friend — save R50
                    </Button3D>
                  </div>
                  {note && (
                    <p className="text-[11px] text-aqua font-bold mt-2 leading-snug">{note}</p>
                  )}
                  <div className="mt-2.5">
                    <Button3D full variant="ghost" onClick={onSkip}>
                      Skip for now — pay {formatZAR(fullPriceCents, { showCents: false })}
                    </Button3D>
                  </div>
                  <p className="text-[10px] text-ink-faint font-bold mt-2.5">
                    The R50 only unlocks once a friend signs up with your link.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
