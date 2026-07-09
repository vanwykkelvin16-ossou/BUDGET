/**
 * Quests. Weekly quests run Monday–Sunday; the monthly "boss battle" runs
 * over the budget cycle. Progress is always *computed* from the underlying
 * data (transactions, contributions) rather than incremented — so it can't
 * drift, and replaying history is safe. UserQuest rows only record claims.
 */

import { addDays, weekBounds } from '../dates'
import type { Cycle } from '../engine/cycle'
import { inCycle } from '../engine/cycle'
import type {
  Category,
  GoalContribution,
  QuestDef,
  Transaction,
} from '../data/types'
import { BOSS_REWARD_XP } from './xp'

/** Stable id of the seeded Eating Out category (see data/defaults.ts). */
export const EATING_OUT_ID = 'cat-eating-out'

export const QUEST_DEFS: QuestDef[] = [
  {
    id: 'q-log-week',
    title: 'Log every expense for 7 days',
    description: 'Open the app and log something every day this week.',
    icon: '📝',
    kind: 'weekly',
    metric: 'log_days',
    target: 7,
    rewardXp: 150,
  },
  {
    id: 'q-eating-out',
    title: 'Keep Eating Out under R500',
    description: 'Finish the week with less than R500 spent on Eating Out.',
    icon: '🍔',
    kind: 'weekly',
    metric: 'category_under',
    target: 50_000,
    categoryId: EATING_OUT_ID,
    rewardXp: 120,
  },
  {
    id: 'q-no-spend-weekend',
    title: 'No-spend weekend',
    description: 'Get through Saturday and Sunday without spending a cent.',
    icon: '🥷',
    kind: 'weekly',
    metric: 'no_spend_weekend',
    target: 2,
    rewardXp: 100,
  },
  {
    id: 'q-goal-500',
    title: 'Add R500 to a goal',
    description: 'Contribute at least R500 to any savings goal this week.',
    icon: '🎯',
    kind: 'weekly',
    metric: 'goal_contribution',
    target: 50_000,
    rewardXp: 130,
  },
  {
    id: 'q-boss',
    title: 'Beat the Budget',
    description:
      'End the cycle with your savings target hit. Defeat the boss, claim the glory.',
    icon: '🐲',
    kind: 'boss',
    metric: 'beat_budget',
    target: 100, // percent of the savings allocation
    rewardXp: BOSS_REWARD_XP,
  },
]

export interface QuestContext {
  todayISO: string
  /** The week the quest belongs to (Mon–Sun, inclusive). */
  weekStart: string
  weekEnd: string
  cycle: Cycle
  transactions: Transaction[]
  contributions: GoalContribution[]
  categories: Category[]
  /** Days (ISO) with any logging activity. */
  loggedDates: Set<string>
  /** Savings bucket allocation for the cycle (boss target). */
  savingAllocatedCents: number
  /** Contributions + sweep so far this cycle. */
  savedThisCycleCents: number
}

export interface QuestProgress {
  def: QuestDef
  /** Current progress in the metric's unit. */
  progress: number
  target: number
  /** 0–1 for progress bars. */
  pct: number
  completed: boolean
  /** Human progress line, e.g. "R320 of R500 used". */
  detail: string
}

function inRange(date: string, start: string, endInclusive: string): boolean {
  return date >= start && date <= endInclusive
}

/** You can't win a week you didn't play: passive quests need activity. */
function playedWeek(ctx: QuestContext): boolean {
  for (let i = 0; i < 7; i++) {
    if (ctx.loggedDates.has(addDays(ctx.weekStart, i))) return true
  }
  return false
}

