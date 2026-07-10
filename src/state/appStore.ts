/**
 * The app's brain-stem: holds AppData in memory, applies every action
 * (expenses, income, goals, quests, sweeps), awards XP/streaks/badges via
 * the pure gamification modules, emits juice events, and persists through
 * the active DataStore adapter.
 */

import { create } from 'zustand'
import type {
  AppData,
  Category,
  ContributionSource,
  Goal,
  GoalContribution,
  IncomeEntry,
  IncomeSource,
  Profile,
  QuestDef,
  RecurringItem,
  Transaction,
  XpEvent,
} from '../lib/data/types'
import { emptyAppData } from '../lib/data/types'
import type { DataStore } from '../lib/data/store'
import { getDataStore } from '../lib/data'
import { DEFAULT_CATEGORIES, makeDefaultProfile } from '../lib/data/defaults'
import { buildDemoData } from '../lib/data/seedDemo'
import { uid } from '../lib/id'
import { addDays, diffDays, todaySAST, weekBounds } from '../lib/dates'
import {
  cycleFor,
  daysInCycle,
  daysRemaining,
  inCycle,
  prevCycle,
} from '../lib/engine/cycle'
import { allocateIncome, splitsAreValid } from '../lib/engine/allocate'
import { wasUnderStsDay } from '../lib/engine/safeToSpend'
import { dueOccurrences, occurrenceKey } from '../lib/engine/recurring'
import { buildSnapshot, incomesInCycle, sumCents } from '../lib/engine/insights'
import { alreadyAwarded, makeXpEvent, totalXp } from '../lib/gamification/xp'
import { levelForXp, rankForLevel, unlockedThemes } from '../lib/gamification/levels'
import { advanceStreak } from '../lib/gamification/streaks'
import {
  buildQuestContext,
  computeQuestProgress,
  questClaimRef,
} from '../lib/gamification/quests'
import { BADGE_DEFS, evaluateBadges } from '../lib/gamification/badges'
import { loggedDates, pendingSweepOffer } from './selectors'
import { useJuiceStore, type JuiceEvent } from './juiceStore'
import { setSoundEnabled } from '../lib/sound'

interface AppState {
  data: AppData
  loaded: boolean
  /** Supabase mode only: configured but no session yet. */
  needsAuth: boolean
  init: () => Promise<void>
  reload: () => Promise<void>
  startDemo: () => Promise<void>
  createProfile: (params: {
    displayName: string
    salaryCents: number
    payDate: number
    splits: Profile['splits']
  }) => Promise<void>
  addExpense: (params: { amountCents: number; categoryId: string; note?: string }) => Promise<void>
  addIncome: (params: { amountCents: number; source: IncomeSource; note?: string }) => Promise<void>
  markNoSpendDay: () => Promise<void>
  contributeToGoal: (goalId: string, amountCents: number, source?: ContributionSource) => Promise<void>
  sweepToGoal: (goalId: string) => Promise<void>
  claimQuest: (def: QuestDef, periodKey: string) => Promise<void>
  addGoal: (params: { name: string; icon: string; color: string; targetCents: number; autoAllocateCents?: number }) => Promise<void>
  updateGoal: (goalId: string, patch: Partial<Goal>) => Promise<void>
  deleteGoal: (goalId: string) => Promise<void>
  addCategory: (params: { name: string; icon: string; color: string; bucket: Category['bucket']; isFunFund?: boolean }) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>
  addRecurring: (params: {
    kind: RecurringItem['kind']
    name: string
    amountCents: number
    dayOfMonth: number
    categoryId?: string
    source?: IncomeSource
  }) => Promise<void>
  updateRecurring: (id: string, patch: Partial<RecurringItem>) => Promise<void>
  deleteRecurring: (id: string) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
  saveMonthReview: (cycleStart: string, mood: 1 | 2 | 3 | 4, note: string) => Promise<void>
  resetAll: () => Promise<void>
}

const store: DataStore = getDataStore()

const nowISO = () => new Date().toISOString()

/* ------------------------------------------------------------------ */
/*  XP / badge helpers (operate on a mutable working copy)             */
/* ------------------------------------------------------------------ */

