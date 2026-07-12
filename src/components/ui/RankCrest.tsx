import { RANDY_LOGO_SRC } from './Randy'

interface Props {
  crest: string
  size?: number
  className?: string
}

/**
 * Rank crest badge — Randy logo for Coin Collector, emoji for other ranks.
 * Always occupies an exact size×size box with the glyph dead-centre, so
 * crests sit identically in every block (XP bar, level-up card, themes).
 */
export function RankCrest({ crest, size = 24, className = '' }: Props) {
  if (crest === 'randy') {
    return (
      <span
        className={['inline-flex items-center justify-center shrink-0', className]
          .filter(Boolean)
          .join(' ')}
        style={{ width: size, height: size }}
      >
        <img
          src={RANDY_LOGO_SRC}
          alt="Randy"
          width={size}
          height={size}
          className="block w-full h-full object-contain"
          draggable={false}
        />
      </span>
    )
  }

  return (
    <span
      className={['inline-flex items-center justify-center shrink-0 select-none', className]
        .filter(Boolean)
        .join(' ')}
      // Emoji glyphs often overflow their em box; 86% keeps them unclipped.
      style={{ width: size, height: size, fontSize: Math.round(size * 0.86), lineHeight: 1 }}
    >
      {crest}
    </span>
  )
}
