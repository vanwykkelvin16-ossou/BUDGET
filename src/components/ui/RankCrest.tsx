import { RANDY_LOGO_SRC } from './Randy'

interface Props {
  crest: string
  size?: number
  className?: string
}

/** Rank crest badge — Randy logo for Coin Collector, emoji for other ranks. */
export function RankCrest({ crest, size = 24, className = '' }: Props) {
  if (crest === 'randy') {
    return (
      <img
        src={RANDY_LOGO_SRC}
        alt="Randy"
        width={size}
        height={size}
        className={['object-contain', className].filter(Boolean).join(' ')}
        draggable={false}
      />
    )
  }

  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
      {crest}
    </span>
  )
}
