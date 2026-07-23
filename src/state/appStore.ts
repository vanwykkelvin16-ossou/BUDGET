/**
 * The app's brain-stem: holds AppData in memory, applies every action
 * (expenses, income, goals, quests, sweeps), awards XP/streaks/badges via
 * the pure gamification modules, emits juice events, and persists through
 * the active DataStore adapter.
 */

import { create } from 'zustand'
import type {
  AppData,
  Asset,
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
import { LocalStore } from '../lib/data/store'
import { getDataStore } from '../lib/data'
import { DEFAULT_CATEGORIES, makeDefaultProfile } from '../lib/data/defaults'
import { buildDemoData } from '../lib/data/seedDemo'
import { loadMembership, membershipStatus } from '../lib/membership'
import { clearTrialData, expireTrial, TRIAL_DATA_KEY, trialState } from '../lib/trial'
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
import {
  materializeAllRecurring,
  purgeRecurringLedgerEntries,
  recurringBackfillFrom,
  syncRecurringLedgerEntries,
} from '../lib/engine/recurring'
import { buildSnapshot, incomesInCycle, sumCents } from '../lib/engine/insights'
import { reconcile } from '../lib/engine/reconcile'
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
  /** First-time visitor exploring the free 45-second guest preview. */
  guestTrial: boolean
  /** An active PennyPlay Plus year on this device/account. */
  plusActive: boolean
  /** SAST day the in-memory state was last computed for. */
  currentDay: string
  init: () => Promise<void>
  reload: () => Promise<void>
  /** The 45s preview ran out (or the guest opted out) — on to sign-up. */
  endGuestTrial: () => void
  /** Re-read membership state (after a payment lands). */
  refreshPlus: () => void
  createProfile: (params: {
    displayName: string
    surname: string
    username: string
    email: string
    phone: string
    salaryCents: number
    payDate: number
    splits: Profile['splits']
  }) => Promise<void>
  addExpense: (params: { amountCents: number; categoryId: string; note?: string }) => Promise<void>
  updateExpense: (id: string, patch: { amountCents?: number; categoryId?: string; note?: string }) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  addIncome: (params: { amountCents: number; source: IncomeSource; note?: string }) => Promise<void>
  updateIncome: (id: string, patch: { amountCents?: number; source?: IncomeSource; note?: string }) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  /** Re-run housekeeping when the SAST day rolls over while the app is open. */
  rolloverIfNewDay: () => Promise<void>
  /** Pick up changes another tab persisted to storage. */
  syncExternal: () => Promise<void>
  markNoSpendDay: () => Promise<void>
  contributeToGoal: (goalId: string, amountCents: number, source?: ContributionSource) => Promise<void>
  updateContribution: (id: string, patch: { amountCents?: number }) => Promise<void>
  deleteContribution: (id: string) => Promise<void>
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
  addAsset: (params: { name: string; icon: string; kind: Asset['kind']; amountCents: number }) => Promise<void>
  updateAsset: (id: string, patch: Partial<Pick<Asset, 'name' | 'icon' | 'kind' | 'amountCents'>>) => Promise<void>
  deleteAsset: (id: string) => Promise<void>
  resetAll: () => Promise<void>
}

// Mutable: the guest preview swaps in a sandboxed LocalStore so demo data
// never touches the real data key (or a Supabase sync queue).
let store: DataStore = getDataStore()

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

async function applyHousekeeping(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  const today = todaySAST()
  const data = runHousekeeping(get().data, today, nowISO())
  set({ data, currentDay: today })
  const synced = await store.persist(data)
  set({ data: reconcile(synced, today) })
}

