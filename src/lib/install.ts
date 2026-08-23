/**
 * "Add to home screen" — the PWA install path.
 *
 * Chromium (Android, desktop) fires `beforeinstallprompt`, which we stash so
 * a button can open the native install sheet on demand. iOS Safari has no
 * such event: the only route is Share → Add to Home Screen, so there we show
 * the steps instead. This module is the pure decision half — the React glue
 * lives in `components/ui/InstallAppButton`.
 */

export type InstallPlatform = 'ios' | 'android' | 'other'

export interface InstallEnv {
  userAgent: string
  /** iPadOS 13+ reports a desktop Mac UA — touch points give it away. */
  maxTouchPoints?: number
  /** Launched from the home screen already (or inside the native shell). */
  standalone: boolean
  /** A `beforeinstallprompt` event has been captured and can be replayed. */
  canPrompt: boolean
}

export type InstallState =
  /** Nothing to offer — it is already an app on this device. */
  | { kind: 'installed'; platform: InstallPlatform }
  /** One tap: replay the browser's own install prompt. */
  | { kind: 'prompt'; platform: InstallPlatform }
  /** No prompt available — walk them through the menu by hand. */
  | { kind: 'steps'; platform: InstallPlatform }

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent.toLowerCase()
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  // iPadOS 13+ masquerades as desktop Safari; a touchscreen Mac does not exist.
  if (/macintosh/.test(ua) && maxTouchPoints > 1) return 'ios'
  return 'other'
}

export function installState(env: InstallEnv): InstallState {
  const platform = detectPlatform(env.userAgent, env.maxTouchPoints)
  if (env.standalone) return { kind: 'installed', platform }
  if (env.canPrompt) return { kind: 'prompt', platform }
  return { kind: 'steps', platform }
}

/** Manual fallback instructions, per platform. */
export const INSTALL_STEPS: Record<InstallPlatform, string[]> = {
  ios: [
    'Tap the Share button at the bottom of Safari',
    'Scroll down and tap “Add to Home Screen”',
    'Tap “Add” — Randy lands on your home screen',
  ],
  android: [
    'Tap the ⋮ menu at the top-right of Chrome',
    'Tap “Install app” or “Add to Home screen”',
    'Confirm — PennyPlay installs like any other app',
  ],
  other: [
    'Open your browser’s menu',
    'Choose “Install app” or “Add to Home screen”',
    'Confirm — PennyPlay opens in its own window',
  ],
}

/** Short label for the platform, for button copy. */
export const PLATFORM_LABEL: Record<InstallPlatform, string> = {
  ios: 'iPhone & iPad',
  android: 'Android',
  other: 'this device',
}
