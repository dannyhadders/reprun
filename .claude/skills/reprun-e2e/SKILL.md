---
name: reprun-e2e
description: Drive the RepRun app end to end in a real browser (iPhone-sized WebKit, the engine inside Safari, and/or desktop Chromium) against a private phone-only build of the working tree. Covers first run, sample data, every tab, the workout logger (routine, empty, PB, resume, discard), plan import, body weight and backup/restore, with screenshots for a look-and-feel review. Use when asked to e2e / browser-test RepRun, check a change didn't break the app, screenshot its screens, or when invoked as /reprun-e2e.
---

# /reprun-e2e: the app, end to end, in a browser

It's a browser, not a simulator. It uses Playwright's WebKit at iPhone 15 size, behaving like the home-screen app
(`navigator.standalone`), so no "add to home screen" page. Each check gets a brand-new browser profile, so each one
starts from an empty phone. Nothing touches D1, the live site or the demo.

```bash
node .claude/skills/reprun-e2e/run.cjs                                 # every check, iPhone
DEVICE=iphone,desktop node .claude/skills/reprun-e2e/run.cjs           # and at 1280×900 in Chromium
ONLY=log-routine,pb node .claude/skills/reprun-e2e/run.cjs             # just these
```

| Option | Effect |
|---|---|
| `DEVICE` | `iphone` (default), `desktop`, or `iphone,desktop` |
| `ONLY` | check ids, comma-separated (an unknown id is a setup error) |
| `OUT` | run folder, default `~/reprun-e2e-runs/<time>`: screenshots, `results.json`, the backup file |
| `BASE` | test a copy that's already running instead of building one, e.g. `http://localhost:5173`. Only the phone-only build has the welcome screen the checks start from |

Without `BASE`, `run.cjs` builds the phone-only copy of the working tree into `node_modules/.reprun-e2e`
(never `dist/`, which other sessions rebuild), serves it on port 4317 for the run, and stops it afterwards.

## Steps

1. **One-time install** (outside the repo, so nothing is added to package.json):
   `npm i --prefix ~/.cache/reprun-e2e playwright-core && (cd ~/.cache/reprun-e2e && npx playwright-core install webkit chromium)`
2. **Run it.** Both devices take about two minutes. Exit code: 0 all passed, 1 something failed, 2 setup error.
3. **Read failures.** Each failing check has a `-FAIL.png`. A check also fails on any page error or console error, and
   when a tab is wider than the screen (sideways scroll). Look at the screenshot before calling it a regression: the
   checks find things by their accessible names ("Set 1 done", "Finish"), so a renamed button breaks the harness,
   not the app. Say which it is.
4. **Look-and-feel pass.** Open the screenshots (`sample-tour-*` has every tab full-page) and check them against the
   brand book (`site/public/brand/index.html`): tokens, spacing, nothing clipped or overlapping, tap targets.
   Report what looks off with the screenshot path.
5. **Report** a table: check, device, result, what broke, screenshot.

## Extending it

A check is one entry in `CHECKS` in `run.cjs`: `id: [title, async t => { … }]`. Start with `begin(t, sample)` (fresh
copy, or with sample data), drive `t.page` (Playwright), assert with `t.expect(locator, 'what should be true')`,
screenshot with `t.shot('label')`. When a feature ships, add a check for it in the same commit.

## What it can't see

- **The Worker and D1.** It tests the phone-only copy (`src/lib/local.ts`), which shares rules with the Worker
  (`shared/`) but not its code. `scripts/check-local.ts` and a manual look at `npm run dev` cover the server side.
- **A real iPhone.** WebKit on a Mac isn't iOS Safari: number boxes show desktop spinner arrows, no haptics, no
  keyboard, no safe-area notch, no iOS share sheet (the backup check forces the download path).
- **Strava, push alerts, the service worker offline, the share pictures' contents.**
