import { describe, expect, it } from 'vitest'
import {
  EXPLORE_SECONDS,
  gateModeFor,
  gateSecondsFor,
  remainingExploreSeconds,
} from './plusGate'

describe('gateModeFor', () => {
  it('skips without a profile or with an active membership', () => {
    expect(gateModeFor(null, false)).toBe('skip')
    expect(gateModeFor(undefined, false)).toBe('skip')
    expect(gateModeFor({ isDemo: false }, true)).toBe('skip')
    expect(gateModeFor({ isDemo: true }, true)).toBe('skip')
  })

  it('gates every unpaid session — demo and real accounts alike', () => {
    expect(gateModeFor({ isDemo: true }, false)).toBe('demo')
    expect(gateModeFor({ isDemo: false }, false)).toBe('real')
  })
})

describe('gateSecondsFor', () => {
  it('defaults to the 30-second explore window', () => {
    expect(EXPLORE_SECONDS).toBe(30)
    expect(gateSecondsFor(null)).toBe(30)
  })

  it('honours an explicit override (including zero)', () => {
    expect(gateSecondsFor(5)).toBe(5)
    expect(gateSecondsFor(0)).toBe(0)
  })
})

describe('remainingExploreSeconds', () => {
  const t0 = Date.parse('2026-07-18T09:00:00Z')

  it('counts down from the persisted start', () => {
    expect(remainingExploreSeconds(30, t0, t0)).toBe(30)
    expect(remainingExploreSeconds(30, t0, t0 + 10_000)).toBe(20)
    expect(remainingExploreSeconds(30, t0, t0 + 29_500)).toBeCloseTo(0.5)
  })

  it('never goes negative — a refresh cannot restart the window', () => {
    expect(remainingExploreSeconds(30, t0, t0 + 30_000)).toBe(0)
    expect(remainingExploreSeconds(30, t0, t0 + 86_400_000)).toBe(0)
  })

  it('ignores a start clock skewed into the future', () => {
    expect(remainingExploreSeconds(30, t0 + 60_000, t0)).toBe(30)
  })
})
