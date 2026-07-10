/**
 * Seeded categories. Ids are stable strings (not uuids) so quests, demo data
 * and the Supabase seed can reference them deterministically.
 */

import type { Category, Profile } from './types'
import { DEFAULT_SPLITS } from '../engine/allocate'

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-housing', name: 'Housing', icon: '🏠', color: '#8B5CF6', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 0 },
  { id: 'cat-groceries', name: 'Groceries', icon: '🛒', color: '#A3E635', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 1 },
  { id: 'cat-transport', name: 'Transport / Fuel', icon: '⛽', color: '#38BDF8', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 2 },
  { id: 'cat-medical', name: 'Medical Aid', icon: '🏥', color: '#F472B6', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 3 },
  { id: 'cat-insurance', name: 'Insurance', icon: '🛡️', color: '#94A3B8', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 4 },
  { id: 'cat-subscriptions', name: 'Subscriptions', icon: '📺', color: '#C084FC', bucket: 'need', isFunFund: false, isCustom: false, sortOrder: 5 },
  { id: 'cat-eating-out', name: 'Eating Out', icon: '🍔', color: '#FB923C', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 6 },
  { id: 'cat-date-nights', name: 'Date Nights', icon: '❤️', color: '#FF5C7A', bucket: 'want', isFunFund: true, isCustom: false, sortOrder: 7 },
  { id: 'cat-entertainment', name: 'Entertainment', icon: '🎮', color: '#22D3EE', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 8 },
  { id: 'cat-personal-care', name: 'Personal Care', icon: '💇', color: '#E879F9', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 9 },
  { id: 'cat-giving', name: 'Giving', icon: '🎁', color: '#FACC15', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 10 },
  { id: 'cat-other', name: 'Other', icon: '📦', color: '#A8A29E', bucket: 'want', isFunFund: false, isCustom: false, sortOrder: 11 },
]

/** Colours offered when creating custom categories. */
export const CATEGORY_COLORS = [
  '#8B5CF6', '#A3E635', '#38BDF8', '#F472B6', '#FB923C',
  '#FF5C7A', '#22D3EE', '#E879F9', '#FACC15', '#34D399',
  '#94A3B8', '#A8A29E',
]

export const CATEGORY_ICONS = [
  '🏠', '🛒', '⛽', '🏥', '🛡️', '📺', '🍔', '❤️', '🎮', '💇', '🎁', '📦',
  '✈️', '🐶', '👶', '📚', '💊', '🚗', '☕', '👗', '🏋️', '🎵', '🧾', '💡',
]

export function makeDefaultProfile(params: {
  displayName: string
  salaryCents: number
  payDate: number
  splits?: Profile['splits']
  funFundCents?: number
  isDemo?: boolean
  nowISO?: string
}): Profile {
  const splits = params.splits ?? DEFAULT_SPLITS
  // Default Fun Fund: ~20% of the Wants bucket, rounded to R50.
  const wantsCents = Math.floor((params.salaryCents * splits.want) / 100)
  const defaultFun = Math.round(wantsCents * 0.2 / 5000) * 5000

  return {
    id: 'local-user',
    displayName: params.displayName,
    salaryCents: params.salaryCents,
    payDate: params.payDate,
    splits,
    funFundCents: params.funFundCents ?? defaultFun,
    funFundName: 'date nights',
    funFundNote: 'Fun Fund',
    xp: 0,
    streakCount: 0,
    longestStreak: 0,
    streakFreezes: 1,
    lastLogDate: null,
    lastFreezeEarnedMonth: null,
    weeklyStreak: 0,
    lastEvaluatedDate: null,
    themeId: 'rookie',
    darkMode: true,
    soundEnabled: true,
    onboarded: true,
    isDemo: params.isDemo ?? false,
    createdAt: params.nowISO ?? new Date().toISOString(),
  }
}
