/**
 * Trophy cabinet: earned badges in full colour, locked ones silhouetted.
 * Completionism fuel.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { BADGE_DEFS } from '../lib/gamification/badges'
import type { BadgeDef } from '../lib/data/types'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Sheet } from '../components/ui/Sheet'
import { Button3D } from '../components/ui/Button3D'

const TIER_STYLE: Record<BadgeDef['tier'], { ring: string; label: string }> = {
  bronze: { ring: 'border-[#b46a3c]', label: 'Bronze' },
  silver: { ring: 'border-[#9ca3af]', label: 'Silver' },
  gold: { ring: 'border-gold shadow-glow-gold', label: 'Gold' },
  legendary: { ring: 'border-gold shadow-glow-gold animate-pulse-win', label: 'Legendary' },
}

export function TrophyCabinet() {
  const userBadges = useAppStore((s) => s.data.userBadges)
  const [selected, setSelected] = useState<BadgeDef | null>(null)

  const earned = new Map(userBadges.map((b) => [b.badgeId, b.earnedAt]))

  return (
    <Screen>
      <div className="flex items-center gap-3 mb-4">
        <Link
          to="/profile"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     flex items-center justify-center font-display font-extrabold"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl flex-1">Trophy cabinet</h1>
        <span className="font-display font-extrabold text-gold">
          {earned.size}/{BADGE_DEFS.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {BADGE_DEFS.map((badge) => {
          const isEarned = earned.has(badge.id)
          return (
            <button key={badge.id} onClick={() => setSelected(badge)}>
              <Card
                className={`flex flex-col items-center py-4 px-1 ${
                  isEarned ? '' : 'opacity-70'
                }`}
              >
                <span
                  className={[
                    'w-14 h-14 rounded-full flex items-center justify-center text-3xl border-4',
                    isEarned
                      ? `bg-gradient-to-b from-card-raised to-bg-deep ${TIER_STYLE[badge.tier].ring}`
                      : 'bg-bg-deep border-edge grayscale',
                  ].join(' ')}
                >
                  <span className={isEarned ? '' : 'opacity-30 blur-[1px]'}>{badge.emoji}</span>
                </span>
                <p
                  className={`font-display font-extrabold text-[11px] mt-2 text-center leading-tight ${
                    isEarned ? '' : 'text-ink-faint'
                  }`}
                >
                  {isEarned ? badge.name : '???'}
                </p>
              </Card>
            </button>
          )
        })}
      </div>

      <Sheet open={selected !== null} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex flex-col items-center text-center gap-3 pb-2">
            <span
              className={[
                'w-24 h-24 rounded-full flex items-center justify-center text-5xl border-4',
                earned.has(selected.id)
                  ? `bg-gradient-to-b from-card-raised to-bg-deep ${TIER_STYLE[selected.tier].ring}`
                  : 'bg-bg-deep border-edge grayscale',
              ].join(' ')}
            >
              <span className={earned.has(selected.id) ? '' : 'opacity-30 blur-[2px]'}>
                {selected.emoji}
              </span>
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                {TIER_STYLE[selected.tier].label}
              </p>
              <h2 className="font-display font-extrabold text-xl">{selected.name}</h2>
              <p className="text-sm text-ink-soft mt-1">{selected.description}</p>
              {earned.has(selected.id) && (
                <p className="text-xs text-lime font-bold mt-2">
                  Earned {earned.get(selected.id)!.slice(0, 10)}
                </p>
              )}
            </div>
            <Button3D full onClick={() => setSelected(null)}>
              {earned.has(selected.id) ? 'Shiny.' : 'One day…'}
            </Button3D>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