export function runHousekeeping(input: AppData, today: string, when: string): AppData {
  const data = structuredClone(input)
  // Older persisted data may predate newer collections/fields.
  data.reviews ??= []
  data.assets ??= []
  const profile = data.profile
  if (!profile) return data
  profile.funFundName ??= 'date nights'
  profile.funFundNote ??= 'Fun Fund'
  profile.surname ??= ''
  profile.username ??= ''
  profile.email ??= ''
  profile.phone ??= ''

  /* 1 — materialise recurring items due since last time. */
  materializeAllRecurring(data, today, when, uid)

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

  /* 6 — make every derived number agree with the ledger. */
  reconcile(data, today)

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
    // Every commit ends by reconciling derived data with the ledger, so
    // whatever changed, everything downstream matches immediately.
    reconcile(data, today)
    set({ data, currentDay: today })
    if (juice.length > 0) useJuiceStore.getState().push(...juice)
    const synced = await store.persist(data)
    set({ data: reconcile(synced, today) })
  }

  /** Guest preview: park the app in a seeded sandbox — no sign-up needed. */
  async function startGuestTrial() {
    store = new LocalStore(TRIAL_DATA_KEY)
    const resumed = await store.load()
    const base = resumed?.profile ? resumed : buildDemoData()
    const data = runHousekeeping(base, todaySAST(), nowISO())
    set({ loaded: true, needsAuth: false, guestTrial: true, data })
    const synced = await store.persist(data)
    set({ data: reconcile(synced, todaySAST()) })
  }

  return {
    data: emptyAppData(),
    loaded: false,
    needsAuth: false,
    guestTrial: false,
    plusActive: membershipStatus(loadMembership()) === 'active',
    currentDay: todaySAST(),

    init: async () => {
      if (get().loaded) return
      store = getDataStore()
      const plusActive = membershipStatus(loadMembership()) === 'active'
      const stored = await store.load()
      if (!stored?.profile) {
        const signedIn = store.kind === 'supabase' && Boolean(await store.userId?.())
        // Brand-new visitor (no account, no profile): a free 45-second
        // look around the app before any sign-up is asked for.
        if (!signedIn && trialState() !== 'expired') {
          set({ plusActive })
          await startGuestTrial()
          return
        }
        // No profile yet → Onboarding (sign-up lives there). Returning users
        // sign in from the welcome screen; we never gate on a separate Auth page.
        set({ loaded: true, needsAuth: false, guestTrial: false, plusActive, data: stored ?? emptyAppData() })
        return
      }
      const data = runHousekeeping(stored, todaySAST(), nowISO())
      setSoundEnabled(data.profile?.soundEnabled ?? true)
      set({ loaded: true, needsAuth: false, guestTrial: false, plusActive, data })
      const synced = await store.persist(data)
      set({ data: reconcile(synced, todaySAST()) })
    },

    reload: async () => {
      set({ loaded: false, needsAuth: false, guestTrial: false, data: emptyAppData() })
      await get().init()
    },

    endGuestTrial: () => {
      expireTrial()
      clearTrialData()
      store = getDataStore()
      // Always land on Onboarding — sign-up and returning sign-in live there.
      set({
        guestTrial: false,
        loaded: true,
        needsAuth: false,
        data: emptyAppData(),
      })
    },

    refreshPlus: () => {
      set({ plusActive: membershipStatus(loadMembership()) === 'active' })
    },

    createProfile: async (params) => {
      if (!splitsAreValid(params.splits)) throw new Error('Splits must sum to 100')
      const today = todaySAST()
      const profile = makeDefaultProfile({
        displayName: params.displayName,
        surname: params.surname,
        username: params.username,
        email: params.email,
        phone: params.phone,
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
      const synced = await store.persist(data)
      set({ data: synced })
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

    updateExpense: async (id, patch) =>
      commit((data) => {
        const txn = data.transactions.find((t) => t.id === id)
        if (!txn) return false
        if (patch.amountCents !== undefined && patch.amountCents <= 0) return false
        Object.assign(txn, patch)
      }),

    deleteExpense: async (id) =>
      commit((data) => {
        const before = data.transactions.length
        data.transactions = data.transactions.filter((t) => t.id !== id)
        if (data.transactions.length === before) return false
        // Its +10 XP goes with it — the audit log matches the ledger.
        data.xpEvents = data.xpEvents.filter((e) => e.refId !== id)
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

    updateIncome: async (id, patch) =>
      commit((data) => {
        const income = data.incomes.find((i) => i.id === id)
        if (!income) return false
        if (patch.amountCents !== undefined && patch.amountCents <= 0) return false
        Object.assign(income, patch)
      }),

    deleteIncome: async (id) =>
      commit((data) => {
        const before = data.incomes.length
        data.incomes = data.incomes.filter((i) => i.id !== id)
        return data.incomes.length !== before ? undefined : false
      }),

    rolloverIfNewDay: async () => {
      const state = get()
      if (!state.loaded || !state.data.profile) return
      const today = todaySAST()
      if (today === state.currentDay) return
      const data = runHousekeeping(state.data, today, nowISO())
      set({ data, currentDay: today })
      const synced = await store.persist(data)
      set({ data: reconcile(synced, today) })
    },

    syncExternal: async () => {
      const state = get()
      if (!state.loaded) return
      const stored = await store.load()
      if (!stored?.profile) return
      stored.reviews ??= []
      stored.assets ??= []
      set({ data: reconcile(structuredClone(stored), todaySAST()) })
    },

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

    updateContribution: async (id, patch) =>
      commit((data) => {
        const contribution = data.contributions.find((c) => c.id === id)
        if (!contribution) return false
        if (patch.amountCents !== undefined && patch.amountCents <= 0) return false
        Object.assign(contribution, patch)
        // reconcile() re-derives the goal total, milestone latches and
        // achievement from the contribution ledger.
      }),

    deleteContribution: async (id) =>
      commit((data) => {
        const before = data.contributions.length
        data.contributions = data.contributions.filter((c) => c.id !== id)
        if (data.contributions.length === before) return false
        // Its +100 XP goes with it — the audit log matches the ledger.
        data.xpEvents = data.xpEvents.filter((e) => e.refId !== id)
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

    addRecurring: async (params) => {
      await commit((data, _juice, today) => {
        if (params.amountCents <= 0) return false
        const profile = data.profile
        if (!profile) return false
        const cycle = cycleFor(today, profile.payDate)
        const accountStart = profile.createdAt.slice(0, 10)
        data.recurring.push({
          id: uid(),
          kind: params.kind,
          name: params.name,
          amountCents: params.amountCents,
          dayOfMonth: Math.min(31, Math.max(1, params.dayOfMonth)),
          categoryId: params.categoryId,
          source: params.source,
          active: true,
          // Backfill any due dates already passed in this pay cycle.
          lastMaterialized: recurringBackfillFrom(cycle.start, accountStart),
          createdAt: nowISO(),
        })
      })
      await applyHousekeeping(get, set)
    },

    updateRecurring: async (id, patch) => {
      await commit((data, _juice, today) => {
        const item = data.recurring.find((r) => r.id === id)
        if (!item) return false
        const wasInactive = !item.active
        const dayChanged =
          patch.dayOfMonth !== undefined && patch.dayOfMonth !== item.dayOfMonth
        Object.assign(item, patch)
        if (dayChanged || (patch.active === true && wasInactive)) {
          purgeRecurringLedgerEntries(data, id)
          const profile = data.profile
          if (!profile) return false
          const cycle = cycleFor(today, profile.payDate)
          const accountStart = profile.createdAt.slice(0, 10)
          item.lastMaterialized = recurringBackfillFrom(cycle.start, accountStart)
        } else {
          syncRecurringLedgerEntries(data, item)
        }
      })
      await applyHousekeeping(get, set)
    },

    deleteRecurring: async (id) =>
      commit((data) => {
        purgeRecurringLedgerEntries(data, id)
        data.recurring = data.recurring.filter((r) => r.id !== id)
      }),

    updateProfile: async (patch) => {
      const salaryChanged = patch.salaryCents !== undefined
      const payDateChanged = patch.payDate !== undefined

      await commit((data, _juice, today) => {
        const profile = data.profile
        if (!profile) return false
        if (patch.splits && !splitsAreValid(patch.splits)) return false
        Object.assign(profile, patch)
        if (patch.soundEnabled !== undefined) setSoundEnabled(patch.soundEnabled)

        // Settings are the source of truth for the salary: changing the
        // amount or payday flows through the recurring salary engine and
        // the current cycle's already-landed salary, so the whole app
        // (allocations, safe-to-spend, rings) follows immediately.
        if (salaryChanged || payDateChanged) {
          const cycle = cycleFor(today, profile.payDate)

          let engine = data.recurring.find(
            (r) => r.kind === 'income' && r.source === 'salary' && r.active,
          )
          if (!engine) {
            engine = {
              id: uid(),
              kind: 'income',
              name: 'Salary',
              amountCents: profile.salaryCents,
              dayOfMonth: profile.payDate,
              source: 'salary',
              active: true,
              lastMaterialized: addDays(cycle.start, -1),
              createdAt: nowISO(),
            }
            data.recurring.push(engine)
          } else {
            engine.amountCents = profile.salaryCents
            engine.dayOfMonth = profile.payDate
          }

          const inThisCycle = data.incomes.filter(
            (i) => i.source === 'salary' && inCycle(i.date, cycle),
          )
          if (inThisCycle.length > 0) {
            if (salaryChanged) {
              // The recurring-materialised entry is the paycheque; extra
              // manually-logged salary entries are left alone.
              const primary = inThisCycle.find((i) => i.occurrenceKey) ?? inThisCycle[0]
              primary.amountCents = profile.salaryCents
            }
          } else {
            // Payday moved into a cycle with no salary yet — let
            // housekeeping materialise it on the new cycle start.
            engine.lastMaterialized = addDays(cycle.start, -1)
          }
        }
      })

      if (salaryChanged || payDateChanged) {
        const today = todaySAST()
        const data = runHousekeeping(get().data, today, nowISO())
        set({ data })
        const synced = await store.persist(data)
        set({ data: reconcile(synced, today) })
      }
    },

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

    addAsset: async ({ name, icon, kind, amountCents }) =>
      commit((data) => {
        if (!name.trim() || amountCents < 0) return false
        data.assets.push({
          id: uid(),
          name: name.trim(),
          icon,
          kind,
          amountCents,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        })
      }),

    updateAsset: async (id, patch) =>
      commit((data) => {
        const asset = data.assets.find((a) => a.id === id)
        if (!asset) return false
        if (patch.amountCents !== undefined && patch.amountCents < 0) return false
        Object.assign(asset, patch, { updatedAt: nowISO() })
      }),

    deleteAsset: async (id) =>
      commit((data) => {
        const before = data.assets.length
        data.assets = data.assets.filter((a) => a.id !== id)
        return data.assets.length !== before ? undefined : false
      }),

    resetAll: async () => {
      await store.clear()
      if (get().guestTrial) {
        // Resetting inside the guest preview spends it — sign-up is next.
        expireTrial()
        store = getDataStore()
      }
      useJuiceStore.getState().clear()
      // Always land on Onboarding after a wipe — sign-in lives there too.
      set({
        data: emptyAppData(),
        loaded: true,
        guestTrial: false,
        needsAuth: false,
        plusActive: membershipStatus(loadMembership()) === 'active',
      })
    },
  }
})
