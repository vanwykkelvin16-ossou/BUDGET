/**
 * XP rules — every good money action earns XP. Amounts are fixed here and
 * mirrored server-side (Supabase triggers + the award-xp edge function) so
 * the numbers can't be gamed from the client when a real backend is wired.
 * Every award carries a deterministic refId so replays never double-award.
 */

import type { XpEvent, XpReason } from '../data/types'

export const XP_RULES: Record<
  Exclude<XpReason, 'quest_reward' | 'boss_defeated'>,
  number
> = {
  log_expense: 10,
  under_sts_day: 50,
  savings_contribution: 100,
  no_spend_day: 75,
  sweep: 60,
  streak_bonus: 25,
}

export const BOSS_REWARD_XP = 500

export function makeXpEvent(params: {
  reason: XpReason
  refId: string
  date: string
  amount?: number
  nowISO?: string
}): XpEvent {
  const amount =
    params.amount ??
    XP_RULES[params.reason as keyof typeof XP_RULES]
  if (amount === undefined) {
    throw new Error(`XP amount required for reason ${params.reason}`)
  }
  return {
    id: `xp:${params.refId}`,
    amount,
    reason: params.reason,
    refId: params.refId,
    date: params.date,
    createdAt: params.nowISO ?? new Date().toISOString(),
  }
}

/** True when an event with this refId already exists (idempotence guard). */
export function alreadyAwarded(events: XpEvent[], refId: string): boolean {
  return events.some((e) => e.refId === refId)
}

export function totalXp(events: XpEvent[]): number {
  return events.reduce((sum, e) => sum + e.amount, 0)
}
