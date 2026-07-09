/**
 * Budget cycle math. A cycle starts on the user's pay date (default the
 * 25th) and runs until the day before the next pay date. Pay dates larger
 * than a month's length clamp to the month's last day (pay date 31 → 28 Feb).
 * Cycles are half-open intervals: [start, end).
 */

import { addDays, clampDay, diffDays, parseISO, toISO } from '../dates'

export interface Cycle {
  /** First day of the cycle (pay day), inclusive. */
  start: string
  /** Next cycle's pay day, exclusive. */
  end: string
}

function payDayInMonth(y: number, m: number, payDate: number): string {
  return toISO(y, m, clampDay(y, m, payDate))
}

function nextMonth(y: number, m: number): [number, number] {
  return m === 12 ? [y + 1, 1] : [y, m + 1]
}

function prevMonth(y: number, m: number): [number, number] {
  return m === 1 ? [y - 1, 12] : [y, m - 1]
}

/** The cycle containing `dateISO` for a given pay date. */
export function cycleFor(dateISO: string, payDate: number): Cycle {
  const { y, m } = parseISO(dateISO)
  const anchorThisMonth = payDayInMonth(y, m, payDate)

  if (dateISO >= anchorThisMonth) {
    const [ny, nm] = nextMonth(y, m)
    return { start: anchorThisMonth, end: payDayInMonth(ny, nm, payDate) }
  }
  const [py, pm] = prevMonth(y, m)
  return { start: payDayInMonth(py, pm, payDate), end: anchorThisMonth }
}

/** The cycle immediately before `cycle`. */
export function prevCycle(cycle: Cycle, payDate: number): Cycle {
  return cycleFor(addDays(cycle.start, -1), payDate)
}

/** The cycle immediately after `cycle`. */
export function nextCycle(cycle: Cycle, payDate: number): Cycle {
  return cycleFor(cycle.end, payDate)
}

export function daysInCycle(cycle: Cycle): number {
  return diffDays(cycle.start, cycle.end)
}

/**
 * Days remaining in the cycle counting today as one of them.
 * On the last day of a cycle this is 1; never below 0.
 */
export function daysRemaining(dateISO: string, cycle: Cycle): number {
  return Math.max(0, diffDays(dateISO, cycle.end))
}

export function daysElapsed(dateISO: string, cycle: Cycle): number {
  return Math.max(0, diffDays(cycle.start, dateISO))
}

export function inCycle(dateISO: string, cycle: Cycle): boolean {
  return dateISO >= cycle.start && dateISO < cycle.end
}

/** Stable identifier for a cycle (its start date). */
export function cycleKey(cycle: Cycle): string {
  return cycle.start
}
