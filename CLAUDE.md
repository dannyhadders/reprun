# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RepRun: a self-hosted gym + running PWA (React 19, Vite, Tailwind 4, Chart.js) served by one Cloudflare
Worker with a D1 (SQLite) database, behind Cloudflare Access. Mostly used as an installed iPhone app.

## Working here

- Commit straight to `main`; a push deploys the live site and the public demo (Workers Builds). No branches.
- Before committing: `npx tsc -b`, `npx oxlint`, `npm run build`.
- One feature per commit, so any one can be reverted on its own.
- **Every user-facing change adds a line to `src/lib/changelog.ts`** under today's date (newest first, plain words, no jargon). It shows in Settings → About.
- Tick the item in `TODO.md` when it ships.
- The repo is public: no emails, secrets, database IDs or personal data in code or commits. Secrets live in Cloudflare (`ALLOWED_EMAIL`, `ACCESS_TEAM`, `ACCESS_AUD`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`).
- Never run `wrangler deploy` or remote D1 commands against the owner's live `reprun` / `reprun-demo` Workers; deploys happen by pushing, and the owner runs anything remote by hand.

## Brand

**Always follow the brand book** for anything people see: app screens, the website, share pictures, reels, carousels and copy (including changelog lines).
It's `site/public/brand/index.html`, live at https://reprun.co.uk/brand/ (unlisted). It covers colour tokens (with contrast), type scale,
the mark, buttons, components, motion timings, iPhone feel, voice (with say/don't-say examples), and every asset made so far.

- Use the tokens, never a new hex. The real values live in `src/index.css` (`@theme`, the app) and `site/public/index.html` (`:root`, the website); change a token in all three places at once.
- Adding a colour, component, animation or rule? Add it to the brand book in the same commit.
- The link-preview image (`og.jpg`, used by the website and the app) is rendered from `site/og/og.html`; the steps are in that file.
- New logos, screenshots, reels or carousels go in `site/public/brand/assets/` and get a card in section 09. Screenshots only from the demo's made-up data, never real history.

## Commands

```sh
npm run dev                     # Vite + the Worker locally (http://localhost:5173); needs .dev.vars (copy .dev.vars.example)
npm run db:migrate              # apply migrations to the local D1 (first run, and after adding a migration)
npm run build                   # scripts/config.mjs, then tsc -b, then vite build → dist/
npm run lint                    # oxlint
npx tsx scripts/check-plan.ts   # assert-based self-check: plan parser and progression
npx tsx scripts/check-local.ts  # assert-based self-check: the phone-only backend (import, restore, edits)
```

Local dev skips sign-in (requests to `localhost`). Put `DEMO=1` in `.dev.vars` to seed made-up history.

## Architecture

- **One Worker, one bundle.** `@cloudflare/vite-plugin` builds the SPA and `worker/index.ts` together. Non-`/api/*` requests go to static assets (SPA fallback); `/api/*` hits a hand-rolled router in `worker/index.ts` (`/api/data`, `import`, `sets`, `workouts`, `routines`, `strava/*`, …). No framework.
- **Whole-dataset sync.** The client loads everything with one `GET /api/data` (`src/lib/data.tsx`, `DataProvider`), caches it in localStorage for offline use, and derives every stat client-side in `buildModel` (`src/lib/stats.ts`): sessions, PBs, estimated 1RM, history per exercise. Pages read `useData()`; after a write they call `reload()`.
- **Writes go through `POST /api/import`** (`importPayload`) for workouts/activities/records/goals, deduped by `client_id` (logger) or date+source (sheet). Small edits use the REST-ish routes.
- **The live logger** (`/log`, `src/pages/Log.tsx`, outside `<Layout>`) keeps the workout in localStorage (`src/lib/session.ts`: pure helpers + persistence). Finished workouts go to an **outbox** and upload with retries, so nothing is lost offline or when the Access session has expired. `public/sw.js` is a hand-written service worker (assets cache-first, pages network-first, never `/api`).
- **`shared/`** is used by both the app and the Worker: `types.ts` (the `Data` shape), `plan.ts` (parses pasted PT/ChatGPT plans into routines and suggests weights: double progression), `catalogue.ts` (exercise aliases → canonical name + muscle), `strava.ts`, `sheet.ts` (spreadsheet import), `demo.ts` (made-up history).
- **Schema** is `migrations/*.sql`, applied on every deploy (`npm run release` / `deploy` / `setup`). Add a new numbered file; never edit an applied one.

## Auth (worker/index.ts, top of `fetch`)

Every `/api` request except on `localhost` and the demo must come through Cloudflare Access:
- `ALLOWED_EMAIL` unset, or a `*.workers.dev` host without `ACCESS_TEAM`+`ACCESS_AUD` → 403 "Almost there…", which the app shows as the `FinishSetup` screen (`src/lib/data.tsx`). The app matches on that message text.
- With `ACCESS_TEAM`+`ACCESS_AUD` it verifies Access's signed JWT (`accessEmail`). Without them (own domain only) it trusts the `cf-access-authenticated-user-email` header, which only Access can set there.

## Deploy targets (same repo, different config)

`wrangler.jsonc` is generic: `workers_dev: true`, D1 `reprun` with no `database_id` (Cloudflare auto-creates it).
- **The owner's live site**: Workers Builds runs `npm run build` + `npm run release` with build variables `REPRUN_DOMAIN` + `REPRUN_DATABASE_ID`. `scripts/config.mjs` swaps those into `wrangler.jsonc` at build time (custom domain, `workers_dev: false`, pinned database). Setting only one of them fails the build on purpose: no database ID would mean a new, empty database.
- **Public demo** (`env.demo`, `npm run build:demo` + `npm run release`): `DEMO=1` skips sign-in and Strava, seeds `shared/demo.ts`, and a 03:00 UTC cron wipes and reseeds it.
- **Phone-only** (`env.local`, Workers Builds: build `npm run build:local` + deploy `npx wrangler deploy`; by hand only `npm run deploy:local`, app.reprun.co.uk): no database, no sign-in. `__LOCAL__` (vite.config.ts) swaps `api()` for `src/lib/local.ts`, which runs the same routes over one `Data` object in localStorage. Import/restore rules live in `shared/backup.ts` and `shared/rules.ts` so the Worker and local.ts can't drift; any new `/api` route needs a local.ts twin. The code is dead (tree-shaken) in every other build: check with `grep -rl reprun.local dist/client` (0 outside the local build). Other builds also emit unreferenced `demo-*.js`/`strava-*.js` chunks from `startLocal`'s dynamic imports; they're never fetched.
- **Rest alerts** (`push/`, push.reprun.co.uk): its own Worker, used by every copy (live, demo, phone-only, self-hosted). The app (`src/lib/push.tsx`) sends only the phone's push address and when rest ends; a Durable Object per address sends an *empty* push at that time and deletes everything; `public/sw.js` shows "Rest over". Workers Builds deploy command `npx wrangler deploy -c push/wrangler.jsonc`; secret `VAPID_PRIVATE` (from `node push/keys.mjs`, must match `VAPID` in push.tsx; self-hosters can point at their own with build variables `VITE_PUSH_URL` + `VITE_PUSH_KEY`, docs/SETUP.md). Self-check: `npx tsx scripts/check-push.ts`. Test locally: `npx wrangler dev -c push/wrangler.jsonc`, then `VITE_PUSH_URL=http://localhost:8788 npm run build && npx vite preview` in Chrome (push needs the built app's service worker).
- **Website** (`site/`, reprun.co.uk): one static `site/public/index.html`, no build step, its own Worker (`site/wrangler.jsonc`, Workers Builds deploy command `npx wrangler deploy -c site/wrangler.jsonc`). Shares nothing with the app's build.
- **Deploy to Cloudflare button**: uses `npm run build` + `npm run deploy` (deploy before migrating, because the database only exists after the first deploy).
- **`npm run setup`** (`scripts/setup.mjs`): for other people's accounts. Creates a D1 named after the Worker, patches only the build output `dist/reprun/wrangler.json`, and tags its deploys `--message "reprun setup"`. It refuses any existing Worker that doesn't carry that tag; keep that check intact.
- `wrangler d1 migrations` doesn't follow the vite plugin's `.wrangler/deploy/config.json` redirect, hence `-c dist/reprun/wrangler.json` in the scripts.

## iPhone gotchas

- **Haptics**: iOS ticks only when a real finger tap lands on a `<label>` for an `<input switch>`. Put `<Tap />` (`src/lib/haptic.tsx`) inside a `relative` button. Not inside links (they cancel the click), submit buttons or disabled buttons.
- iOS caches home-screen icons and the manifest `start_url` at install; changes need the app removed and re-added.

## Docs

`docs/SETUP.md` (people self-hosting: button, own domain, Access steps verified on a real account), `docs/SETUP-AI.md` (instructions for an AI agent driving `npm run setup`). Keep them in step with the code.