function applyXp(data: AppData, events: XpEvent[], juice: JuiceEvent[]) {
  const profile = data.profile
  if (!profile) return
  const fresh = events.filter((e) => !alreadyAwarded(data.xpEvents, e.refId))
  if (fresh.length === 0) return

  const levelBefore = levelForXp(profile.xp)
  data.xpEvents.push(...fresh)
  profile.xp = totalXp(data.xpEvents)
  const levelAfter = levelForXp(profile.xp)

  for (const e of fresh) juice.push({ kind: 'xp', amount: e.amount })

  if (levelAfter > levelBefore) {
    const themesBefore = new Set(unlockedThemes(levelBefore))
    const newTheme = unlockedThemes(levelAfter).find((t) => !themesBefore.has(t)) ?? null
    juice.push({
      kind: 'levelup',
      level: levelAfter,
      rank: rankForLevel(levelAfter),
      unlockedTheme: newTheme,
    })
  }
}

function applyBadges(data: AppData, juice: JuiceEvent[] | null, when: string) {
  const profile = data.profile
  if (!profile) return
  const earned = evaluateBadges({
    data,
    longestStreak: profile.longestStreak,
    xp: profile.xp,
  })
  for (const badgeId of earned) {
    data.userBadges.push({ badgeId, earnedAt: when })
    const def = BADGE_DEFS.find((b) => b.id === badgeId)
    if (def && juice) juice.push({ kind: 'badge', badge: def })
  }
}

function applyStreak(data: AppData, today: string, juice: JuiceEvent[]) {
  const profile = data.profile
  if (!profile) return
  const update = advanceStreak(profile, today)
  const grew = update.streakCount > profile.streakCount
  profile.streakCount = update.streakCount
  profile.longestStreak = update.longestStreak
  profile.streakFreezes = update.streakFreezes
  profile.lastLogDate = update.lastLogDate
  profile.lastFreezeEarnedMonth = update.lastFreezeEarnedMonth
  if (update.usedFreeze) juice.push({ kind: 'freeze', used: true })
  if (update.earnedFreeze) juice.push({ kind: 'freeze', used: false })
  return grew
}

/* ------------------------------------------------------------------ */
/*  Housekeeping (boot + day changes)                                  */
/* ------------------------------------------------------------------ */

const MAX_EVAL_DAYS = 60

