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
- [x] **Onboarding for new users** (all three copies): five swipeable screens, six in a phone's browser (add to home screen). Goals (up to two), weight, age, sex, all optional; ChatGPT prompt that quizzes first, starter routines by goal, Strava activities.csv import. Skip on every screen; Settings → Profile → Show the intro again.
- [x] **Try it with no setup**: reprun.danielhadaway.dev keeps everything on the phone, with a welcome screen, sample data, backup reminders, and a backup file to move to your own copy later.
- [ ] **Phone-only on a real iPhone**: does Safari-tab data carry into the home-screen app (expect not), does Settings → This phone say "Protected", does Save a backup reach Files, and is the data still there after a week and an iOS update.

## Ideas

- [x] **Swap an exercise mid-workout** (shuffle button): same-muscle list, search, or a new name; today only. Feedback 2026-11-18.
- [x] **Set notes easier to find**: "+ Add note" under the set you're on (option D of five mockups); last time's notes under each set, in the history sheet and on the exercise page.
- [x] **Rest picker as a button**: timer icon + time, opens big time buttons.
- [ ] **Swap: keep it in the routine** ("Use it in Pull day from now on"), if people keep swapping the same thing.
- [ ] **Edit set notes on a logged workout** (Workouts → Edit keeps them but can't change them).
- [ ] **Edit an exercise**: on its page, rename it (typos), change its muscle, or merge it into another (all sets move over, the duplicate goes, PBs and suggestions recalculate). Renaming onto an existing name offers to merge. New Worker routes plus local.ts twins; back up prod before shipping, since merge rewrites history.

- [ ] **Feature toggles**: Settings → Features, a switch per optional feature. Off hides its tab, cards and buttons; the data stays. Do this first, then build each idea below behind its own switch.
- [ ] **Calories**: decide which first. (1) Burned: estimate per workout and run from body weight (MET values), small. (2) Food log: what you ate + calories, daily total vs a target, medium. (3) From a meal photo: needs a paid AI vision API, doesn't fit "free".
- [ ] **Photos** (progress pics, meals, gym notes): store in R2 (10 GB free), not D1. The app loads all of D1 in one `/api/data` call, so photos there would download every time. Shrink on the phone to ~200 KB first; D1 keeps only the R2 key. Needs an R2 binding, created by the button and `npm run setup` like the database. Local (no-setup) mode would keep them in IndexedDB.

## Phone feel, round 2

UX ideas from 2026-11-17, after the pressed-states / confirms / celebrations pass.

- [ ] **Tap "Last time" to copy it** into that set's kg and reps.
- [ ] **− / + on kg (±2.5) and reps (±1)**, or swipe up/down on the field: less typing with sweaty hands.
- [x] **Fold a finished exercise** automatically once every set is ticked. (No auto-scroll: tried it, it jumped the page.)
- [x] **Rest timer bar** that drains, with the numbers going green near the end and a buzz (Android) at 0.
- [x] **PB badge on the set** the moment it's ticked, not only on the finish screen.
- [ ] **`enterKeyHint="next"`** on kg/reps so Return moves kg → reps → next set.
- [ ] **Plate calculator**: tap the kg for "20 kg bar + 15 + 2.5 each side".
- [x] **More menu slides up**, and swipes down to close.
- [x] **Next up on Home**: the routine due next, one tap to start it.
- [x] **Home stats count up** on the first open.
- [x] **Pull to refresh**: reloads, sends anything waiting, and syncs Strava when it's connected.
- [x] **"Uploaded ✓" message** when a waiting workout reaches the server.
- [x] **Loading placeholders** on the very first load instead of "Loading…"; after that, open on the last copy straight away.
- [x] **Share card**: the finish screen makes an image (time, sets, volume, PBs) to post or send.
- [x] **Swipe a set left to delete it**, any set, not just the last. Two steps like Mail: the swipe shows a bin, the bin deletes.
- Not doable from the phone alone: a lock-screen rest alert. iOS pauses a web app's timers once the screen is off; the wake lock above is the workaround. Doable with a push from the server: see "Rest-over notification" below.

## Phone feel, round 3: app abilities

What else a home-screen web app can do on iPhone, picked 2026-11-17.

- [ ] **Rest-over notification** (Web Push, iOS 16.4+, installed app only): when rest starts, the app asks the Worker to send "Rest over: Bench 60 kg × 8" after the rest time, so it reaches the lock screen and Watch. VAPID keys as secrets, a push subscriptions table (new migration), a delayed send (Durable Object alarm), cancel when the next set is ticked early. Ask for permission from a button, never on open. Not on the demo; phone-only needs a small push endpoint or goes without. Later: "4 days since your last session" nudges on the same setup.
- [x] **App icon badge** (`navigator.setAppBadge`): number of workouts waiting to upload; clears when they're sent. iPhone needs notifications allowed: Settings → Badge on the app icon → Turn on.
- [x] **Spoken cues** (`speechSynthesis`, works through AirPods while the app is open): "Rest over. Next: squat, 100 kilos, 5 reps." On by default; speaker button in the logger header mutes it (the beep stays).
- [x] **Android install polish**: maskable icon (the logo fills Android's icon shape), `id`, description, categories, and three phone screenshots from the demo so Chrome's install screen looks like a store listing. iPhone ignores all of it.
- [ ] **Page transitions** (View Transitions API, Safari 18+): slide/fade between pages instead of a flash. Skip where the browser doesn't have it.
- [x] **"New version" prompt**: a new `sw.js` waits; a banner says "New version ready", Update switches and reloads once (a running workout survives), ✕ leaves it for the next cold start. Checks for a new version each time the app comes to the front.
- [x] **Clear old cached files**: one cache per build (`reprun-<sha>`), filled with the shell and its files when the new version installs, every other build's cache deleted when it takes over. Tested: update, then reopen offline.

## Later: desktop

From running the Blueprint checklist (danielhadaway.dev/blueprint) against RepRun. Phone comes first; these wait.

- [ ] **Button text contrast**: `.btn` is white on indigo, 2.98:1 (needs 4.5:1). Use `text-bg` (dark), as the website does (6.56:1). Found building the brand book.
- [ ] **Keyboard focus rings**: `.input` sets `outline-none`; give buttons, tabs and inputs a `focus-visible` ring that shows on every surface.
- [ ] **Hover states**: cards and list rows that open something get a hover border/background so they read as clickable on a laptop.

## Fun, round 3

Picked 2026-11-17 from the ideas list (plus Marchon Training's hybrid ideas, still open below).

- [x] **Streak target**: weeks in a row at N sessions a week (Settings → Profile), flame grows, dots for this week.
- [x] **Exercise history mid-workout**: press and hold an exercise (or tap "Last time").
- [x] **Milestones** on Home, worked out from the data so past history counts.
- [x] **Effort rating** per exercise (stored as RPE on its sets); Hard/Max holds the weight next time.
- [x] **Share preview**: see the picture before sharing.
- [ ] **Hybrid week plan** (from Marchon): lay routines and runs across the week, 5K–marathon plans over 12/16 weeks.
- [ ] **Interval timer** (from Marchon): EMOM / AMRAP / Tabata in the logger.
