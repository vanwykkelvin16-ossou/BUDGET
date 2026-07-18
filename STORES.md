# Shipping PennyPlay to the app stores

Everything repo-side is prepared. What remains needs the store accounts,
signing keys and the final "submit" clicks — those can only be done by the
app's owner. Follow the two tracks below.

**Already in this repo / live app:**

- Store-grade web manifest (`id`, `lang`, `categories`, screenshots, maskable icon)
- Privacy policy at `https://budget-omega-ochre.vercel.app/privacy` (works without an account)
- Digital Asset Links placeholder at `public/.well-known/assetlinks.json`
- Capacitor iOS project in `ios/` and Android project in `android/`
  (both `app.pennyplay.budget`)
- **Scheduled budget reminders** via `@capacitor/local-notifications` on both
  platforms: weekly budget check-in (Mon 08:00), monthly budget planner
  (every pay day 09:00), Sunday recap (17:00) and achievement alerts. They
  are scheduled on-device — no push server or Firebase account needed — and
  fire even when the app is closed.
- Store assets in `store/`: 1024×1024 App Store icon, Apple 6.7″ screenshots
  (1290×2796), Play screenshots (1170×2532)

---

## Track 1 — Google Play (no Mac needed)

The Play build ships from the Capacitor Android project in `android/`, so
the notification reminders work with the app closed (a plain TWA/PWABuilder
wrapper cannot schedule notifications).

1. **Create a Google Play Console account** at
   [play.google.com/console](https://play.google.com/console) — $25 once.
2. On any machine with Android Studio installed, clone this repo and run:

   ```sh
   npm ci
   npm run build
   npx cap sync android
   npx cap open android
   ```

3. In Android Studio: *Build → Generate Signed App Bundle* — create (and
   keep!) an upload keystore, or enrol in Play App Signing (recommended).
   This produces the `.aab`.
4. In Play Console: **Create app → PennyPlay** (App, Free), then upload the
   `.aab` under *Production → Create release*.
5. Fill in the store listing:
   - Short description: *"Budgeting that feels like a game — know your fun
     money for today, every day."*
   - Screenshots: use `store/screenshots/play/`
   - App icon: `public/icon-512.png`
   - Privacy policy URL: `https://budget-omega-ochre.vercel.app/privacy`
   - **Data safety form**: select *"No data collected"* — all data stays on
     the device (truthful as long as Supabase sync stays unconfigured).
6. Complete the content-rating questionnaire (finance app, no user-generated
   content → rated "Everyone") and submit. Review typically takes a few days.

The app is bundled inside the binary, so ship an updated `.aab` (repeat
step 2 + bump `versionCode` in `android/app/build.gradle`) when you want
store users to get new features.

## Track 2 — Apple App Store (needs a Mac + $99/year)

1. **Join the Apple Developer Program** at
   [developer.apple.com](https://developer.apple.com) — $99/year.
2. On a Mac with Xcode installed, clone this repo and run:

   ```sh
   npm ci
   npm run build
   npx cap sync ios
   npx cap open ios
   ```

3. In Xcode:
   - Select the *App* target → *Signing & Capabilities* → pick your team;
     bundle ID is already `app.pennyplay.budget`.
   - Set the app icon: drag `store/icon-1024.png` into
     *Assets.xcassets → AppIcon* (Xcode 15+ needs only the 1024px image).
4. *Product → Archive* → *Distribute App* → App Store Connect. Then in
   [appstoreconnect.apple.com](https://appstoreconnect.apple.com):
   - Create the app (name PennyPlay, primary language English (South Africa)
     if available, category Finance).
   - Screenshots: use `store/screenshots/apple/` (6.7″ display set).
   - Privacy: *"Data Not Collected"* nutrition label; policy URL
     `https://budget-omega-ochre.vercel.app/privacy`.
   - Test through **TestFlight** first, then *Submit for Review*.
5. **Review tip (guideline 4.2, minimum functionality):** Apple rejects thin
   website wrappers. PennyPlay ships bundled inside the binary (not a URL
   wrapper), works fully offline, and uses the native Local Notifications
   plugin for scheduled weekly/monthly budget reminders and achievement
   alerts — mention this in the *Review Notes* field.

## Updating the apps later

- **Play**: repeat Track 1 step 2's four commands, bump `versionCode` in
  `android/app/build.gradle`, generate a new signed `.aab` and upload it.
- **Apple**: repeat Track 2 step 2's four commands, bump the version in
  Xcode, archive and upload again.
