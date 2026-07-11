import { RandyIcon } from './Randy'

interface Props {
  crest: string
  size?: number
  className?: string
}

/** Rank crest badge — Randy logo for Coin Collector, emoji for other ranks. */
export function RankCrest({ crest, size = 24, className = '' }: Props) {
  if (crest === 'randy') {
    return (
      <RandyIcon
        size={size}
        className={['shrink-0', className].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <span
      className={[
        'inline-flex items-center justify-center shrink-0 leading-none select-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.82) }}
      role="img"
      aria-hidden
    >
      {crest}
    </span>
  )
}
