/**
 * Browser glue for "add to home screen".
 *
 * Chromium fires `beforeinstallprompt` once, very early — often before React
 * has mounted — so the listener is registered at boot from `main.tsx` and the
 * event is parked in this module-level store. Components read it through
 * `useSyncExternalStore`. The pure "what should we offer this device" logic
 * lives in `./install`.
 */

/** The Chromium-only event that lets us open the install sheet on demand. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallSnapshot {
  /** A prompt event is parked and can be replayed. */
  canPrompt: boolean
  /** Running from the home screen, or inside the native shell. */
  standalone: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let snapshot: InstallSnapshot = { canPrompt: false, standalone: false }
const listeners = new Set<() => void>()
let watching = false

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // Native shell (App Store / Play build) — nothing to add to a home screen.
  const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.()) return true
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari's own flag, which predates display-mode.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function set(next: InstallSnapshot): void {
  if (next.canPrompt === snapshot.canPrompt && next.standalone === snapshot.standalone) return
  snapshot = next
  for (const listener of listeners) listener()
}

/** Start listening. Safe to call more than once; call as early as possible. */
export function watchInstallPrompt(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  set({ canPrompt: false, standalone: readStandalone() })

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's mini-infobar; our own button replays it instead.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    set({ ...snapshot, canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    set({ canPrompt: false, standalone: true })
  })
  // Installing from the browser menu flips display-mode without an event.
  window
    .matchMedia?.('(display-mode: standalone)')
    .addEventListener?.('change', (event) => {
      if (event.matches) set({ canPrompt: false, standalone: true })
    })
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot
}

/** Server snapshot for SSR/hydration — nothing installable without a window. */
export const SERVER_INSTALL_SNAPSHOT: InstallSnapshot = { canPrompt: false, standalone: false }

/** Replay the parked prompt. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  await event.prompt()
  const { outcome } = await event.userChoice
  // The event is single-use — drop it whichever way they chose.
  deferred = null
  const accepted = outcome === 'accepted'
  set({ canPrompt: false, standalone: snapshot.standalone || accepted })
  return accepted
}
