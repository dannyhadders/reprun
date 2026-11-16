// What changed, newest first, in plain words. Shown in Settings → About.
// Every user-facing change adds a line under today's date (see CLAUDE.md).
export const CHANGELOG: { date: string; changes: string[] }[] = [
  {
    date: '2026-11-16',
    changes: [
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
