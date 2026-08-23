/**
 * The "what you actually get" block on the sign-up welcome screen.
 * Four promises, one line each — the whole pitch in a single glance.
 */

import { motion, useReducedMotion } from 'framer-motion'

type Feature = {
  icon: string
  title: string
  blurb: string
  /** Tailwind classes for the icon tile — one brand colour per promise. */
  tile: string
}

const FEATURES: Feature[] = [
  {
    icon: '💸',
    title: 'Safe-to-spend today',
    blurb: 'One honest number for the day, once bills and savings are set aside.',
    tile: 'bg-lime/15 ring-lime/35',
  },
  {
    icon: '📆',
    title: 'Payday to payday',
    blurb: 'Your month starts when the salary lands, not on the 1st.',
    tile: 'bg-violet/25 ring-violet-soft/40',
  },
  {
    icon: '🔥',
    title: 'Streaks, quests & XP',
    blurb: 'Logging what you spend earns levels, badges and bragging rights.',
    tile: 'bg-ember/15 ring-ember/40',
  },
  {
    icon: '🎯',
    title: 'Savings goals that move',
    blurb: 'Set a goal, auto-save a slice each payday, watch it climb.',
    tile: 'bg-aqua/15 ring-aqua/35',
  },
]

export function WhatPennyPlayDoes({ className = '' }: { className?: string }) {
  const still = useReducedMotion()

  return (
    <section aria-labelledby="what-pennyplay-does" className={`text-left ${className}`}>
      {/* Eyebrow with hairline rules — quiet label, loud content. */}
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-edge-strong" />
        <h2
          id="what-pennyplay-does"
          className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-faint whitespace-nowrap"
        >
          What PennyPlay does
        </h2>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-edge-strong" />
      </div>

      <ul className="flex flex-col gap-2.5">
        {FEATURES.map((feature, i) => (
          <motion.li
            key={feature.title}
            initial={still ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.09, type: 'spring', stiffness: 320, damping: 26 }}
            className="flex items-start gap-3.5 rounded-[20px] bg-card/70 border border-edge
                       border-b-[3px] border-b-edge-strong px-3.5 py-3
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            <span
              aria-hidden
              className={`grid place-items-center shrink-0 h-11 w-11 rounded-2xl text-[22px]
                          leading-none ring-1 ${feature.tile}`}
            >
              {feature.icon}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-display font-extrabold text-[15px] leading-tight text-ink">
                {feature.title}
              </p>
              <p className="text-[13px] leading-snug text-ink-soft mt-0.5">{feature.blurb}</p>
            </div>
          </motion.li>
        ))}
      </ul>

      {/* Carried over from the original pitch — the promise that earns the sign-up. */}
      <p className="text-[11px] leading-snug text-ink-faint text-center mt-3 px-2">
        Your numbers live on your phone, work offline, and never need a bank login.
      </p>
    </section>
  )
}
