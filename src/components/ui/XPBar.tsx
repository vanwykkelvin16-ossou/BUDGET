import { useMemo } from 'react'
import { useAppStore } from '../../state/appStore'
import { levelProgress } from '../../lib/gamification/levels'
import { ProgressBar } from './ProgressBar'
import { RankLevelBadge } from './RankLevelBadge'

/** Glowing XP bar with level crest — lives at the top of the dashboard. */
export function XPBar() {
  const profile = useAppStore((s) => s.data.profile)
  const progress = useMemo(() => levelProgress(profile?.xp ?? 0), [profile?.xp])
  if (!profile) return null

  return (
    <div className="flex items-center gap-3">
      <RankLevelBadge rank={progress.rank} level={progress.level} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-display font-extrabold text-sm truncate">{progress.rank.name}</span>
          <span className="text-xs text-ink-faint font-bold shrink-0 ml-2">
            {progress.intoLevel} / {progress.forNext} XP
          </span>
        </div>
        <ProgressBar
          pct={progress.pct}
          height={12}
          fillClassName="bg-gradient-to-r from-lime to-emerald shadow-glow-lime"
        />
      </div>
    </div>
  )
}
