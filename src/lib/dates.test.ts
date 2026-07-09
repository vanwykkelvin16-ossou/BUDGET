import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  clampDay,
  daysInMonth,
  dayOfWeekMon,
  diffDays,
  isWeekend,
  isoWeekKey,
  monthKey,
  todaySAST,
  weekBounds,
} from './dates'

describe('todaySAST', () => {
  it('is computed in Africa/Johannesburg (UTC+2), not host time', () => {
    // 23:30 UTC on 9 July is already 01:30 on 10 July in SAST.
    expect(todaySAST(new Date('2026-07-09T23:30:00Z'))).toBe('2026-07-10')
    expect(todaySAST(new Date('2026-07-09T12:00:00Z'))).toBe('2026-07-09')
    // 21:59 UTC is 23:59 SAST — still the same day.
    expect(todaySAST(new Date('2026-07-09T21:59:00Z'))).toBe('2026-07-09')
    // 22:00 UTC is midnight SAST — next day.
    expect(todaySAST(new Date('2026-07-09T22:00:00Z'))).toBe('2026-07-10')
  })
})

describe('day arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29') // leap year
  })

  it('diffs days', () => {
    expect(diffDays('2026-06-25', '2026-07-25')).toBe(30)
    expect(diffDays('2026-07-25', '2026-06-25')).toBe(-30)
    expect(diffDays('2026-07-09', '2026-07-09')).toBe(0)
  })

  it('adds months with clamping', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 7)).toBe(31)
  })

  it('clamps days into short months', () => {
    expect(clampDay(2026, 2, 31)).toBe(28)
    expect(clampDay(2028, 2, 31)).toBe(29)
    expect(clampDay(2026, 7, 25)).toBe(25)
  })
})

describe('weeks', () => {
  it('computes Monday-based day of week', () => {
    expect(dayOfWeekMon('2026-07-06')).toBe(0) // Monday
    expect(dayOfWeekMon('2026-07-12')).toBe(6) // Sunday
  })

  it('detects weekends', () => {
    expect(isWeekend('2026-07-11')).toBe(true) // Saturday
    expect(isWeekend('2026-07-12')).toBe(true)
    expect(isWeekend('2026-07-09')).toBe(false) // Thursday
  })

  it('computes week bounds Mon–Sun', () => {
    expect(weekBounds('2026-07-09')).toEqual({ start: '2026-07-06', end: '2026-07-12' })
    expect(weekBounds('2026-07-06')).toEqual({ start: '2026-07-06', end: '2026-07-12' })
    expect(weekBounds('2026-07-12')).toEqual({ start: '2026-07-06', end: '2026-07-12' })
  })

  it('computes ISO week keys', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-07-09')).toBe('2026-W28')
    // 2027-01-01 is a Friday — belongs to 2026's last ISO week.
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
  })
})

describe('keys', () => {
  it('month keys', () => {
    expect(monthKey('2026-07-09')).toBe('2026-07')
  })
})
