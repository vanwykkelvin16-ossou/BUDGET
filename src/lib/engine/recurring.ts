/**
 * Recurring incomes/expenses (rent, medical aid, salary…) materialise into
 * real entries on their day of month. Materialisation is idempotent: each
 * occurrence carries a deterministic key and `lastMaterialized` advances,
 * so replays and catch-ups (app closed for weeks) never double-log.
 */

import { clampDay, parseISO, toISO } from '../dates'
import type { RecurringItem } from '../data/types'

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
