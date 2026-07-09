/**
 * Supabase adapter. The in-memory AppData stays the source of truth for the
 * UI; this adapter mirrors it to Postgres with row-level diffs, queueing
 * writes in localStorage while offline so lightning-fast transaction entry
 * never waits on the network.
 *
 * Server-side XP: transactions/goal_contributions trigger XP in the DB, and
 * day-close/no-spend/quest awards go through the award-xp edge function.
 * The client mirrors the same rules for instant feedback; on the next load
 * the server's xp_events are authoritative.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Bucket } from './types'
import { emptyAppData } from './types'
import type { DataStore, SyncOp } from './store'

const CACHE_KEY = 'pulse-budget:supabase-cache:v1'
const QUEUE_KEY = 'pulse-budget:sync-queue:v1'

/** Tables that sync 1:1 with AppData collections. */
const COLLECTIONS = [
  ['categories', 'categories'],
  ['incomes', 'income_entries'],
  ['transactions', 'transactions'],
  ['recurring', 'recurring_items'],
  ['goals', 'goals'],
  ['contributions', 'goal_contributions'],
  ['snapshots', 'monthly_snapshots'],
  ['userQuests', 'user_quests'],
] as const

export class SupabaseStore implements DataStore {
  kind = 'supabase' as const
  private previous: AppData | null = null

