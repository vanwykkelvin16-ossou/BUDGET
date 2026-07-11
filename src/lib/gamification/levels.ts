/**
 * Levels & ranks. XP thresholds grow quadratically; ranks band the levels
 * and each rank unlocks a new accent theme for the app.
 */

export interface Rank {
  id: string
  name: string
  crest: string
  /** First level of this rank. */
  minLevel: number
  /** Theme id unlocked when the rank is reached (html[data-theme]). */
  themeId: string
}

export const RANKS: Rank[] = [
  { id: 'rookie', name: 'Budget Rookie', crest: '🌱', minLevel: 1, themeId: 'rookie' },
  { id: 'collector', name: 'Coin Collector', crest: 'randy', minLevel: 5, themeId: 'collector' },
  { id: 'master', name: 'Money Master', crest: '💎', minLevel: 10, themeId: 'master' },
  { id: 'wizard', name: 'Wealth Wizard', crest: '🧙', minLevel: 15, themeId: 'wizard' },
  { id: 'royalty', name: 'Rand Royalty', crest: '👑', minLevel: 20, themeId: 'royalty' },
]

export interface RankBadgeStyle {
  gradient: string
  border: string
  glow: string
}

const RANK_BADGE_STYLES: Record<string, RankBadgeStyle> = {
  rookie: {
    gradient: 'from-violet-soft to-violet',
    border: 'border-violet-deep',
    glow: 'shadow-glow-violet',
  },
  collector: {
    gradient: 'from-lime to-lime-deep',
    border: 'border-[#3f6212]',
    glow: 'shadow-glow-lime',
  },
  master: {
    gradient: 'from-coral to-coral-deep',
    border: 'border-coral-deep',
    glow: 'shadow-glow-ember',
  },
  wizard: {
    gradient: 'from-aqua to-aqua-deep',
    border: 'border-aqua-deep',
    glow: 'shadow-glow-aqua',
  },
  royalty: {
    gradient: 'from-sun to-gold',
    border: 'border-[#c2410c]',
    glow: 'shadow-glow-gold',
  },
}

export function rankBadgeStyle(rank: Rank): RankBadgeStyle {
  return RANK_BADGE_STYLES[rank.themeId] ?? RANK_BADGE_STYLES.rookie
}

/** Cumulative XP required to *reach* level n (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  // 100, 300, 600, 1000, 1500… — friendly early levels, real grind later.
  const n = level - 1
  return 50 * n * (n + 1)
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level += 1
  return level
}

export function rankForLevel(level: number): Rank {
  let rank = RANKS[0]
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r
  }
  return rank
}

export interface LevelProgress {
  level: number
  rank: Rank
  nextRank: Rank | null
  /** XP into the current level. */
  intoLevel: number
  /** XP needed to go from this level to the next. */
  forNext: number
  /** 0–1 progress toward the next level. */
  pct: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp)
  const rank = rankForLevel(level)
  const rankIndex = RANKS.indexOf(rank)
  const nextRank = RANKS[rankIndex + 1] ?? null
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const forNext = next - base
  const intoLevel = xp - base
  return {
    level,
    rank,
    nextRank,
    intoLevel,
    forNext,
    pct: Math.min(1, intoLevel / forNext),
  }
}

/** Theme ids unlocked at a given level (a theme unlocks with its rank). */
export function unlockedThemes(level: number): string[] {
  return RANKS.filter((r) => level >= r.minLevel).map((r) => r.themeId)
}
