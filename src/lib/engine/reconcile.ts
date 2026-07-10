/**
 * Reconciliation: the ledger (transactions, incomes, contributions,
 * xp_events) is the single source of truth — everything derived from it is
 * re-computed here so the whole app always agrees with itself. Runs after
 * every mutation and during housekeeping, so editing or deleting an entry
 * ripples through goals, XP, snapshots, insights and the month tracker.
 */

import type { AppData } from '../data/types'
import { cycleFor, prevCycle } from './cycle'
import { buildSnapshot } from './insights'
import { totalXp } from '../gamification/xp'

const SNAPSHOT_LOOKBACK = 6

export function reconcile(data: AppData, today: string): AppData {
  const profile = data.profile
  if (!profile) return data

  /* 1 — no dangling category references: orphans fall back to Other. */
  const categoryIds = new Set(data.categories.map((c) => c.id))
  for (const t of data.transactions) {
    if (!categoryIds.has(t.categoryId)) t.categoryId = 'cat-other'
  }

  /* 2 — no dangling goal references. */
  const goalIds = new Set(data.goals.map((g) => g.id))
  data.contributions = data.contributions.filter((c) => goalIds.has(c.goalId))

  /* 3 — goals derive their totals from the contribution ledger. */
  for (const goal of data.goals) {
    goal.savedCents = data.contributions
      .filter((c) => c.goalId === goal.id)
      .reduce((sum, c) => sum + c.amountCents, 0)

    const pct = goal.targetCents > 0 ? (goal.savedCents / goal.targetCents) * 100 : 0
    if (pct >= 100) {
      goal.achievedAt ??= new Date().toISOString()
    } else {
      goal.achievedAt = null
    }
    // Milestones above the current level un-latch, so re-reaching them
    // celebrates again instead of silently not matching the ring.
    goal.celebratedMilestones = goal.celebratedMilestones.filter((m) => pct >= m)
  }

  /* 4 — XP is always the sum of the audit log. */
  profile.xp = totalXp(data.xpEvents)

  /* 5 — stored snapshots are rebuilt from today's ledger so the month
   *     tracker, insights and trend always match what's actually logged.
   *     Sweep bookkeeping (swept flag + amount) is preserved. */
  let walker = prevCycle(cycleFor(today, profile.payDate), profile.payDate)
  for (let i = 0; i < SNAPSHOT_LOOKBACK; i++) {
    const index = data.snapshots.findIndex((s) => s.cycleStart === walker.start)
    if (index >= 0) {
      const old = data.snapshots[index]
      const fresh = buildSnapshot(data, walker, profile.splits, {
        sweptCents: old.sweptCents,
        nowISO: old.createdAt,
      })
      fresh.id = old.id
      fresh.swept = old.swept
      data.snapshots[index] = fresh
    }
    walker = prevCycle(walker, profile.payDate)
  }

  return data
}
