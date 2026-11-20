// The plate calculator: which plates go on each side of the bar for a total weight (the weight you log includes the
// bar). Pure, so scripts/check-plan.ts can test it. Barbell lifts only: dumbbells, cables and machines have no plates
// to count, and plate-loaded machines (leg press, hack squat) have no standard bar.

export type Bar = { id: string; label: string; weight: number }
export const BARS = {
  kg: [{ id: 'olympic', label: '20 kg', weight: 20 }, { id: 'women', label: '15 kg', weight: 15 }, { id: 'ez', label: '10 kg EZ', weight: 10 }, { id: 'trap', label: '25 kg trap', weight: 25 }],
  lb: [{ id: 'olympic', label: '45 lb', weight: 45 }, { id: 'women', label: '35 lb', weight: 35 }, { id: 'ez', label: '25 lb EZ', weight: 25 }, { id: 'trap', label: '55 lb trap', weight: 55 }],
} satisfies Record<'kg' | 'lb', Bar[]>
// ponytail: a standard set, no "plates at my gym" setting. Add one if a gym is missing some.
export const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] }

// Barbell lifts in the catalogue (shared/catalogue.ts names, lower case), plus any name that says it's on a bar.
const BARBELL = new Set(['bench press', 'incline bench press', 'decline bench press', 'close-grip bench press', 'squat', 'front squat',
  'deadlift', 'romanian deadlift', 'sumo deadlift', 'overhead press', 'barbell row', 'barbell curl', 'barbell shrug', 'hip thrust', 'good morning'])
/** Which bar an exercise starts on, or null when it isn't a barbell lift. */
export function barFor(name: string): Bar['id'] | null {
  const n = name.toLowerCase()
  if (/\b(ez[- ]?bar)\b/.test(n)) return 'ez'
  if (/\b(trap|hex) bar\b/.test(n)) return 'trap'
  return BARBELL.has(n) || /\bbarbell\b/.test(n) ? 'olympic' : null
}

/** More than this a side (kg or lb) isn't a real lift: no plates worked out. */
export const MAX = 1000

export type Load = {
  side: number[] // plates on each side, heaviest first (fewest plates that make it)
  exact: boolean // false: this total can't be made with these plates and bar
  lower: number | null // the nearest totals you can load, when it isn't exact
  higher: number | null
}

/** The fewest plates per side for `total` on a bar of `bar`, in the same unit as `plates`. null below the bar, or past MAX. */
export function load(total: number, bar: number, plates: number[]): Load | null {
  // The work grows with the weight: a mistyped "1e9" (saved with the workout in progress) would hang the logger on every open.
  if (!(total >= bar) || total - bar > MAX * 2) return null
  // Work in whole units of the smallest plate (1.25 kg, 2.5 lb) so the sums are exact integers.
  const unit = Math.min(...plates), sizes = plates.map(p => Math.round(p / unit))
  const want = (total - bar) / 2 / unit, n = Math.floor(want + 1e-9)
  // fewest[k]: the fewest plates making k units; from[k]: the plate used last. Small (a 300 kg bar is 112 units).
  const fewest = [0], from = [0]
  for (let k = 1; k <= n; k++) {
    fewest[k] = Infinity
    for (const s of sizes) {
      if (s > k || fewest[k - s] + 1 >= fewest[k]) continue
      fewest[k] = fewest[k - s] + 1
      from[k] = s
    }
  }
  const side: number[] = []
  for (let k = n; k > 0; k -= from[k]) side.push(from[k] * unit)
  side.sort((a, b) => b - a)
  const exact = Math.abs(want - n) < 1e-9
  return { side, exact, lower: exact ? null : bar + 2 * n * unit, higher: exact ? null : bar + 2 * (n + 1) * unit }
}

/**
 * Warm-up sets building up to the working weight `work` (same unit as the bar and plates): the bar × 10, then 50% × 5,
 * 70% × 3 and 85% × 1, each rounded down to a weight you can load. A step that lands on the bar, repeats a weight or
 * reaches the working weight is dropped, so light lifts get fewer. None at or below the bar.
 */
export function warmupRamp(work: number, bar: number, plates: number[]): { weight: number; reps: number }[] {
  if (!(work > bar) || work - bar > MAX * 2) return []
  const unit = Math.min(...plates)
  const down = (w: number) => bar + Math.floor((w - bar) / 2 / unit + 1e-9) * 2 * unit
  const out = [{ weight: bar, reps: 10 }]
  for (const [pct, reps] of [[0.5, 5], [0.7, 3], [0.85, 1]]) {
    const w = down(work * pct)
    if (w > out.at(-1)!.weight && w < work) out.push({ weight: w, reps })
  }
  return out
}
