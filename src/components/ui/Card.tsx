import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Glow colour behind the card for hero/active elements. */
  glow?: 'lime' | 'violet' | 'aqua' | 'ember' | 'gold' | 'none'
  children: ReactNode
}

const GLOWS = {
  lime: 'shadow-glow-lime',
  violet: 'shadow-glow-violet',
  aqua: 'shadow-glow-aqua',
  ember: 'shadow-glow-ember',
  gold: 'shadow-glow-gold',
  none: '',
}

/** Chunky rounded card with the thick "game tile" bottom edge. */
export function Card({ glow = 'none', className = '', children, ...rest }: Props) {
  return (
    <div
      className={[
        'bg-card border border-edge border-b-[5px] border-b-edge-strong',
        'rounded-[24px] p-4',
        // Faint top-edge highlight sells the "moulded plastic" game-tile look.
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        GLOWS[glow],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