  constructor(private client: SupabaseClient) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushQueue())
    }
  }

  async userId(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  async load(): Promise<AppData | null> {
    const userId = await this.userId()
    if (!userId) return null

    try {
      const [profileRes, ...collections] = await Promise.all([
        this.client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        ...COLLECTIONS.map(([, table]) =>
          this.client.from(table).select('*').eq('user_id', userId),
        ),
        this.client.from('user_badges').select('*').eq('user_id', userId),
        this.client.from('xp_events').select('*').eq('user_id', userId),
      ])

      const [cats, incomes, txns, recurring, goals, contributions, snapshots, userQuests] =
        collections.slice(0, 8).map((r) => r.data ?? [])
      const userBadges = collections[8]?.data ?? []
      const xpEvents = collections[9]?.data ?? []

      const p = profileRes.data
      const data: AppData = {
        profile: p?.onboarded
          ? {
              id: p.id,
              displayName: p.display_name,
              salaryCents: Number(p.salary_cents),
              payDate: p.pay_date,
              splits: p.splits,
              funFundCents: Number(p.fun_fund_cents),
              xp: p.xp,
              streakCount: p.streak_count,
              longestStreak: p.longest_streak,
              streakFreezes: p.streak_freezes,
              lastLogDate: p.last_log_date,
              lastFreezeEarnedMonth: p.last_freeze_earned_month,
              weeklyStreak: p.weekly_streak,
              lastEvaluatedDate: p.last_evaluated_date,
              themeId: p.theme_id,
              darkMode: p.dark_mode,
              soundEnabled: p.sound_enabled,
              onboarded: p.onboarded,
              isDemo: false,
              createdAt: p.created_at,
            }
          : null,
        categories: cats.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          icon: r.icon as string,
          color: r.color as string,
          bucket: r.bucket as Bucket,
          isFunFund: r.is_fun_fund as boolean,
          isCustom: r.is_custom as boolean,
          sortOrder: r.sort_order as number,
        })),
        incomes: incomes.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          amountCents: Number(r.amount_cents),
          source: r.source as AppData['incomes'][number]['source'],
          note: (r.note as string) ?? undefined,
          date: r.date as string,
          occurrenceKey: (r.occurrence_key as string) ?? undefined,
          createdAt: r.created_at as string,
        })),
        transactions: txns.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          amountCents: Number(r.amount_cents),
          categoryId: r.category_id as string,
          note: (r.note as string) ?? undefined,
          date: r.date as string,
          occurrenceKey: (r.occurrence_key as string) ?? undefined,
          createdAt: r.created_at as string,
        })),
        recurring: recurring.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          kind: r.kind as 'expense' | 'income',
          name: r.name as string,
          amountCents: Number(r.amount_cents),
          dayOfMonth: r.day_of_month as number,
          categoryId: (r.category_id as string) ?? undefined,
          source: (r.source as AppData['incomes'][number]['source']) ?? undefined,
          active: r.active as boolean,
          lastMaterialized: (r.last_materialized as string) ?? null,
          createdAt: r.created_at as string,
        })),
        goals: goals.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          icon: r.icon as string,
          color: r.color as string,
          targetCents: Number(r.target_cents),
          savedCents: Number(r.saved_cents),
          autoAllocateCents: Number(r.auto_allocate_cents),
          celebratedMilestones: (r.celebrated_milestones as number[]) ?? [],
          achievedAt: (r.achieved_at as string) ?? null,
          createdAt: r.created_at as string,
        })),
        contributions: contributions.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          goalId: r.goal_id as string,
          amountCents: Number(r.amount_cents),
          date: r.date as string,
          source: r.source as AppData['contributions'][number]['source'],
          createdAt: r.created_at as string,
        })),
        snapshots: snapshots.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          cycleStart: r.cycle_start as string,
          cycleEnd: r.cycle_end as string,
          incomeCents: Number(r.income_cents),
          allocated: r.allocated as Record<Bucket, number>,
          spentByBucket: r.spent_by_bucket as Record<Bucket, number>,
          spentByCategory: r.spent_by_category as Record<string, number>,
          savedCents: Number(r.saved_cents),
          sweptCents: Number(r.swept_cents),
          swept: r.swept as boolean,
          bossDefeated: r.boss_defeated as boolean,
          createdAt: r.created_at as string,
        })),
        userQuests: userQuests.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          questId: r.quest_id as string,
          periodKey: r.period_key as string,
          completedAt: (r.completed_at as string) ?? null,
          claimedAt: (r.claimed_at as string) ?? null,
          createdAt: r.created_at as string,
        })),
        userBadges: userBadges.map((r: Record<string, unknown>) => ({
          badgeId: r.badge_id as string,
          earnedAt: r.earned_at as string,
        })),
        xpEvents: xpEvents.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          amount: r.amount as number,
          reason: r.reason as AppData['xpEvents'][number]['reason'],
          refId: r.ref_id as string,
          date: r.date as string,
          createdAt: r.created_at as string,
        })),
      }

      this.previous = structuredClone(data)
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
      return data
    } catch {
      // Offline: fall back to the last good cache.
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const data = JSON.parse(cached) as AppData
        this.previous = structuredClone(data)
        return data
      }
      return null
    }
  }

  async persist(data: AppData): Promise<void> {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    const ops = this.diff(this.previous, data)
    this.previous = structuredClone(data)
    if (ops.length > 0) {
      this.enqueue(ops)
      await this.flushQueue()
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(QUEUE_KEY)
    await this.client.auth.signOut()
  }

  /* ---------------- diff & queue ---------------- */

  private diff(prev: AppData | null, next: AppData): SyncOp[] {
    const ops: SyncOp[] = []
    const before = prev ?? emptyAppData()

    if (
      next.profile &&
      JSON.stringify(next.profile) !== JSON.stringify(before.profile)
    ) {
      const p = next.profile
      ops.push({
        table: 'profiles',
        op: 'upsert',
        row: {
          id: p.id,
          display_name: p.displayName,
          salary_cents: p.salaryCents,
          pay_date: p.payDate,
          splits: p.splits,
          fun_fund_cents: p.funFundCents,
          streak_count: p.streakCount,
          longest_streak: p.longestStreak,
          streak_freezes: p.streakFreezes,
          last_log_date: p.lastLogDate,
          last_freeze_earned_month: p.lastFreezeEarnedMonth,
          weekly_streak: p.weeklyStreak,
          last_evaluated_date: p.lastEvaluatedDate,
          theme_id: p.themeId,
          dark_mode: p.darkMode,
          sound_enabled: p.soundEnabled,
          onboarded: p.onboarded,
        },
      })
    }

    const userId = next.profile?.id
    const rowMappers: Record<string, (item: Record<string, unknown>) => Record<string, unknown>> = {
      categories: (c) => ({
        id: c.id, user_id: userId, name: c.name, icon: c.icon, color: c.color,
        bucket: c.bucket, is_fun_fund: c.isFunFund, is_custom: c.isCustom, sort_order: c.sortOrder,
      }),
      income_entries: (i) => ({
        id: i.id, user_id: userId, amount_cents: i.amountCents, source: i.source,
        note: i.note ?? null, date: i.date, occurrence_key: i.occurrenceKey ?? null,
      }),
      transactions: (t) => ({
        id: t.id, user_id: userId, amount_cents: t.amountCents, category_id: t.categoryId,
        note: t.note ?? null, date: t.date, occurrence_key: t.occurrenceKey ?? null,
      }),
      recurring_items: (r) => ({
        id: r.id, user_id: userId, kind: r.kind, name: r.name, amount_cents: r.amountCents,
        day_of_month: r.dayOfMonth, category_id: r.categoryId ?? null, source: r.source ?? null,
        active: r.active, last_materialized: r.lastMaterialized,
      }),
      goals: (g) => ({
        id: g.id, user_id: userId, name: g.name, icon: g.icon, color: g.color,
        target_cents: g.targetCents, saved_cents: g.savedCents,
        auto_allocate_cents: g.autoAllocateCents, celebrated_milestones: g.celebratedMilestones,
        achieved_at: g.achievedAt,
      }),
      goal_contributions: (c) => ({
        id: c.id, user_id: userId, goal_id: c.goalId, amount_cents: c.amountCents,
        date: c.date, source: c.source,
      }),
      monthly_snapshots: (s) => ({
        id: s.id, user_id: userId, cycle_start: s.cycleStart, cycle_end: s.cycleEnd,
        income_cents: s.incomeCents, allocated: s.allocated, spent_by_bucket: s.spentByBucket,
        spent_by_category: s.spentByCategory, saved_cents: s.savedCents,
        swept_cents: s.sweptCents, swept: s.swept, boss_defeated: s.bossDefeated,
      }),
      user_quests: (q) => ({
        id: q.id, user_id: userId, quest_id: q.questId, period_key: q.periodKey,
        completed_at: q.completedAt, claimed_at: q.claimedAt,
      }),
    }

    for (const [key, table] of COLLECTIONS) {
      const prevItems = new Map(
        (before[key] as { id: string }[]).map((item) => [item.id, item]),
      )
      const nextItems = next[key] as { id: string }[]
      const nextIds = new Set(nextItems.map((i) => i.id))

      for (const item of nextItems) {
        const old = prevItems.get(item.id)
        if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
          // Snapshot ids are deterministic strings locally; let PG mint uuids.
          const row = rowMappers[table](item as unknown as Record<string, unknown>)
          if (table === 'monthly_snapshots' && String(item.id).startsWith('snap:')) {
            delete row.id
          }
          ops.push({ table, op: 'upsert', row })
        }
      }
      for (const [id] of prevItems) {
        if (!nextIds.has(id)) ops.push({ table, op: 'delete', row: { id } })
      }
    }

    return ops
  }

  private enqueue(ops: SyncOp[]) {
    const queue = this.readQueue()
    queue.push(...ops)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }

  private readQueue(): SyncOp[] {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as SyncOp[]
    } catch {
      return []
    }
  }

  async flushQueue(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const queue = this.readQueue()
    if (queue.length === 0) return

    const remaining: SyncOp[] = []
    for (const op of queue) {
      try {
        if (op.op === 'upsert') {
          const conflict =
            op.table === 'monthly_snapshots'
              ? 'user_id,cycle_start'
              : op.table === 'user_quests'
                ? 'user_id,quest_id,period_key'
                : op.table === 'categories'
                  ? 'user_id,id'
                  : 'id'
          const { error } = await this.client
            .from(op.table)
            .upsert(op.row, { onConflict: conflict })
          if (error) throw error
        } else {
          const { error } = await this.client.from(op.table).delete().eq('id', op.row.id)
          if (error) throw error
        }
      } catch {
        remaining.push(op)
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining))
  }
}
