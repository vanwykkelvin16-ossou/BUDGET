/**
 * Pulse Budget domain types.
 *
 * Every monetary amount is an integer number of cents (ZAR).
 * Every date is an ISO `YYYY-MM-DD` string computed in Africa/Johannesburg.
 * These types mirror the Supabase schema in supabase/migrations/.
 */

export type Bucket = 'need' | 'want' | 'saving'

/** Percentage split across buckets. Must sum to 100. */
export interface BucketSplits {
  need: number
  want: number
  saving: number
}

export type IncomeSource =
  | 'salary'
  | 'freelance'
  | 'dividends'
  | 'refund'
  | 'gift'
  | 'other'

export interface Profile {
  id: string
  displayName: string
  salaryCents: number
  /** Day of month the salary lands and the budget cycle starts (1–31). */
  payDate: number
  splits: BucketSplits
  /** Fun/date-night sub-budget inside Wants, per cycle. */
  funFundCents: number
  xp: number
  /** Daily logging streak. */
  streakCount: number
  longestStreak: number
  streakFreezes: number
  /** Last SAST day the user logged activity (expense, income, no-spend mark). */
  lastLogDate: string | null
  /** 'YYYY-MM' of the last month a streak freeze was earned. */
  lastFreezeEarnedMonth: string | null
  /** Consecutive weeks ended under the Wants budget. */
  weeklyStreak: number
  /** Last SAST day that day-close XP awards were evaluated (inclusive). */
  lastEvaluatedDate: string | null
  /** Rank theme id currently applied (must be unlocked by level). */
  themeId: string
  darkMode: boolean
  soundEnabled: boolean
  onboarded: boolean
  isDemo: boolean
  createdAt: string
}

export interface Category {
  id: string
  name: string
  /** Emoji glyph shown inside the coloured badge circle. */
  icon: string
  /** Hex colour that this category "owns" in the UI. */
  color: string
  bucket: Bucket
  /** Counts toward the Fun/Date-Night sub-budget. */
  isFunFund: boolean
  isCustom: boolean
  sortOrder: number
}

export interface IncomeEntry {
  id: string
  amountCents: number
  source: IncomeSource
  note?: string
  /** Day the money landed (SAST). */
  date: string
  createdAt: string
  /** Set when materialised from a recurring item: `${recurringId}:${date}`. */
  occurrenceKey?: string
}

export interface Transaction {
  id: string
  amountCents: number
  categoryId: string
  note?: string
  date: string
  createdAt: string
  occurrenceKey?: string
}

export interface RecurringItem {
  id: string
  kind: 'expense' | 'income'
  name: string
  amountCents: number
  /** Day of month it fires (1–31, clamped to month length). */
  dayOfMonth: number
  /** Required for expenses. */
  categoryId?: string
  /** Required for incomes. */
  source?: IncomeSource
  active: boolean
  /** Last date (inclusive) for which an occurrence has been materialised. */
  lastMaterialized: string | null
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  icon: string
  color: string
  targetCents: number
  savedCents: number
  /** Auto-contribution from the Savings bucket each cycle (0 = off). */
  autoAllocateCents: number
  /** Milestone percentages already celebrated (25/50/75/100). */
  celebratedMilestones: number[]
  achievedAt: string | null
  createdAt: string
}

export type ContributionSource = 'manual' | 'auto' | 'sweep'

export interface GoalContribution {
  id: string
  goalId: string
  amountCents: number
  date: string
  source: ContributionSource
  createdAt: string
}

export interface MonthlySnapshot {
  id: string
  /** Cycle start date — also the snapshot's unique key. */
  cycleStart: string
  cycleEnd: string
  incomeCents: number
  allocated: Record<Bucket, number>
  spentByBucket: Record<Bucket, number>
  spentByCategory: Record<string, number>
  /** Goal contributions + sweep made during the cycle. */
  savedCents: number
  sweptCents: number
  swept: boolean
  bossDefeated: boolean
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Gamification                                                       */
/* ------------------------------------------------------------------ */

export type QuestMetric =
  | 'log_days'
  | 'category_under'
  | 'no_spend_weekend'
  | 'goal_contribution'
  | 'beat_budget'

export interface QuestDef {
  id: string
  title: string
  description: string
  icon: string
  kind: 'weekly' | 'boss'
  metric: QuestMetric
  /** Target in the metric's unit (days, cents…). */
  target: number
  /** Category the quest watches (category_under). */
  categoryId?: string
  rewardXp: number
}

export interface UserQuest {
  id: string
  questId: string
  /** ISO week key for weekly quests, cycle start date for the boss. */
  periodKey: string
  completedAt: string | null
  claimedAt: string | null
  createdAt: string
}

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legendary'

export interface BadgeDef {
  id: string
  name: string
  description: string
  emoji: string
  tier: BadgeTier
}

export interface UserBadge {
  badgeId: string
  earnedAt: string
}

export type XpReason =
  | 'log_expense'
  | 'under_sts_day'
  | 'savings_contribution'
  | 'no_spend_day'
  | 'quest_reward'
  | 'boss_defeated'
  | 'sweep'
  | 'streak_bonus'

export interface XpEvent {
  id: string
  amount: number
  reason: XpReason
  /** De-dupe key, e.g. the transaction id or `${reason}:${date}`. */
  refId: string
  date: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Whole-app data shape (what adapters persist)                       */
/* ------------------------------------------------------------------ */

export interface AppData {
  profile: Profile | null
  categories: Category[]
  incomes: IncomeEntry[]
  transactions: Transaction[]
  recurring: RecurringItem[]
  goals: Goal[]
  contributions: GoalContribution[]
  snapshots: MonthlySnapshot[]
  userQuests: UserQuest[]
  userBadges: UserBadge[]
  xpEvents: XpEvent[]
}

export const emptyAppData = (): AppData => ({
  profile: null,
  categories: [],
  incomes: [],
  transactions: [],
  recurring: [],
  goals: [],
  contributions: [],
  snapshots: [],
  userQuests: [],
  userBadges: [],
  xpEvents: [],
})
