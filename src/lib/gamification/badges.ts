/**
 * Badges — the trophy cabinet. Unlock predicates run over the full data set
 * so badges can be re-derived at any time; earned badges are persisted and
 * never revoked.
 */

import type {
  AppData,
  BadgeDef,
  Category,
  XpEvent,
} from '../data/types'
import { levelForXp } from './levels'

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'first-save', name: 'First Save', description: 'Make your first goal contribution.', emoji: '💰', tier: 'bronze' },
  { id: 'kickstart', name: 'Kickstart', description: 'Save your first R1 000.', emoji: '🌟', tier: 'bronze' },
  { id: 'sweeper', name: 'Sweep Machine', description: 'Sweep leftover Wants into Savings.', emoji: '🧹', tier: 'bronze' },
  { id: 'streak-7', name: '7-Day Streak', description: 'Log something 7 days in a row.', emoji: '🔥', tier: 'bronze' },
  { id: 'streak-30', name: 'Monthly Flame', description: 'Keep a 30-day logging streak alive.', emoji: '⚡', tier: 'gold' },
  { id: 'saved-10k', name: 'R10k Saved', description: 'Stack R10 000 into your goals.', emoji: '🏆', tier: 'gold' },
  { id: 'date-night', name: 'Date Night Champion', description: 'Log five date nights. Romance, budgeted.', emoji: '❤️', tier: 'silver' },
  { id: 'no-spend-ninja', name: 'No-Spend Ninja', description: 'Complete five no-spend days.', emoji: '🥷', tier: 'silver' },
  { id: 'side-hustle', name: 'Side-Hustle Hero', description: 'Log three extra income payments.', emoji: '💼', tier: 'silver' },
  { id: 'boss-slayer', name: 'Boss Slayer', description: 'Beat the Budget — hit a cycle savings target.', emoji: '🐲', tier: 'gold' },
  { id: 'quest-addict', name: 'Quest Addict', description: 'Claim ten quest rewards.', emoji: '🎯', tier: 'silver' },
  { id: 'money-master', name: 'Money Master', description: 'Reach level 10.', emoji: '💎', tier: 'gold' },
  { id: 'rand-royalty', name: 'Rand Royalty', description: 'Reach level 20. Bow before the crown.', emoji: '👑', tier: 'legendary' },
]

export interface BadgeContext {
  data: Pick<
    AppData,
    | 'contributions'
    | 'incomes'
    | 'transactions'
    | 'categories'
    | 'userQuests'
    | 'snapshots'
    | 'xpEvents'
    | 'userBadges'
  >
  longestStreak: number
  xp: number
}

function lifetimeSaved(ctx: BadgeContext): number {
  return ctx.data.contributions.reduce((sum, c) => sum + c.amountCents, 0)
}

function dateNightCount(ctx: BadgeContext): number {
  const dateNightIds = new Set(
    ctx.data.categories
      .filter((c: Category) => c.isFunFund)
      .map((c) => c.id),
  )
  return ctx.data.transactions.filter((t) => dateNightIds.has(t.categoryId)).length
}

function noSpendDays(ctx: BadgeContext): number {
  return ctx.data.xpEvents.filter((e: XpEvent) => e.reason === 'no_spend_day').length
}

const PREDICATES: Record<string, (ctx: BadgeContext) => boolean> = {
  'first-save': (ctx) => ctx.data.contributions.length > 0,
  kickstart: (ctx) => lifetimeSaved(ctx) >= 100_000,
  sweeper: (ctx) => ctx.data.contributions.some((c) => c.source === 'sweep'),
  'streak-7': (ctx) => ctx.longestStreak >= 7,
  'streak-30': (ctx) => ctx.longestStreak >= 30,
  'saved-10k': (ctx) => lifetimeSaved(ctx) >= 1_000_000,
  'date-night': (ctx) => dateNightCount(ctx) >= 5,
  'no-spend-ninja': (ctx) => noSpendDays(ctx) >= 5,
  'side-hustle': (ctx) =>
    ctx.data.incomes.filter((i) => i.source !== 'salary').length >= 3,
  'boss-slayer': (ctx) =>
    ctx.data.snapshots.some((s) => s.bossDefeated) ||
    ctx.data.xpEvents.some((e) => e.reason === 'boss_defeated'),
  'quest-addict': (ctx) =>
    ctx.data.userQuests.filter((q) => q.claimedAt !== null).length >= 10,
  'money-master': (ctx) => levelForXp(ctx.xp) >= 10,
  'rand-royalty': (ctx) => levelForXp(ctx.xp) >= 20,
}

/** Badge ids newly earned (satisfied predicates not yet persisted). */
export function evaluateBadges(ctx: BadgeContext): string[] {
  const owned = new Set(ctx.data.userBadges.map((b) => b.badgeId))
  return BADGE_DEFS.filter(
    (def) => !owned.has(def.id) && PREDICATES[def.id]?.(ctx),
  ).map((def) => def.id)
}
