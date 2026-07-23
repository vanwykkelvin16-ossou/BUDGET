/**
 * The free 45-second preview. First-time visitors go straight into the app
 * — no sign-up — inside a seeded guest sandbox. The clock only burns while
 * the app is actually on screen (a refresh resumes where it left off), and
 * when it hits zero the trial is spent for good: sign-up is the only way
 * back in.
 */

export const TRIAL_SECONDS = 45
const SECONDS_OVERRIDE_KEY = 'pennyplay:trial-seconds' // test override
const KEY = 'pennyplay:trial:v1'
/** The guest preview's sandboxed app data — never the real data key. */
export const TRIAL_DATA_KEY = 'pennyplay:trial-data:v1'

export interface TrialRecord {
  /** Milliseconds of preview time already spent. */
  usedMs: number
  /** Latched once the clock runs out (or the guest opts out early). */
  expired: boolean
}

export type TrialState = 'unused' | 'active' | 'expired'

/* Pure core — unit-testable without a browser. ---------------------- */

export function trialSecondsLeftFor(t: TrialRecord, totalSeconds: number): number {
  if (t.expired) return 0
  return Math.max(0, totalSeconds - t.usedMs / 1000)
}

export function trialStateFor(t: TrialRecord, totalSeconds: number): TrialState {
  if (t.expired || trialSecondsLeftFor(t, totalSeconds) <= 0) return 'expired'
  return t.usedMs > 0 ? 'active' : 'unused'
}

export function consumeTrialFor(t: TrialRecord, ms: number, totalSeconds: number): TrialRecord {
  const next: TrialRecord = { ...t, usedMs: t.usedMs + Math.max(0, ms) }
  if (trialSecondsLeftFor(next, totalSeconds) <= 0) next.expired = true
  return next
}

/* Browser-backed wrappers. ------------------------------------------ */

export function trialTotalSeconds(): number {
  try {
    const n = Number(localStorage.getItem(SECONDS_OVERRIDE_KEY))
    return Number.isFinite(n) && n > 0 ? n : TRIAL_SECONDS
  } catch {
    return TRIAL_SECONDS
  }
}

export function loadTrial(): TrialRecord {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { usedMs: 0, expired: false }
    const parsed = JSON.parse(raw) as Partial<TrialRecord>
    return { usedMs: Number(parsed.usedMs) || 0, expired: Boolean(parsed.expired) }
  } catch {
    return { usedMs: 0, expired: false }
  }
}

function saveTrial(t: TrialRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* storage unavailable */
  }
}

export function trialState(): TrialState {
  return trialStateFor(loadTrial(), trialTotalSeconds())
}

export function trialSecondsLeft(): number {
  return trialSecondsLeftFor(loadTrial(), trialTotalSeconds())
}

/** Burn `ms` of preview time; returns the seconds remaining. */
export function consumeTrial(ms: number): number {
  const next = consumeTrialFor(loadTrial(), ms, trialTotalSeconds())
  saveTrial(next)
  return trialSecondsLeftFor(next, trialTotalSeconds())
}

/** The preview is over — from here on, sign-up is the only way in. */
export function expireTrial(): void {
  saveTrial({ ...loadTrial(), expired: true })
}

/** Drop the guest sandbox once the trial ends. */
export function clearTrialData(): void {
  try {
    localStorage.removeItem(TRIAL_DATA_KEY)
  } catch {
    /* storage unavailable */
  }
}
