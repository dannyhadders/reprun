# TODO

Feedback from using the app at the gym, 2026-11-16. Ticked when shipped.

## Bugs

- [x] **Workout stuck "saved on this phone, not uploaded"**: Try again failed, Sign in again went to the home page and the workout disappeared from view. Show pending uploads everywhere, retry on open, return to the same page after sign-in, and say clearly when the sign-in has expired. Real cause: the API started requiring the ALLOWED_EMAIL secret (5c7f7cc) and the worker had none, so every request got a 403 since midday.
- [x] **Banner under the status bar**: page had no safe-area top padding.

## Logging a workout

- [x] **Export a finished workout**: copy it to the clipboard as plain text to paste into ChatGPT or send to a PT. On the finish screen, every logged workout, and the not-uploaded banner.
- [x] **Add exercise picker**: searching shows a dropdown of matches with your previous and best for each.
- [x] **Leave a workout running**: go back to the main menu while a workout is in progress. A banner on every page shows it with the rest timer and opens it again.
- [x] **Notes**: on a set (tap the set number) and on the whole workout; both go up with it and into the copied text. Routines already take notes per exercise in the plan text (e.g. `Bench – 3x8-10; pause at the bottom`).
- [x] **Collapse exercises**: accordion per exercise during a workout, with ticked sets still visible when it's closed (e.g. "3/4 ✓").
- [x] **Tick / untick sets**: already works. Make sure a collapsed exercise shows what's done.
- [x] **Confirm removing a set** when it has any data in it.

## Workouts list

- [x] **Edit instead of delete**: drop the per-set edit/delete icons and the Delete button on each workout. One Edit button opens the whole workout for editing (sets, title, notes), with Delete tucked inside that.

## Phone feel

- [x] **No zoom**: stop pinch zoom and the iOS zoom-in when tapping a text box.
- [ ] **Screen stays on**: already asks for a wake lock during a workout. Check it actually holds on iPhone (needs iOS 16.4+ and the installed app).

## Settings

- [x] **About page**: app version and an update log. Add a CLAUDE.md so every commit adds a line to the log.

## Self-hosting

- [x] **Deploy to Cloudflare button** on workers.dev, no domain needed.
- [x] **`npm run setup`**: one terminal command. Tested end to end on a throwaway Worker, Access login included.
- [x] **AI setup guide** (`docs/SETUP-AI.md`) for Claude Code / Cursor.
- [ ] **Test the Deploy button** on a spare Cloudflare account. Check: does the build get past the database step without adding D1 Edit to its token, do the setup prompts accept empty values, and does the "Almost there" screen show until Access is on. Fix `docs/SETUP.md` with what's actually there.
- [ ] **Onboarding for new users** (self-hosted and phone-only): profile, a first routine, how the logger works. Phone-only shows it after the "start fresh / sample data" welcome; self-hosted after the first sign-in. Design once for both.
- [x] **Try it with no setup**: reprun.danielhadaway.dev keeps everything on the phone, with a welcome screen, sample data, backup reminders, and a backup file to move to your own copy later.
- [ ] **Phone-only on a real iPhone**: does Safari-tab data carry into the home-screen app (expect not), does Settings → This phone say "Protected", does Save a backup reach Files, and is the data still there after a week and an iOS update.

## Ideas

- [ ] **Edit an exercise**: on its page, rename it (typos), change its muscle, or merge it into another (all sets move over, the duplicate goes, PBs and suggestions recalculate). Renaming onto an existing name offers to merge. New Worker routes plus local.ts twins; back up prod before shipping, since merge rewrites history.

- [ ] **Feature toggles**: Settings → Features, a switch per optional feature. Off hides its tab, cards and buttons; the data stays. Do this first, then build each idea below behind its own switch.
- [ ] **Calories**: decide which first. (1) Burned: estimate per workout and run from body weight (MET values), small. (2) Food log: what you ate + calories, daily total vs a target, medium. (3) From a meal photo: needs a paid AI vision API, doesn't fit "free".
- [ ] **Photos** (progress pics, meals, gym notes): store in R2 (10 GB free), not D1. The app loads all of D1 in one `/api/data` call, so photos there would download every time. Shrink on the phone to ~200 KB first; D1 keeps only the R2 key. Needs an R2 binding, created by the button and `npm run setup` like the database. Local (no-setup) mode would keep them in IndexedDB.

## Later: desktop

From running the Blueprint checklist (danielhadaway.dev/blueprint) against RepRun. Phone comes first; these wait.

- [ ] **Keyboard focus rings**: `.input` sets `outline-none`; give buttons, tabs and inputs a `focus-visible` ring that shows on every surface.
- [ ] **Hover states**: cards and list rows that open something get a hover border/background so they read as clickable on a laptop.