export function computeQuestProgress(
  def: QuestDef,
  ctx: QuestContext,
): QuestProgress {
  switch (def.metric) {
    case 'log_days': {
      let count = 0
      for (let i = 0; i < 7; i++) {
        const day = addDays(ctx.weekStart, i)
        if (day > ctx.todayISO) break
        if (ctx.loggedDates.has(day)) count += 1
      }
      return {
        def,
        progress: count,
        target: def.target,
        pct: count / def.target,
        completed: count >= def.target,
        detail: `${count} of ${def.target} days logged`,
      }
    }

    case 'category_under': {
      const spent = ctx.transactions
        .filter(
          (t) =>
            t.categoryId === def.categoryId &&
            inRange(t.date, ctx.weekStart, ctx.weekEnd),
        )
        .reduce((sum, t) => sum + t.amountCents, 0)
      const weekOver = ctx.todayISO > ctx.weekEnd
      const busted = spent > def.target
      return {
        def,
        progress: spent,
        target: def.target,
        pct: Math.min(1, spent / def.target),
        completed: weekOver && !busted && playedWeek(ctx),
        detail: busted
          ? 'Budget busted — next week!'
          : `R${Math.round(spent / 100)} of R${Math.round(def.target / 100)} used`,
      }
    }

    case 'no_spend_weekend': {
      const saturday = addDays(ctx.weekStart, 5)
      const sunday = addDays(ctx.weekStart, 6)
      const spentDays = new Set(
        ctx.transactions
          .filter((t) => t.date === saturday || t.date === sunday)
          .map((t) => t.date),
      )
      const passedClean = [saturday, sunday].filter(
        (d) => d < ctx.todayISO && !spentDays.has(d),
      ).length
      const busted = spentDays.size > 0
      const weekendOver = ctx.todayISO > sunday
      return {
        def,
        progress: passedClean,
        target: def.target,
        pct: busted ? 0 : passedClean / def.target,
        completed: weekendOver && !busted && playedWeek(ctx),
        detail: busted
          ? 'Weekend spending snuck in'
          : `${passedClean} of 2 days clean`,
      }
    }

    case 'goal_contribution': {
      const total = ctx.contributions
        .filter((c) => inRange(c.date, ctx.weekStart, ctx.weekEnd))
        .reduce((sum, c) => sum + c.amountCents, 0)
      return {
        def,
        progress: total,
        target: def.target,
        pct: Math.min(1, total / def.target),
        completed: total >= def.target,
        detail: `R${Math.round(total / 100)} of R${Math.round(def.target / 100)} added`,
      }
    }

    case 'beat_budget': {
      const target = ctx.savingAllocatedCents
      const saved = ctx.savedThisCycleCents
      const pct = target > 0 ? Math.min(1, saved / target) : 0
      return {
        def,
        progress: Math.round(pct * 100),
        target: 100,
        pct,
        completed: target > 0 && saved >= target,
        detail:
          target > 0
            ? `R${Math.round(saved / 100)} of R${Math.round(target / 100)} saved`
            : 'Set up income to awaken the boss',
      }
    }
  }
}

/** Period key a quest instance lives under. */
export function questPeriodKey(def: QuestDef, ctx: { weekKey: string; cycle: Cycle }): string {
  return def.kind === 'boss' ? ctx.cycle.start : ctx.weekKey
}

/** Deterministic refId for the claim XP event. */
export function questClaimRef(questId: string, periodKey: string): string {
  return `quest:${questId}:${periodKey}`
}

/** Build the quest context for a given day. */
export function buildQuestContext(params: {
  todayISO: string
  cycle: Cycle
  transactions: Transaction[]
  contributions: GoalContribution[]
  categories: Category[]
  loggedDates: Set<string>
  savingAllocatedCents: number
  sweptCents?: number
}): QuestContext {
  const { start, end } = weekBounds(params.todayISO)
  const savedThisCycle =
    params.contributions
      .filter((c) => inCycle(c.date, params.cycle))
      .reduce((sum, c) => sum + c.amountCents, 0) + (params.sweptCents ?? 0)
  return {
    todayISO: params.todayISO,
    weekStart: start,
    weekEnd: end,
    cycle: params.cycle,
    transactions: params.transactions,
    contributions: params.contributions,
    categories: params.categories,
    loggedDates: params.loggedDates,
    savingAllocatedCents: params.savingAllocatedCents,
    savedThisCycleCents: savedThisCycle,
  }
}
