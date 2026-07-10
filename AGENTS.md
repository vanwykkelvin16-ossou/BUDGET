# AGENTS.md

## Cursor Cloud specific instructions

PennyPlay is a single-product Vite + React + TypeScript budgeting PWA. Standard commands live in `README.md` and `package.json` scripts; the notes below only cover non-obvious startup/run caveats.

- **Runs fully local by default.** No backend, database, or network is required. On the welcome screen choose **"Try demo mode"** to seed realistic data. App data persists to `localStorage`, so to reset state clear site data for `localhost:5173`.
- **Dev server:** `npm run dev` (Vite on port `5173`). Start it in a persistent tmux session so it survives across commands.
- **Tests:** `npm test` (Vitest, `vitest run`) — pure-function engine/gamification unit tests, no browser or network needed.
- **Build:** `npm run build` (`tsc -b && vite build`, emits `dist/` + PWA service worker). `npm run build:pages` targets GitHub Pages (`dist-pages`, hash router); `npm run build:preview` is a single-file preview.
- **No linter is configured** (no ESLint/Prettier/Biome). There is no `lint` script; type-checking happens via `tsc -b` during `npm run build`.
- **Playwright** is a devDependency but no browser download is needed for dev/test/build; installs use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (see `vercel.json`). There are no wired Playwright test scripts.
- **Supabase is optional.** The data-store factory (`src/lib/data/index.ts`) only uses the Supabase backend when both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set (see `.env.example`); otherwise it silently falls back to `LocalStore`. Leave these unset for local development.
