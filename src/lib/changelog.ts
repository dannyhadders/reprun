// What changed, newest first, in plain words. Shown in Settings → About.
// Every user-facing change adds a line under today's date (see CLAUDE.md).
export const CHANGELOG: { date: string; changes: string[] }[] = [
  {
    date: '2026-11-17',
    changes: [
      'Tick the last set of an exercise and it folds away.',
      'Buttons dip when you tap them, and the small ones (✕, ✓, rest timer) are easier to hit.',
      '"Are you sure?" questions (remove, delete, discard, merge) ask in RepRun\'s own style instead of a grey phone pop-up.',
      'Removing an exercise or a set mid-workout asks first, then offers Undo for a few seconds. A finished exercise can\'t be removed.',
      'No rest timer after the last set of the workout.',
      'Ticking a set pops, finishing an exercise bursts, and a PB gets confetti on the finish screen.',
      'Buttons show a spinner while they work instead of changing their wording.',
      'Pages fade in, and pages with nothing on them yet say so instead of showing empty charts.',
      'Copy buttons show a clipboard that turns into a tick.',
      'Edit an exercise: rename it, change its muscle, or merge a typo into the right one. Routines and targets follow.',
      'Starter routines: Push, Pull, Leg, Back and Arms days in one tap when you have none yet.',
      'First time doing an exercise from a routine: it asks for a weight instead of assuming bodyweight.',
    ],
  },
  {
    date: '2026-11-16',
    changes: [
      'RepRun with no setup: reprun.danielhadaway.dev keeps everything on your phone, with a reminder to back up after each workout.',
      'Settings → Backup: save everything to one file, and restore it here or into another copy.',
      'Sets read the same everywhere: 60 kg × 8, BW × 12.',
      'Settings → About: app version and this update log.',
      'Leave a workout running: ‹ goes back to the menu, and a bar on every page shows the clock and rest timer.',
      'Notes on a set (tap its number) and on the whole workout.',
      'Exercise picker shows your last time and best as you type.',
      'Fold exercises away during a workout; the header shows sets done.',
      'One Edit button per workout instead of per-set icons and Delete.',
      'No zoom on iPhone; confirm before removing a set that has data.',
      'Copy a workout as text, for ChatGPT or a PT.',
      'Workouts waiting to upload show on every page and retry by themselves.',
      'Haptics that work on iPhone.',
    ],
  },
  { date: '2026-11-13', changes: ['Installed app opens on the dashboard, with a Start workout shortcut.', 'New logo and home-screen icons.'] },
  { date: '2026-11-12', changes: ['First version: gym and running dashboard, workout logger, Strava sync, spreadsheet import.'] },
]
