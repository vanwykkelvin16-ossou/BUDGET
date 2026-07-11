import type { Rank } from '../../lib/gamification/levels'
import { rankBadgeStyle } from '../../lib/gamification/levels'
import { RankCrest } from './RankCrest'

type BadgeSize = 'sm' | 'md' | 'lg'

const BADGE_SIZES: Record<
  BadgeSize,
  { box: string; crest: number; levelText: string }
> = {
  sm: { box: 'w-12 h-12 rounded-2xl border-b-4', crest: 22, levelText: 'text-[10px]' },
  md: { box: 'w-20 h-20 rounded-[24px] border-b-8', crest: 36, levelText: 'text-xs' },
  lg: { box: 'w-24 h-24 rounded-[28px] border-b-8', crest: 56, levelText: 'text-sm' },
}

interface Props {
  rank: Rank
  level?: number
  size?: BadgeSize
  crestSize?: number
  className?: string
  title?: string
}

/** Rank-themed level badge with a consistently centered crest icon. */
export function RankLevelBadge({
  rank,
  level,
  size = 'sm',
  crestSize,
  className = '',
  title,
}: Props) {
  const preset = BADGE_SIZES[size]
  const badge = rankBadgeStyle(rank)
  const resolvedCrestSize = crestSize ?? preset.crest

  return (
    <div
      className={[
        'flex flex-col items-center justify-center shrink-0 bg-gradient-to-b',
        preset.box,
        badge.gradient,
        badge.border,
        badge.glow,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={title ?? rank.name}
    >
      <RankCrest crest={rank.crest} size={resolvedCrestSize} />
      {level != null && (
        <span
          className={`font-display font-extrabold text-white leading-tight ${preset.levelText}`}
        >
          LV{level}
        </span>
      )}
    </div>
  )
}
