import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell config (App Store + Play Store builds). The web app is
 * bundled into the native projects from `dist` — run
 * `npm run build && npx cap sync` before opening Xcode / Android Studio.
 * Both platforms ship @capacitor/local-notifications so the weekly and
 * monthly budget reminders fire even when the app is closed (see
 * src/lib/reminders.ts and STORES.md).
 */
const config: CapacitorConfig = {
  appId: 'app.pennyplay.budget',
  appName: 'PennyPlay',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1A1033',
  },
  plugins: {
    LocalNotifications: {
      // Show reminders as banners (with sound + badge) even when the app
      // is open in the foreground on iOS.
      presentationOptions: ['banner', 'list', 'sound', 'badge'],
      iconColor: '#7C3AED',
    },
  },
}

export default config
