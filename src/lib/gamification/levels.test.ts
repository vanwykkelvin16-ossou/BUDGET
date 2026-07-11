import { describe, expect, it } from 'vitest'
import {
  levelForXp,
  levelProgress,
  rankBadgeStyle,
  rankForLevel,
  unlockedThemes,
  xpForLevel,
} from './levels'

describe('xpForLevel', () => {
  it('grows quadratically from zero', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    expect(xpForLevel(3)).toBe(300)
    expect(xpForLevel(4)).toBe(600)
    expect(xpForLevel(5)).toBe(1000)
    expect(xpForLevel(10)).toBe(4500)
    expect(xpForLevel(20)).toBe(19000)
  })
})

describe('levelForXp', () => {
  it('maps XP to levels at exact boundaries', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(299)).toBe(2)
    expect(levelForXp(300)).toBe(3)
    expect(levelForXp(1000)).toBe(5)
    expect(levelForXp(4500)).toBe(10)
  })

  it('round-trips with xpForLevel', () => {
    for (let level = 1; level <= 30; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
      expect(levelForXp(xpForLevel(level + 1) - 1)).toBe(level)
    }
  })
})

describe('ranks', () => {
  it('bands levels into ranks', () => {
    expect(rankForLevel(1).name).toBe('Budget Rookie')
    expect(rankForLevel(4).name).toBe('Budget Rookie')
    expect(rankForLevel(5).name).toBe('Coin Collector')
    expect(rankForLevel(10).name).toBe('Money Master')
    expect(rankForLevel(15).name).toBe('Wealth Wizard')
    expect(rankForLevel(20).name).toBe('Rand Royalty')
    expect(rankForLevel(99).name).toBe('Rand Royalty')
  })

  it('maps each rank to a badge style', () => {
    for (const rank of ['rookie', 'collector', 'master', 'wizard', 'royalty'] as const) {
      const style = rankBadgeStyle(rankForLevel(rank === 'rookie' ? 1 : rank === 'collector' ? 5 : rank === 'master' ? 10 : rank === 'wizard' ? 15 : 20))
      expect(style.gradient).toBeTruthy()
      expect(style.border).toBeTruthy()
      expect(style.glow).toBeTruthy()
    }
    expect(rankBadgeStyle(rankForLevel(1)).gradient).toContain('violet')
    expect(rankBadgeStyle(rankForLevel(5)).gradient).toContain('lime')
  })

  it('unlocks one theme per rank reached', () => {
    expect(unlockedThemes(1)).toEqual(['rookie'])
    expect(unlockedThemes(12)).toEqual(['rookie', 'collector', 'master'])
    expect(unlockedThemes(25)).toHaveLength(5)
  })
})

describe('levelProgress', () => {
  it('reports progress within the level', () => {
    const p = levelProgress(150) // level 2 spans 100–300
    expect(p.level).toBe(2)
    expect(p.intoLevel).toBe(50)
    expect(p.forNext).toBe(200)
    expect(p.pct).toBeCloseTo(0.25)
  })

  it('knows the next rank', () => {
    expect(levelProgress(0).nextRank?.name).toBe('Coin Collector')
    expect(levelProgress(19000).nextRank).toBeNull()
  })
})
