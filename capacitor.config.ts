import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell config (App Store build). The web app is bundled into the
 * native project from `dist` — run `npm run build && npx cap sync ios`
 * before opening Xcode. Google Play uses the TWA route instead (see
 * STORES.md), so only the iOS platform lives in this repo.
 */
const config: CapacitorConfig = {
  appId: 'app.pennyplay.budget',
  appName: 'PennyPlay',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1A1033',
  },
}

export default config
