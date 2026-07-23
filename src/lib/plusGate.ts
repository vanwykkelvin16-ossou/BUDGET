/**
 * Session gate timing: demo users get a longer soft look; real non-members
 * get the hard 45-second paywall.
 */

export const DEMO_GATE_SECONDS = 90
export const REAL_GATE_SECONDS = 45
export const GATE_SECONDS_KEY = 'pennyplay:gate-seconds'

export type GateMode = 'soft' | 'hard' | 'skip'

export function gateModeFor(
  profile: { isDemo: boolean } | null | undefined,
  membershipActive: boolean,
): GateMode {
  if (!profile) return 'skip'
  if (membershipActive) return 'skip'
  return profile.isDemo ? 'soft' : 'hard'
}

/** Override via localStorage `pennyplay:gate-seconds` (tests / QA). */
export function readGateSecondsOverride(): number | null {
  try {
    const raw = localStorage.getItem(GATE_SECONDS_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function gateSecondsFor(
  mode: 'soft' | 'hard',
  override: number | null = readGateSecondsOverride(),
): number {
  if (override != null) return override
  return mode === 'soft' ? DEMO_GATE_SECONDS : REAL_GATE_SECONDS
}
