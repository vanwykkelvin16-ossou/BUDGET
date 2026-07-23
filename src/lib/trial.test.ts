import { describe, expect, it } from 'vitest'
import {
  consumeTrialFor,
  TRIAL_SECONDS,
  trialSecondsLeftFor,
  trialStateFor,
  type TrialRecord,
} from './trial'

const fresh: TrialRecord = { usedMs: 0, expired: false }

describe('45-second guest preview', () => {
  it('starts unused with the full 45 seconds', () => {
    expect(TRIAL_SECONDS).toBe(45)
    expect(trialStateFor(fresh, 45)).toBe('unused')
    expect(trialSecondsLeftFor(fresh, 45)).toBe(45)
  })

  it('burns only the time consumed and survives a refresh mid-way', () => {
    let t = consumeTrialFor(fresh, 10_000, 45)
    expect(trialStateFor(t, 45)).toBe('active')
    expect(trialSecondsLeftFor(t, 45)).toBe(35)
    // "Refresh": same record picked up again, keeps ticking from 35s.
    t = consumeTrialFor({ ...t }, 5_000, 45)
    expect(trialSecondsLeftFor(t, 45)).toBe(30)
  })

  it('latches expired at zero — no way to wind it back', () => {
    const spent = consumeTrialFor(fresh, 45_000, 45)
    expect(spent.expired).toBe(true)
    expect(trialStateFor(spent, 45)).toBe('expired')
    expect(trialSecondsLeftFor(spent, 45)).toBe(0)
    // Even a bigger allowance later can't resurrect a spent trial.
    expect(trialStateFor(spent, 90)).toBe('expired')
  })

  it('ignores negative time and stays expired once marked', () => {
    const t = consumeTrialFor({ usedMs: 0, expired: true }, -5_000, 45)
    expect(t.expired).toBe(true)
    expect(trialSecondsLeftFor(t, 45)).toBe(0)
  })
})