export function runHousekeeping(input: AppData, today: string, when: string): AppData {
  const data = structuredClone(input)
  // Older persisted data may predate newer collections.
  data.reviews ??= []
  const profile = data.profile
  if (!profile) return data

  /* 1 — materialise recurring items due since last time. */
  for (const item of data.recurring) {
    const from = item.lastMaterialized ?? addDays(today, -1)
    for (const due of dueOccurrences(item, from, today)) {
      const key = occurrenceKey(item.id, due)
      if (item.kind === 'expense' && item.categoryId) {
        if (!data.transactions.some((t) => t.occurrenceKey === key)) {
          data.transactions.push({
            id: uid(),
            amountCents: item.amountCents,
            categoryId: item.categoryId,
            note: item.name,
            date: due,
            createdAt: when,
            occurrenceKey: key,
          })
        }
      } else if (item.kind === 'income' && item.source) {
        if (!data.incomes.some((i) => i.occurrenceKey === key)) {
          data.incomes.push({
            id: uid(),
            amountCents: item.amountCents,
            source: item.source,
            note: item.name,
            date: due,
            createdAt: when,
            occurrenceKey: key,
          })
        }
      }
    }
    item.lastMaterialized = today
  }

  /* 2 — auto-allocate to goals once per cycle after salary lands. */
  const cycle = cycleFor(today, profile.payDate)
  const salaryThisCycle = data.incomes.find(
    (i) => i.source === 'salary' && inCycle(i.date, cycle),
  )
  if (salaryThisCycle) {
    for (const goal of data.goals) {
      if (goal.autoAllocateCents <= 0 || goal.achievedAt) continue
      const hasAuto = data.contributions.some(
        (c) => c.goalId === goal.id && c.source === 'auto' && inCycle(c.date, cycle),
      )
      if (hasAuto) continue
      const contribution: GoalContribution = {
        id: uid(),
        goalId: goal.id,
        amountCents: goal.autoAllocateCents,
        date: salaryThisCycle.date <= today ? salaryThisCycle.date : today,
        source: 'auto',
        createdAt: when,
      }
      data.contributions.push(contribution)
      goal.savedCents += contribution.amountCents
      applyXp(
        data,
        [makeXpEvent({ reason: 'savings_contribution', refId: contribution.id, date: contribution.date, nowISO: when })],
        [],
      )
    }
  }

  /* 3 — day-close awards for days since the last evaluation. */
  const logged = loggedDates(data)
  const accountStart = profile.createdAt.slice(0, 10)
  let evalFrom = profile.lastEvaluatedDate
    ? addDays(profile.lastEvaluatedDate, 1)
    : accountStart
  const yesterday = addDays(today, -1)
  if (diffDays(evalFrom, yesterday) > MAX_EVAL_DAYS) {
    evalFrom = addDays(yesterday, -MAX_EVAL_DAYS)
  }

  const wantIds = new Set(data.categories.filter((c) => c.bucket === 'want').map((c) => c.id))
  const wantSpentOn = (date: string) =>
    data.transactions
      .filter((t) => t.date === date && wantIds.has(t.categoryId))
      .reduce((sum, t) => sum + t.amountCents, 0)

  for (let d = evalFrom; d <= yesterday; d = addDays(d, 1)) {
    if (d < accountStart) continue

    const dayCycle = cycleFor(d, profile.payDate)
    const incomeToDate = sumCents(
      incomesInCycle(data.incomes, dayCycle).filter((i) => i.date <= d),
    )
    if (incomeToDate === 0) continue
    const allocated = allocateIncome(incomeToDate, profile.splits)

    const spentBefore = data.transactions
      .filter((t) => wantIds.has(t.categoryId) && inCycle(t.date, dayCycle) && t.date < d)
      .reduce((sum, t) => sum + t.amountCents, 0)

    // Under-budget day: only counts when the user actually showed up.
    if (logged.has(d)) {
      const under = wasUnderStsDay({
        wantsAllocatedCents: allocated.want,
        wantsSpentBeforeCents: spentBefore,
        wantsSpentOnDayCents: wantSpentOn(d),
        daysRemainingOnDay: daysRemaining(d, dayCycle),
      })
      if (under) {
        applyXp(
          data,
          [makeXpEvent({ reason: 'under_sts_day', refId: `usd:${d}`, date: d, nowISO: when })],
          [],
        )
      }
    }

    // Weekly under-budget streak, judged when a week completes (Sundays).
    const week = weekBounds(d)
    if (d === week.end) {
      const weekSpend = data.transactions
        .filter((t) => wantIds.has(t.categoryId) && t.date >= week.start && t.date <= week.end)
        .reduce((sum, t) => sum + t.amountCents, 0)
      const weeklyBudget = Math.floor((allocated.want / daysInCycle(dayCycle)) * 7)
      const active = Array.from({ length: 7 }, (_, i) => addDays(week.start, i)).some((day) =>
        logged.has(day),
      )
      if (active && weekSpend <= weeklyBudget) {
        profile.weeklyStreak += 1
        const bonus = Math.min(100, 25 * profile.weeklyStreak)
        applyXp(
          data,
          [makeXpEvent({ reason: 'streak_bonus', refId: `wus:${week.start}`, date: d, amount: bonus, nowISO: when })],
          [],
        )
      } else if (active) {
        profile.weeklyStreak = 0
      }
    }
  }
  profile.lastEvaluatedDate = yesterday >= accountStart ? yesterday : profile.lastEvaluatedDate

  /* 4 — snapshot completed cycles that are missing one (last three). */
  let walker = prevCycle(cycle, profile.payDate)
  for (let i = 0; i < 3; i++) {
    if (walker.end <= accountStart) break
    const exists = data.snapshots.some((s) => s.cycleStart === walker.start)
    if (!exists && sumCents(incomesInCycle(data.incomes, walker)) > 0) {
      data.snapshots.push(buildSnapshot(data, walker, profile.splits, { nowISO: when }))
    }
    walker = prevCycle(walker, profile.payDate)
  }

  /* 5 — badges earned by history (silent — no fanfare for old news). */
  profile.xp = totalXp(data.xpEvents)
  applyBadges(data, null, when)

  return data
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useAppStore = create<AppState>((set, get) => {
  /** Run a mutation against a cloned working copy, emit juice, persist. */
  async function commit(
    mutate: (data: AppData, juice: JuiceEvent[], today: string) => void | false,
  ): Promise<void> {
    const today = todaySAST()
    const data = structuredClone(get().data)
    const juice: JuiceEvent[] = []
    if (mutate(data, juice, today) === false) return
    if (data.profile) data.profile.xp = totalXp(data.xpEvents)
    set({ data })
    if (juice.length > 0) useJuiceStore.getState().push(...juice)
    await store.persist(data)
  }

  return {
    data: emptyAppData(),
    loaded: false,
    needsAuth: false,

    init: async () => {
      if (get().loaded) return
      const stored = await store.load()
      if (!stored?.profile) {
        // Supabase mode: no session at all → the auth screen; a session
        // without an onboarded profile → onboarding.
        if (store.kind === 'supabase' && !(await store.userId?.())) {
          set({ loaded: true, needsAuth: true, data: emptyAppData() })
          return
        }
        set({ loaded: true, needsAuth: false, data: stored ?? emptyAppData() })
        return
      }
      const data = runHousekeeping(stored, todaySAST(), nowISO())
      setSoundEnabled(data.profile?.soundEnabled ?? true)
      set({ loaded: true, needsAuth: false, data })
      await store.persist(data)
    },

    reload: async () => {
      set({ loaded: false, needsAuth: false, data: emptyAppData() })
      await get().init()
    },

    startDemo: async () => {
      const data = runHousekeeping(buildDemoData(), todaySAST(), nowISO())
      set({ loaded: true, data })
      await store.persist(data)
    },

    createProfile: async (params) => {
      if (!splitsAreValid(params.splits)) throw new Error('Splits must sum to 100')
      const today = todaySAST()
      const profile = makeDefaultProfile({
        displayName: params.displayName,
        salaryCents: params.salaryCents,
        payDate: params.payDate,
        splits: params.splits,
        nowISO: nowISO(),
      })
      // Backdate account start to the cycle start so this cycle's salary
      // materialises immediately and the dashboard is alive from minute one.
      const cycle = cycleFor(today, params.payDate)
      profile.createdAt = `${cycle.start}T00:00:00.000Z`
      // In Supabase mode the profile row is keyed by the auth user id.
      profile.id = (await store.userId?.()) ?? profile.id

      const base: AppData = {
        ...emptyAppData(),
        profile,
        categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
        recurring: [
          {
            id: uid(),
            kind: 'income',
            name: 'Salary',
            amountCents: params.salaryCents,
            dayOfMonth: params.payDate,
            source: 'salary',
            active: true,
            lastMaterialized: addDays(cycle.start, -1),
            createdAt: nowISO(),
          },
        ],
      }
      const data = runHousekeeping(base, today, nowISO())
      set({ loaded: true, data })
      useJuiceStore.getState().push({ kind: 'confetti' }, { kind: 'coins' })
      await store.persist(data)
    },

    addExpense: async ({ amountCents, categoryId, note }) =>
      commit((data, juice, today) => {
        if (amountCents <= 0) return false
        const txn: Transaction = {
          id: uid(),
          amountCents,
          categoryId,
          note,
          date: today,
          createdAt: nowISO(),
        }
        data.transactions.push(txn)
        applyStreak(data, today, juice)
        applyXp(
          data,
          [makeXpEvent({ reason: 'log_expense', refId: txn.id, date: today })],
          juice,
        )
        applyBadges(data, juice, nowISO())
      }),

    addIncome: async ({ amountCents, source, note }) =>
      commit((data, juice, today) => {
        if (amountCents <= 0) return false
        const income: IncomeEntry = {
          id: uid(),
          amountCents,
          source,
          note,
          date: today,
          createdAt: nowISO(),
        }
        data.incomes.push(income)
        applyStreak(data, today, juice)
        juice.push({ kind: 'coins' })
        applyBadges(data, juice, nowISO())
      }),

    markNoSpendDay: async () =>
      commit((data, juice, today) => {
        const spentToday = data.transactions.some((t) => t.date === today)
        const already = data.xpEvents.some((e) => e.refId === `nsd:${today}`)
        if (spentToday || already) return false
        applyStreak(data, today, juice)
        applyXp(
          data,
          [makeXpEvent({ reason: 'no_spend_day', refId: `nsd:${today}`, date: today })],
          juice,
        )
        juice.push({ kind: 'confetti' })
        applyBadges(data, juice, nowISO())
      }),

    contributeToGoal: async (goalId, amountCents, source = 'manual') =>
      commit((data, juice, today) => {
        const goal = data.goals.find((g) => g.id === goalId)
        if (!goal || amountCents <= 0) return false
        const contribution: GoalContribution = {
          id: uid(),
          goalId,
          amountCents,
          date: today,
          source,
          createdAt: nowISO(),
        }
        data.contributions.push(contribution)
        goal.savedCents += amountCents

        // Milestones — celebrate each freshly crossed quarter.
        const pct = goal.targetCents > 0 ? (goal.savedCents / goal.targetCents) * 100 : 0
        for (const m of [25, 50, 75, 100]) {
          if (pct >= m && !goal.celebratedMilestones.includes(m)) {
            goal.celebratedMilestones.push(m)
            juice.push({ kind: 'milestone', goal: { ...goal }, pct: m })
          }
        }
        if (pct >= 100 && !goal.achievedAt) goal.achievedAt = nowISO()

        if (source === 'manual') applyStreak(data, today, juice)
        applyXp(
          data,
          [makeXpEvent({ reason: 'savings_contribution', refId: contribution.id, date: today })],
          juice,
        )
        applyBadges(data, juice, nowISO())
      }),

    sweepToGoal: async (goalId) =>
      commit((data, juice, today) => {
        const offer = pendingSweepOffer(data, today)
        const goal = data.goals.find((g) => g.id === goalId)
        if (!offer || !goal) return false

        const contribution: GoalContribution = {
          id: uid(),
          goalId,
          amountCents: offer.amountCents,
          date: today,
          source: 'sweep',
          createdAt: nowISO(),
        }
        data.contributions.push(contribution)
        goal.savedCents += offer.amountCents

        // Mark the swept cycle's snapshot (create it if needed).
        const profile = data.profile
        if (profile) {
          const cycle = { start: offer.cycleStart, end: offer.cycleEnd }
          let snapshot = data.snapshots.find((s) => s.cycleStart === cycle.start)
          if (!snapshot) {
            snapshot = buildSnapshot(data, cycle, profile.splits, { nowISO: nowISO() })
            data.snapshots.push(snapshot)
          }
          snapshot.swept = true
          snapshot.sweptCents = offer.amountCents
          snapshot.savedCents += offer.amountCents
        }

        applyXp(
          data,
          [makeXpEvent({ reason: 'sweep', refId: `sweep:${offer.cycleStart}`, date: today })],
          juice,
        )
        juice.push({ kind: 'coins' }, { kind: 'confetti' })
        applyBadges(data, juice, nowISO())
      }),

    claimQuest: async (def, periodKey) =>
      commit((data, juice, today) => {
        const profile = data.profile
        if (!profile) return false
        const claimed = data.userQuests.some(
          (q) => q.questId === def.id && q.periodKey === periodKey && q.claimedAt,
        )
        if (claimed) return false

        // Re-verify completion against the data (client mirror of the
        // server-side check in Supabase mode).
        const cycle = cycleFor(today, profile.payDate)
        const incomeCents = sumCents(incomesInCycle(data.incomes, cycle))
        const allocated = allocateIncome(incomeCents, profile.splits)
        const ctx = buildQuestContext({
          todayISO: today,
          cycle,
          transactions: data.transactions,
          contributions: data.contributions,
          categories: data.categories,
          loggedDates: loggedDates(data),
          savingAllocatedCents: allocated.saving,
        })
        if (!computeQuestProgress(def, ctx).completed) return false

        data.userQuests.push({
          id: uid(),
          questId: def.id,
          periodKey,
          completedAt: nowISO(),
          claimedAt: nowISO(),
          createdAt: nowISO(),
        })
        applyXp(
          data,
          [
            makeXpEvent({
              reason: def.kind === 'boss' ? 'boss_defeated' : 'quest_reward',
              refId: questClaimRef(def.id, periodKey),
              date: today,
              amount: def.rewardXp,
            }),
          ],
          juice,
        )
        juice.push(def.kind === 'boss' ? { kind: 'boss' } : { kind: 'confetti' })
        applyBadges(data, juice, nowISO())
      }),

    addGoal: async ({ name, icon, color, targetCents, autoAllocateCents = 0 }) =>
      commit((data) => {
        if (!name.trim() || targetCents <= 0) return false
        data.goals.push({
          id: uid(),
          name: name.trim(),
          icon,
          color,
          targetCents,
          savedCents: 0,
          autoAllocateCents,
          celebratedMilestones: [],
          achievedAt: null,
          createdAt: nowISO(),
        })
      }),

    updateGoal: async (goalId, patch) =>
      commit((data) => {
        const goal = data.goals.find((g) => g.id === goalId)
        if (!goal) return false
        Object.assign(goal, patch)
      }),

    deleteGoal: async (goalId) =>
      commit((data) => {
        data.goals = data.goals.filter((g) => g.id !== goalId)
        data.contributions = data.contributions.filter((c) => c.goalId !== goalId)
      }),

    addCategory: async ({ name, icon, color, bucket, isFunFund = false }) =>
      commit((data) => {
        if (!name.trim()) return false
        data.categories.push({
          id: `custom-${uid()}`,
          name: name.trim(),
          icon,
          color,
          bucket,
          isFunFund,
          isCustom: true,
          sortOrder: data.categories.length,
        })
      }),

    deleteCategory: async (categoryId) =>
      commit((data) => {
        const cat = data.categories.find((c) => c.id === categoryId)
        if (!cat?.isCustom) return false
        data.categories = data.categories.filter((c) => c.id !== categoryId)
        // Orphaned transactions fall back to Other.
        for (const t of data.transactions) {
          if (t.categoryId === categoryId) t.categoryId = 'cat-other'
        }
      }),

    addRecurring: async (params) =>
      commit((data, _juice, today) => {
        if (params.amountCents <= 0) return false
        data.recurring.push({
          id: uid(),
          kind: params.kind,
          name: params.name,
          amountCents: params.amountCents,
          dayOfMonth: Math.min(31, Math.max(1, params.dayOfMonth)),
          categoryId: params.categoryId,
          source: params.source,
          active: true,
          // Fires from today onward (a due date today materialises now).
          lastMaterialized: addDays(today, -1),
          createdAt: nowISO(),
        })
      }).then(async () => {
        // Materialise anything due immediately (e.g. dayOfMonth === today).
        const today = todaySAST()
        const data = runHousekeeping(useAppStore.getState().data, today, nowISO())
        set({ data })
        await store.persist(data)
      }),

    updateRecurring: async (id, patch) =>
      commit((data) => {
        const item = data.recurring.find((r) => r.id === id)
        if (!item) return false
        Object.assign(item, patch)
      }),

    deleteRecurring: async (id) =>
      commit((data) => {
        data.recurring = data.recurring.filter((r) => r.id !== id)
      }),

    updateProfile: async (patch) =>
      commit((data) => {
        if (!data.profile) return false
        if (patch.splits && !splitsAreValid(patch.splits)) return false
        Object.assign(data.profile, patch)
        if (patch.soundEnabled !== undefined) setSoundEnabled(patch.soundEnabled)
      }),

    saveMonthReview: async (cycleStart, mood, note) =>
      commit((data) => {
        const existing = data.reviews.find((r) => r.cycleStart === cycleStart)
        if (existing) {
          existing.mood = mood
          existing.note = note.trim()
          existing.updatedAt = nowISO()
        } else {
          data.reviews.push({
            id: uid(),
            cycleStart,
            mood,
            note: note.trim(),
            createdAt: nowISO(),
            updatedAt: nowISO(),
          })
        }
      }),

    resetAll: async () => {
      await store.clear()
      useJuiceStore.getState().clear()
      set({ data: emptyAppData(), loaded: true, needsAuth: store.kind === 'supabase' })
    },
  }
})
