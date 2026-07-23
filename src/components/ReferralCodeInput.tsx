/**
 * Enter a friend's referral code for R50 off the first Plus year.
 */

import { useState } from 'react'
import { applyReferralDiscountCode, referredBy, rewardUnlocked } from '../lib/referral'
import { Button3D } from './ui/Button3D'

interface Props {
  disabled?: boolean
  /** Called after a code successfully unlocks the discount. */
  onApplied?: (code: string) => void
  className?: string
}

export function ReferralCodeInput({ disabled, onApplied, className = '' }: Props) {
  const [value, setValue] = useState(referredBy() ?? '')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(
    rewardUnlocked() && referredBy()
      ? `Code ${referredBy()} applied — R50 off your first year`
      : null,
  )
  const [ok, setOk] = useState(rewardUnlocked() && Boolean(referredBy()))

  async function apply() {
    if (busy || disabled) return
    setBusy(true)
    setNote(null)
    const result = await applyReferralDiscountCode(value)
    setBusy(false)
    if (!result.ok) {
      setOk(false)
      setNote(result.error)
      return
    }
    setOk(true)
    setValue(result.code)
    setNote(`Code ${result.code} applied — R50 off your first year`)
    onApplied?.(result.code)
  }

  return (
    <div className={className}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-faint mb-2">
        Referral discount code
      </p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Enter code"
          aria-label="Referral discount code"
          disabled={disabled || ok}
          maxLength={12}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-display font-extrabold tracking-[0.18em] text-sm text-center
                     placeholder:tracking-normal placeholder:font-semibold placeholder:text-ink-faint
                     focus:border-aqua disabled:opacity-70"
        />
        <Button3D
          variant="aqua"
          disabled={busy || disabled || ok || value.trim().length < 4}
          onClick={() => void apply()}
        >
          {ok ? 'Applied' : 'Apply'}
        </Button3D>
      </div>
      {note && (
        <p className={`text-[11px] font-bold mt-2 ${ok ? 'text-lime' : 'text-coral'}`}>{note}</p>
      )}
      {!ok && !note && (
        <p className="text-[11px] text-ink-faint font-bold mt-2">
          Have a friend&apos;s code? Apply it for R50 off your first year.
        </p>
      )}
    </div>
  )
}
