/**
 * Recurring incomes/expenses (rent, medical aid, salary…) materialise into
 * real entries on their day of month. Materialisation is idempotent: each
 * occurrence carries a deterministic key and `lastMaterialized` advances,
 * so replays and catch-ups (app closed for weeks) never double-log.
 */

import { addDays } from '../dates'
import type { AppData, RecurringItem } from '../data/types'
import { clampDay, parseISO, toISO } from '../dates'

export function occurrenceKey(itemId: string, dateISO: string): string {
  return `${itemId}:${dateISO}`
}

const MAX_CATCHUP_MONTHS = 24

/**
 * All due dates for `item` with fromExclusive < due ≤ toInclusive.
 * The nominal day clamps into short months (31st → 28 Feb).
 */
export function dueOccurrences(
  item: Pick<RecurringItem, 'dayOfMonth' | 'active'>,
  fromExclusive: string,
  toInclusive: string,
): string[] {
  if (!item.active || toInclusive <= fromExclusive) return []

  const out: string[] = []
  let { y, m } = parseISO(fromExclusive)

  for (let i = 0; i <= MAX_CATCHUP_MONTHS; i++) {
    const due = toISO(y, m, clampDay(y, m, item.dayOfMonth))
    if (due > toInclusive) break
    if (due > fromExclusive) out.push(due)
    if (m === 12) {
      y += 1
      m = 1
    } else {
      m += 1
    }
  }
  return out
}

/** Lower bound (exclusive) to backfill dues already passed in the current cycle. */
export function recurringBackfillFrom(cycleStart: string, accountStart: string): string {
  return addDays(cycleStart > accountStart ? cycleStart : accountStart, -1)
}

function occurrencePrefix(itemId: string): string {
  return `${itemId}:`
}

/** Push one recurring item's due dates into the income / expense ledger. */
export function materializeRecurringItem(
  data: AppData,
  item: RecurringItem,
  fromExclusive: string,
  toInclusive: string,
  when: string,
  newId: () => string,
): void {
  if (!item.active) return

  for (const due of dueOccurrences(item, fromExclusive, toInclusive)) {
    const key = occurrenceKey(item.id, due)
    if (item.kind === 'expense' && item.categoryId) {
      const existing = data.transactions.find((t) => t.occurrenceKey === key)
      if (existing) {
        existing.amountCents = item.amountCents
        existing.categoryId = item.categoryId
        existing.note = item.name
      } else {
        data.transactions.push({
          id: newId(),
          amountCents: item.amountCents,
          categoryId: item.categoryId,
          note: item.name,
          date: due,
          createdAt: when,
          occurrenceKey: key,
        })
      }
    } else if (item.kind === 'income' && item.source) {
      const existing = data.incomes.find((i) => i.occurrenceKey === key)
      if (existing) {
        existing.amountCents = item.amountCents
        existing.source = item.source
        existing.note = item.name
      } else {
        data.incomes.push({
          id: newId(),
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
}

/** Materialise every active recurring item through `toInclusive`. */
export function materializeAllRecurring(
  data: AppData,
  toInclusive: string,
  when: string,
  newId: () => string,
): void {
  for (const item of data.recurring) {
    const from = item.lastMaterialized ?? addDays(toInclusive, -1)
    materializeRecurringItem(data, item, from, toInclusive, when, newId)
    item.lastMaterialized = toInclusive
  }
}

/** Keep ledger rows in sync when a recurring template is edited. */
export function syncRecurringLedgerEntries(data: AppData, item: RecurringItem): void {
  const prefix = occurrencePrefix(item.id)
  for (const t of data.transactions) {
    if (!t.occurrenceKey?.startsWith(prefix)) continue
    t.amountCents = item.amountCents
    t.note = item.name
    if (item.categoryId) t.categoryId = item.categoryId
  }
  for (const i of data.incomes) {
    if (!i.occurrenceKey?.startsWith(prefix)) continue
    i.amountCents = item.amountCents
    i.note = item.name
    if (item.source) i.source = item.source
  }
}

/** Drop all ledger rows that came from a recurring template. */
export function purgeRecurringLedgerEntries(data: AppData, itemId: string): void {
  const prefix = occurrencePrefix(itemId)
  data.transactions = data.transactions.filter((t) => !t.occurrenceKey?.startsWith(prefix))
  data.incomes = data.incomes.filter((i) => !i.occurrenceKey?.startsWith(prefix))
}
