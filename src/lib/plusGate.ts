/**
 * Session gate timing for PennyPlay Plus.
 *
 * Everyone without an active membership — demo explorers and freshly
 * activated accounts alike — gets a 30-second look around, then the
 * subscription paywall appears and must be paid before the app opens up.
 * The explore window is persisted per mode so a refresh cannot restart it.
 */

export const EXPLORE_SECONDS = 30
export const GATE_SECONDS_KEY = 'pennyplay:gate-seconds'

export type GateMode = 'demo' | 'real' | 'skip'

const EXPLORE_KEYS: Record<Exclude<GateMode, 'skip'>, string> = {
  demo: 'pennyplay:explore-started:demo:v1',
  real: 'pennyplay:explore-started:v1',
}

export function gateModeFor(
  profile: { isDemo: boolean } | null | undefined,
  membershipActive: boolean,
): GateMode {
  if (!profile) return 'skip'
  if (membershipActive) return 'skip'
  return profile.isDemo ? 'demo' : 'real'
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

export function gateSecondsFor(override: number | null = readGateSecondsOverride()): number {
  return override ?? EXPLORE_SECONDS
}

/** Epoch ms the explore window started for this mode, or null. */
export function readExploreStarted(mode: Exclude<GateMode, 'skip'>): number | null {
  try {
    const raw = localStorage.getItem(EXPLORE_KEYS[mode])
    if (!raw) return null
    const n = Date.parse(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Start the explore clock once — later calls keep the original start. */
export function markExploreStarted(
  mode: Exclude<GateMode, 'skip'>,
  at: number = Date.now(),
): void {
  try {
    if (!localStorage.getItem(EXPLORE_KEYS[mode])) {
      localStorage.setItem(EXPLORE_KEYS[mode], new Date(at).toISOString())
    }
  } catch {
    /* ignore */
  }
}

/** Seconds of free exploring left, never negative. Pure — pass the clock in. */
export function remainingExploreSeconds(
  totalSeconds: number,
  startedAtMs: number,
  nowMs: number,
): number {
  const elapsed = Math.max(0, (nowMs - startedAtMs) / 1000)
  return Math.max(0, totalSeconds - elapsed)
}
