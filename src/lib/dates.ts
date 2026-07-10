/**
 * Date utilities. The app's business day is defined in Africa/Johannesburg
 * (SAST, UTC+2, no DST) regardless of the device timezone. All business
 * dates are ISO `YYYY-MM-DD` strings; arithmetic happens in UTC space so the
 * host timezone can never skew a calculation.
 */

export const TZ = 'Africa/Johannesburg'

const sastFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in SAST as `YYYY-MM-DD`. */
export function todaySAST(now: Date = new Date()): string {
  return sastFormatter.format(now)
}

export interface YMD {
  y: number
  m: number // 1–12
  d: number
}

export function parseISO(iso: string): YMD {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toUTC(iso: string): Date {
  const { y, m, d } = parseISO(iso)
  return new Date(Date.UTC(y, m - 1, d))
}

const DAY_MS = 86_400_000

export function addDays(iso: string, n: number): string {
  const date = new Date(toUTC(iso).getTime() + n * DAY_MS)
  return date.toISOString().slice(0, 10)
}

export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS)
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Clamp a nominal day-of-month (e.g. pay date 31) into a real month. */
export function clampDay(y: number, m: number, day: number): number {
  return Math.min(day, daysInMonth(y, m))
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Monday-based day index: Mon=0 … Sun=6. */
export function dayOfWeekMon(iso: string): number {
  return (toUTC(iso).getUTCDay() + 6) % 7
}

export function isWeekend(iso: string): boolean {
  return dayOfWeekMon(iso) >= 5
}

/** Monday…Sunday bounds of the week containing `iso` (inclusive). */
export function weekBounds(iso: string): { start: string; end: string } {
  const start = addDays(iso, -dayOfWeekMon(iso))
  return { start, end: addDays(start, 6) }
}

/** ISO-8601 week key, e.g. `2026-W28`. */
export function isoWeekKey(iso: string): string {
  const date = toUTC(iso)
  // Shift to the Thursday of this week; its year is the ISO year.
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS)
  const isoYear = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "Tue 9 Jul" style label for feeds. */
export function formatDayLabel(iso: string, today?: string): string {
  if (today) {
    if (iso === today) return 'Today'
    if (iso === addDays(today, -1)) return 'Yesterday'
  }
  const { m, d } = parseISO(iso)
  return `${DAYS_SHORT[dayOfWeekMon(iso)]} ${d} ${MONTHS_SHORT[m - 1]}`
}

const DAYS_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]

/** "Thursday" style label. */
export function formatWeekdayLong(iso: string): string {
  return DAYS_FULL[dayOfWeekMon(iso)]
}

/** "9 July" style label. */
export function formatDateLong(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const { m, d } = parseISO(iso)
  return `${d} ${MONTHS[m - 1]}`
}

/** "July 2026" style label. */
export function formatMonthLabel(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const { y, m } = parseISO(iso)
  return `${MONTHS[m - 1]} ${y}`
}
