import { describe, expect, it } from 'vitest'
import {
  DEMO_GATE_SECONDS,
  REAL_GATE_SECONDS,
  gateModeFor,
  gateSecondsFor,
} from './plusGate'

describe('gateModeFor', () => {
  it('skips without a profile or with active membership', () => {
    expect(gateModeFor(null, false)).toBe('skip')
    expect(gateModeFor({ isDemo: false }, true)).toBe('skip')
    expect(gateModeFor({ isDemo: true }, true)).toBe('skip')
  })

  it('uses soft mode for demo and hard mode for real unpaid accounts', () => {
    expect(gateModeFor({ isDemo: true }, false)).toBe('soft')
    expect(gateModeFor({ isDemo: false }, false)).toBe('hard')
  })
})

describe('gateSecondsFor', () => {
  it('defaults to 90s soft and 45s hard', () => {
    expect(gateSecondsFor('soft', null)).toBe(DEMO_GATE_SECONDS)
    expect(gateSecondsFor('hard', null)).toBe(REAL_GATE_SECONDS)
  })

  it('honours an explicit override (including zero)', () => {
    expect(gateSecondsFor('soft', 5)).toBe(5)
    expect(gateSecondsFor('hard', 0)).toBe(0)
  })
})
