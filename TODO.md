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
- [ ] **Try it with no setup**: install from the demo and keep the data on the phone, with a first-run onboarding (and a way to move to your own copy later).
