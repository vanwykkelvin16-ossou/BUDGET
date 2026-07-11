import { useMemo } from 'react'
import { useAppStore } from '../../state/appStore'
import { levelProgress } from '../../lib/gamification/levels'
import { ProgressBar } from './ProgressBar'
import { RankCrest } from './RankCrest'

/** Glowing XP bar with level crest — lives at the top of the dashboard. */
export function XPBar() {
  const profile = useAppStore((s) => s.data.profile)
  const progress = useMemo(() => levelProgress(profile?.xp ?? 0), [profile?.xp])
  if (!profile) return null

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl shrink-0
                   bg-gradient-to-b from-violet-soft to-violet border-b-4 border-violet-deep
                   shadow-glow-violet"
        title={progress.rank.name}
      >
        <RankCrest crest={progress.rank.crest} size={22} />
        <span className="font-display font-extrabold text-[10px] text-white leading-tight">
          LV{progress.level}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-display font-extrabold text-sm truncate">{progress.rank.name}</span>
          <span className="text-xs text-ink-faint font-bold shrink-0 ml-2">
            {progress.intoLevel} / {progress.forNext} points
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
