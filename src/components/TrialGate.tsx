/**
 * The guest preview clock. First-time visitors play inside the app free
 * for 45 seconds — this pill counts it down (only while the app is on
 * screen) and, at zero, hands over to the sign-up screen.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { consumeTrial, trialSecondsLeft, trialTotalSeconds } from '../lib/trial'

export function TrialGate() {
  const endGuestTrial = useAppStore((s) => s.endGuestTrial)
  const [left, setLeft] = useState(trialSecondsLeft)
  const total = trialTotalSeconds()

  useEffect(() => {
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      // Cap the step so a background tab can't burn the whole preview.
      const delta = Math.min(now - last, 2000)
      last = now
      if (document.visibilityState !== 'visible') return
      const remaining = consumeTrial(delta)
      setLeft(remaining)
      if (remaining <= 0) {
        window.clearInterval(id)
        endGuestTrial()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [endGuestTrial])

  const seconds = Math.ceil(left)
  const fraction = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  const urgent = seconds <= 10

  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="fixed left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,26rem)]"
      style={{ top: 'max(10px, env(safe-area-inset-top))' }}
    >
      <div
        className="rounded-[20px] p-[1.5px] shadow-lg"
        style={{ background: 'linear-gradient(120deg,#7c3aed,#22d3ee,#a3e635)' }}
      >
        <div className="rounded-[19px] bg-card px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <span
              className={`font-display font-extrabold text-lg tabular-nums w-11 text-center rounded-xl py-0.5
                          ${urgent ? 'bg-coral/15 text-coral' : 'bg-aqua/15 text-aqua'}`}
              aria-live="polite"
            >
              {seconds}s
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-faint leading-tight">
                Free preview
              </p>
              <p className="text-xs font-bold text-ink-soft leading-tight truncate">
                Play around — sign-up comes after
              </p>
            </div>
            <button
              onClick={endGuestTrial}
              className="shrink-0 px-3 py-1.5 rounded-xl font-display font-extrabold text-xs text-white
                         bg-gradient-to-b from-violet-soft to-violet border-b-2 border-violet-deep
                         active:translate-y-[1px] active:border-b-0"
            >
              Sign up
            </button>
          </div>
          <div className="relative h-1.5 mt-2 rounded-full bg-bg-deep overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300
                          ${urgent ? 'bg-gradient-to-r from-coral to-gold' : 'bg-gradient-to-r from-violet to-aqua'}`}
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
