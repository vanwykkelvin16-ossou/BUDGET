# Shipping PennyPlay to the app stores

Everything repo-side is prepared. What remains needs the store accounts,
signing keys and the final "submit" clicks — those can only be done by the
app's owner. Follow the two tracks below.

**Already in this repo / live app:**

- Store-grade web manifest (`id`, `lang`, `categories`, screenshots, maskable icon)
- Privacy policy at `https://budget-omega-ochre.vercel.app/privacy` (works without an account)
- Terms & conditions at `https://budget-omega-ochre.vercel.app/terms` (works without an account)
- Digital Asset Links placeholder at `public/.well-known/assetlinks.json`
- Capacitor iOS project in `ios/` (`app.pennyplay.budget`)
- Store assets in `store/`: 1024×1024 App Store icon, Apple 6.7″ screenshots
  (1290×2796), Play screenshots (1170×2532)

---

## Track 1 — Google Play (do this first; no Mac needed)

1. **Create a Google Play Console account** at
   [play.google.com/console](https://play.google.com/console) — $25 once.
2. Go to **[pwabuilder.com](https://www.pwabuilder.com)**, enter
   `https://budget-omega-ochre.vercel.app`, and click **Package for stores →
   Android**. Set:
   - Package ID: `app.pennyplay.budget`
   - App name: `PennyPlay`
   - Signing: let PWABuilder generate a key **or** use Play App Signing
     (recommended). Download the `.aab` + the signing details it gives you.
3. In Play Console: **Create app → PennyPlay** (App, Free), then upload the
   `.aab` under *Production → Create release*.
4. **Digital Asset Links** — this removes the browser bar so the app looks
   fully native:
   - In Play Console open *Setup → App signing* and copy the
     **SHA-256 certificate fingerprint**.
   - Paste it into `public/.well-known/assetlinks.json` in this repo
     (replacing `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE`),
     merge to `main`, and let Vercel deploy.
5. Fill in the store listing:
   - Short description: *"Budgeting that feels like a game — know your fun
     money for today, every day."*
   - Screenshots: use `store/screenshots/play/`
   - App icon: `public/icon-512.png`
   - Privacy policy URL: `https://budget-omega-ochre.vercel.app/privacy`
   - Terms URL: `https://budget-omega-ochre.vercel.app/terms`
   - **Data safety form**: select *"No data collected"* — all data stays on
     the device (truthful as long as Supabase sync stays unconfigured).
6. Complete the content-rating questionnaire (finance app, no user-generated
   content → rated "Everyone") and submit. Review typically takes a few days.

Once live, every deploy to Vercel updates the store app automatically — the
package is a trusted wrapper around the live URL.

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
   - Terms of Use URL (if asked):
     `https://budget-omega-ochre.vercel.app/terms`.
   - Test through **TestFlight** first, then *Submit for Review*.
5. **Review tip (guideline 4.2, minimum functionality):** Apple rejects thin
   website wrappers. PennyPlay ships bundled inside the binary (not a URL
   wrapper), works fully offline, and has notifications — mention this in the
   *Review Notes* field. If a reviewer still pushes back, the next step is
   adding a Capacitor native plugin or two (haptics, local notifications) —
   one command each, ask your developer/agent.

## Updating the apps later

- **Play**: nothing to do — it tracks the live site.
- **Apple**: repeat step 2's four commands, bump the version in Xcode,
  archive and upload again.
