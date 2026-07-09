import { describe, expect, it } from 'vitest'
import type { BadgeContext } from './badges'
import { BADGE_DEFS, evaluateBadges } from './badges'

function ctx(overrides: Partial<BadgeContext['data']> = {}, extra?: Partial<BadgeContext>): BadgeContext {
  return {
    data: {
      contributions: [],
      incomes: [],
      transactions: [],
      categories: [],
      userQuests: [],
      snapshots: [],
      xpEvents: [],
      userBadges: [],
      ...overrides,
    },
    longestStreak: 0,
    xp: 0,
    ...extra,
  }
}

describe('evaluateBadges', () => {
  it('awards nothing on a fresh account', () => {
    expect(evaluateBadges(ctx())).toEqual([])
  })

  it('first save + kickstart + saved-10k stack with contribution size', () => {
    const small = evaluateBadges(
      ctx({ contributions: [{ id: 'c', goalId: 'g', amountCents: 5000, date: '', source: 'manual', createdAt: '' }] }),
    )
    expect(small).toContain('first-save')
    expect(small).not.toContain('kickstart')

    const big = evaluateBadges(
      ctx({ contributions: [{ id: 'c', goalId: 'g', amountCents: 1_000_000, date: '', source: 'manual', createdAt: '' }] }),
    )
    expect(big).toEqual(expect.arrayContaining(['first-save', 'kickstart', 'saved-10k']))
  })

  it('never re-awards owned badges', () => {
    const c = ctx({
      contributions: [{ id: 'c', goalId: 'g', amountCents: 5000, date: '', source: 'manual', createdAt: '' }],
      userBadges: [{ badgeId: 'first-save', earnedAt: '' }],
    })
    expect(evaluateBadges(c)).toEqual([])
  })

  it('streak badges use the longest streak', () => {
    expect(evaluateBadges(ctx({}, { longestStreak: 7 }))).toContain('streak-7')
    expect(evaluateBadges(ctx({}, { longestStreak: 30 }))).toEqual(
      expect.arrayContaining(['streak-7', 'streak-30']),
    )
  })

  it('side-hustle hero needs three non-salary incomes', () => {
    const incomes = [
      { id: '1', amountCents: 1, source: 'freelance' as const, date: '', createdAt: '' },
      { id: '2', amountCents: 1, source: 'dividends' as const, date: '', createdAt: '' },
      { id: '3', amountCents: 1, source: 'salary' as const, date: '', createdAt: '' },
    ]
    expect(evaluateBadges(ctx({ incomes }))).not.toContain('side-hustle')
    const more = [...incomes, { id: '4', amountCents: 1, source: 'refund' as const, date: '', createdAt: '' }]
    expect(evaluateBadges(ctx({ incomes: more }))).toContain('side-hustle')
  })

  it('level badges track XP', () => {
    expect(evaluateBadges(ctx({}, { xp: 4500 }))).toContain('money-master')
    expect(evaluateBadges(ctx({}, { xp: 19000 }))).toEqual(
      expect.arrayContaining(['money-master', 'rand-royalty']),
    )
  })

  it('every badge has a predicate', () => {
    // Guard against catalog/predicate drift.
    const maxed = ctx(
      {
        contributions: [
          { id: 'c', goalId: 'g', amountCents: 2_000_000, date: '', source: 'sweep', createdAt: '' },
        ],
        incomes: [
          { id: '1', amountCents: 1, source: 'freelance', date: '', createdAt: '' },
          { id: '2', amountCents: 1, source: 'dividends', date: '', createdAt: '' },
          { id: '3', amountCents: 1, source: 'refund', date: '', createdAt: '' },
        ],
        transactions: Array.from({ length: 5 }, (_, i) => ({
          id: `t${i}`, amountCents: 100, categoryId: 'fun', date: '', createdAt: '',
        })),
        categories: [
          { id: 'fun', name: 'Date Nights', icon: '❤️', color: '', bucket: 'want', isFunFund: true, isCustom: false, sortOrder: 0 },
        ],
        userQuests: Array.from({ length: 10 }, (_, i) => ({
          id: `q${i}`, questId: 'q', periodKey: `${i}`, completedAt: '', claimedAt: 'yes', createdAt: '',
        })),
        snapshots: [
          {
            id: 's', cycleStart: '', cycleEnd: '', incomeCents: 0,
            allocated: { need: 0, want: 0, saving: 0 },
            spentByBucket: { need: 0, want: 0, saving: 0 },
            spentByCategory: {}, savedCents: 0, sweptCents: 0, swept: false,
            bossDefeated: true, createdAt: '',
          },
        ],
        xpEvents: Array.from({ length: 5 }, (_, i) => ({
          id: `x${i}`, amount: 75, reason: 'no_spend_day' as const, refId: `${i}`, date: '', createdAt: '',
        })),
      },
      { longestStreak: 30, xp: 19000 },
    )
    expect(evaluateBadges(maxed).sort()).toEqual(BADGE_DEFS.map((b) => b.id).sort())
  })
})
