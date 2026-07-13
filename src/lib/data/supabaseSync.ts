/**
 * Supabase gamification sync — mirrors client XP events to the server and
 * reloads authoritative xp_events / profile totals after each persist.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, XpEvent, XpReason } from './types'
import { totalXp } from '../gamification/xp'

/** XP reasons the client may award locally that need a server mirror. */
const CLIENT_SERVER_REASONS = new Set<XpReason>([
  'under_sts_day',
  'no_spend_day',
  'sweep',
  'streak_bonus',
  'quest_reward',
  'boss_defeated',
])

type AwardBody =
  | { action: 'no-spend'; date: string }
  | { action: 'day-close'; date: string }
  | { action: 'claim-quest'; questId: string; periodKey: string }
  | { action: 'award'; amount: number; reason: string; refId: string; date: string }

async function invokeAward(client: SupabaseClient, body: AwardBody): Promise<void> {
  const { error } = await client.functions.invoke('award-xp', { body })
  if (error) throw error
}

function serverBodyForEvent(event: XpEvent): AwardBody | null {
  switch (event.reason) {
    case 'under_sts_day':
      return { action: 'day-close', date: event.date }
    case 'no_spend_day':
      return { action: 'no-spend', date: event.date }
    case 'sweep':
    case 'streak_bonus':
      return {
        action: 'award',
        amount: event.amount,
        reason: event.reason,
        refId: event.refId,
        date: event.date,
      }
    case 'quest_reward':
    case 'boss_defeated': {
      const [, questId, ...rest] = event.refId.split(':')
      const periodKey = rest.join(':')
      if (!questId || !periodKey) return null
      return { action: 'claim-quest', questId, periodKey }
    }
    default:
      return null
  }
}

/** Push client-only XP awards that are not yet on the server (idempotent). */
export async function syncPendingXpEvents(
  client: SupabaseClient,
  userId: string,
  localEvents: XpEvent[],
): Promise<void> {
  const { data: serverRows, error } = await client
    .from('xp_events')
    .select('ref_id')
    .eq('user_id', userId)
  if (error) throw error

  const serverRefs = new Set((serverRows ?? []).map((r) => r.ref_id as string))
  for (const event of localEvents) {
    if (!CLIENT_SERVER_REASONS.has(event.reason)) continue
    if (serverRefs.has(event.refId)) continue
    const body = serverBodyForEvent(event)
    if (!body) continue
    try {
      await invokeAward(client, body)
      serverRefs.add(event.refId)
    } catch {
      // Offline or transient — next persist will retry.
    }
  }
}

/** Reload gamification tables and merge into the working copy. */
export async function refreshGamification(
  client: SupabaseClient,
  userId: string,
  data: AppData,
): Promise<AppData> {
  const profile = data.profile
  if (!profile) return data

  const [profileRes, xpRes, badgesRes, questsRes] = await Promise.all([
    client.from('profiles').select('xp, streak_count, longest_streak, streak_freezes, last_log_date, last_freeze_earned_month, weekly_streak, last_evaluated_date').eq('id', userId).maybeSingle(),
    client.from('xp_events').select('*').eq('user_id', userId),
    client.from('user_badges').select('*').eq('user_id', userId),
    client.from('user_quests').select('*').eq('user_id', userId),
  ])

  const next = structuredClone(data)
  const p = profileRes.data
  if (p) {
    next.profile = {
      ...next.profile!,
      xp: p.xp as number,
      streakCount: p.streak_count as number,
      longestStreak: p.longest_streak as number,
      streakFreezes: p.streak_freezes as number,
      lastLogDate: (p.last_log_date as string) ?? null,
      lastFreezeEarnedMonth: (p.last_freeze_earned_month as string) ?? null,
      weeklyStreak: p.weekly_streak as number,
      lastEvaluatedDate: (p.last_evaluated_date as string) ?? null,
    }
  }

  const xpEvents = (xpRes.data ?? []).map((r) => ({
    id: r.id as string,
    amount: r.amount as number,
    reason: r.reason as XpEvent['reason'],
    refId: r.ref_id as string,
    date: r.date as string,
    createdAt: r.created_at as string,
  }))
  next.xpEvents = xpEvents
  if (next.profile) {
    // Keep profile.xp aligned with the audit log when the server has events.
    next.profile.xp = xpEvents.length > 0 ? totalXp(xpEvents) : next.profile.xp
  }

  next.userBadges = (badgesRes.data ?? []).map((r) => ({
    badgeId: r.badge_id as string,
    earnedAt: r.earned_at as string,
  }))

  next.userQuests = (questsRes.data ?? []).map((r) => ({
    id: r.id as string,
    questId: r.quest_id as string,
    periodKey: r.period_key as string,
    completedAt: (r.completed_at as string) ?? null,
    claimedAt: (r.claimed_at as string) ?? null,
    createdAt: r.created_at as string,
  }))

  return next
}

export async function claimQuestOnServer(
  client: SupabaseClient,
  questId: string,
  periodKey: string,
): Promise<void> {
  await invokeAward(client, { action: 'claim-quest', questId, periodKey })
}
