# PennyPlay 🪙

A free personal budgeting PWA for ZAR that feels like a game — Duolingo × Monopoly GO × Revolut. Safe-to-spend daily numbers, salary-date budget cycles, savings goals with liquid rings, XP, streaks, quests, badges and Randy the Coin.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + gamification unit tests (Vitest)
npm run build      # production build + PWA service worker
```

The app runs **fully local by default** — no backend needed. Pick **“Try demo mode”** on the welcome screen to load three months of realistic ZAR data, or set up your own budget in under a minute.

## The budgeting engine

- **50/30/20 baseline** (Needs/Wants/Savings), fully adjustable with sliders. Allocation uses largest-remainder rounding so every cent of income lands in exactly one bucket.
- **Budget cycles start on your salary date** (default the 25th), not the 1st. Pay dates like the 31st clamp into short months correctly.
- **Safe-to-Spend** = (Wants budget − Wants spent) ÷ days remaining — the huge number on the dashboard. Pulses green when you're winning, shakes amber when you're close.
- **Cycle rollover**: unspent Wants at cycle end prompt a one-tap **sweep into Savings**.
- **Fun Fund** ❤️ — a first-class date-night sub-budget inside Wants with its own ring.
- **Recurring items** (rent, medical aid, debit orders, salary) auto-log on their day, idempotently, even if the app was closed for weeks.
- **Month tracker** 📆 — every cycle gets a report card (in/out/saved, boss result, top categories) plus your own mood + note review, stored in `monthly_reviews`.
- **Wealth** 💎 — annual view (last 12 cycles charted with yearly totals), a net-worth tracker (assets − liabilities + goal savings, stored in `assets`), and a crystal-ball projector: *"save R X/month for Y at Z% growth → you'll have R N"* (compound interest, unit-tested).

All money maths lives in `src/lib/engine/` as pure functions with unit tests (`npm test`). Amounts are integer cents, displayed as `R 1 234,56`. Business days are computed in `Africa/Johannesburg` regardless of device timezone.

## The game layer

- **XP** for good money actions: log expense +10, day under safe-to-spend +50, savings contribution +100, no-spend day +75.
- **Levels & ranks**: Budget Rookie → Coin Collector → Money Master → Wealth Wizard → Rand Royalty. Each rank unlocks an app accent theme.
- **Streaks**: daily logging flame 🔥 with earnable streak freezes 🧊 (one per month, cap two), plus a weekly under-budget streak.
- **Quests**: four weekly quests and the monthly **boss battle** — hit your savings target to defeat the boss 🐲.
- **Trophy cabinet**: 13 collectible badges, silhouetted until earned.
- **Juice**: coin rain on income, confetti on wins, liquid goal rings, milestone fireworks, level-up crest reveals, WebAudio coin sounds (no audio assets), Season Recap stories at cycle end.

## Tech

- React 18 + Vite + TypeScript + Tailwind CSS v4, framer-motion, zustand, canvas-confetti
- Installable PWA (`vite-plugin-pwa`), offline-tolerant: local mode persists to localStorage; Supabase mode queues writes and syncs when back online
- Fonts self-hosted via Fontsource (Baloo 2 for display numbers, Nunito for body)

### Project layout

```
src/lib/engine/         cycle, allocation, safe-to-spend, rollover, recurring, insights
src/lib/gamification/   xp, levels, streaks, quests, badges
src/lib/data/           types, adapters (local + Supabase), demo seed
src/state/              zustand stores (app data + juice queue)
src/components/         UI kit (Button3D, rings, number pad, Randy…) + JuiceHost
src/screens/            onboarding, dashboard, add, quests, goals, insights, profile…
supabase/               migrations (schema + RLS + triggers), edge functions
supabase/functions/     award-xp
```

## Wiring a real Supabase backend (optional)

The repo is **code-ready** for Supabase — schema, RLS and server-side XP are all in `supabase/`:

1. Create a project at [supabase.com](https://supabase.com), then link and push the migrations:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
2. Deploy the edge functions:
   ```bash
   supabase functions deploy award-xp
   ```
3. Copy `.env.example` → `.env` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
4. (Optional) enable the Google provider in Authentication → Providers for one-tap sign-in

Security model:

- **RLS on every table**, scoped to `auth.uid()`; quest/badge catalogs are read-only to clients.
- **XP can't be gamed from the client**: `xp_events` has no client insert policy. XP is written only by `security definer` DB triggers (expense/contribution) and the `award-xp` edge function, which re-verifies day-close awards, no-spend days and quest claims server-side. Every award is idempotent via `(user_id, ref_id)`.
- New signups get a profile + default categories via an `auth.users` trigger.

## Notifications

Two different mechanisms, because they solve different problems:

**Local notifications** (`src/lib/notifications.ts`) fire while the app is
open — daily log reminder, payday, overspend warning, streak-at-risk, and
the welcome greeting on sign-up. No backend involved. Off until the user
grants permission; sign-up asks, and Profile has the toggles.

**Web Push** (`src/lib/push.ts` + `public/push-sw.js`) reaches people who
have stopped opening the app. Sign-up registers the browser, and a weekly
job nudges anyone whose `last_log_date` is over 7 days old:

```
pg_cron (Sun 16:00 UTC / 18:00 SAST)
  └─ public.run_weekly_push()      reads the shared token from push_config
       └─ pg_net POST → push-weekly edge function
            └─ VAPID-signed POST → each browser's push service
                 └─ push-sw.js shows the notification
```

The nudge is sent **without a payload** — encrypting one buys nothing when
the copy is generic, and a bare push has far fewer ways to fail. The
wording therefore lives in `public/push-sw.js`, not on the server.

The VAPID keypair is minted by the `push-key` function on first call and
stored in `push_config` (service role only, no client policies), so the
private key never has to be pasted anywhere. To test a send immediately:

```sql
select public.run_weekly_push(true);  -- true = ignore the 7-day filter
```

**iOS caveat:** Safari only grants push to a PWA the user has added to
their Home Screen. In a normal iPhone tab `subscribeToPush()` returns
false and the app quietly falls back to local notifications only.

## Phase 2 (designed, stubbed in Profile → Coming soon)

Push-notification nudges · CSV bank statement import · Partner/shared budgets.
