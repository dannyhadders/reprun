// Everything the screens show is derived here from the raw /api/data payload. Pure functions, no fetching.
import { working, type Activity, type Data, type Exercise, type Muscle, type Workout, type WorkoutSet } from '../../shared/types.ts'
import { daysAgo, localISO, parseISO, today, weekStart } from './format.ts'

export const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun'])
export const GYM_SPORTS = new Set(['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining'])
export const MUSCLES: Exclude<Muscle, 'other'>[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core']

export const setVolume = (s: WorkoutSet) => (s.weight_kg ?? 0) * (s.reps ?? 0)
/** Epley. Past ~12 reps the estimate stops meaning much, so those sets don't get one. */
export const e1rm = (s: Pick<WorkoutSet, 'weight_kg' | 'reps'>) =>
  s.weight_kg && s.reps && s.reps > 0 && s.reps <= 12 ? (s.reps === 1 ? s.weight_kg : s.weight_kg * (1 + s.reps / 30)) : null

export type PbKind = 'weight' | 'e1rm' | 'reps'
export type Session = {
  key: string
  date: string
  title: string
  workout: Workout | null // null = Strava-only gym session (no set detail)
  activity: Activity | null // timed gym activity from Strava, if any
  durationS: number | null
  durationSource: 'app' | 'strava' | 'estimate' | null
  volume: number
  sets: number
  reps: number
  pbs: number
}
export type ExerciseSession = { date: string; workoutId: number; sets: WorkoutSet[] }

type LiveSet = Pick<WorkoutSet, 'weight_kg' | 'reps'> & { done: boolean }
/**
 * The logger's live PB: which ticked set (index) would count as today's PB against past sessions,
 * by the same rule as buildModel: heaviest weight, else best e1RM, else most bodyweight reps, one per
 * exercise, and nothing until there's a past session to beat. -1 for none.
 */
export function livePb(history: ExerciseSession[], sets: LiveSet[]): number {
  return livePbHit(history, sets)?.at ?? -1
}

/** What each kind of PB measures: the weight, the estimated one-rep max, or reps with no weight. */
export const PB_METRIC: Record<PbKind, (s: Pick<WorkoutSet, 'weight_kg' | 'reps'>) => number> = {
  weight: s => s.weight_kg ?? 0,
  e1rm: s => e1rm(s) ?? 0,
  reps: s => (s.weight_kg ? 0 : s.reps ?? 0),
}

/**
 * How much more counts as a PB, in kg: a hair over the old best isn't one. The same weight can be saved a hundredth
 * apart (220 lb is 99.79 kg from the first lb release, 99.8 now), and nobody loads 0.025 kg. Reps count from +1.
 */
export const MORE = 0.025

/** livePb, plus which kind of PB it is and the best it beat (for the finish screen's PB moment). */
export function livePbHit(history: ExerciseSession[], sets: LiveSet[]): { at: number; kind: PbKind; before: number; now: number } | null {
  const past = history.flatMap(h => h.sets)
  // Only sets that will be saved: toImport drops a ticked set with no reps.
  const pick = (f: (s: LiveSet) => number) => sets.reduce((b, s, i) => (s.done && (s.reps ?? 0) > 0 && f(s) > 0 && (b < 0 || f(s) > f(sets[b])) ? i : b), -1)
  for (const kind of ['weight', 'e1rm', 'reps'] as const) {
    const f = PB_METRIC[kind], before = Math.max(0, ...past.map(f)), at = pick(f)
    if (at >= 0 && before > 0 && f(sets[at]) > before + (kind === 'reps' ? 0 : MORE)) return { at, kind, before, now: f(sets[at]) }
  }
  return null
}

export type Model = ReturnType<typeof buildModel>

export function buildModel(data: Data) {
  const exById = new Map<number, Exercise>(data.exercises.map(e => [e.id, e]))
  const chronological = [...data.workouts].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  // Runs: a Strava run on the same day replaces the hand-typed spreadsheet one.
  const stravaRunDays = new Set(data.activities.filter(a => a.source === 'strava' && RUN_SPORTS.has(a.sport)).map(a => a.date))
  const runs = data.activities.filter(a => RUN_SPORTS.has(a.sport) && !(a.source === 'sheet' && stravaRunDays.has(a.date)))
  const otherActivities = data.activities.filter(a => !RUN_SPORTS.has(a.sport) && !GYM_SPORTS.has(a.sport))

  // Gym sessions: logged workouts, timed by the Strava/Apple Health activity on the same day when there is one.
  const gymByDate = new Map<string, Activity[]>()
  for (const a of data.activities) if (GYM_SPORTS.has(a.sport)) gymByDate.set(a.date, [...(gymByDate.get(a.date) ?? []), a])

  // PBs, walked in date order, Hevy-style: at most one per exercise per session, and only when the
  // session's best set beats every earlier session that had numbers. The first such session is the baseline.
  const pbs = new Map<number, PbKind[]>()
  const exHistory = new Map<number, ExerciseSession[]>()
  const best = new Map<number, { weight: number; e1rm: number; reps: number }>()
  const top = (sets: WorkoutSet[], f: (s: WorkoutSet) => number) => sets.reduce<WorkoutSet | null>((a, s) => (f(s) > 0 && (!a || f(s) > f(a)) ? s : a), null)
  for (const w of chronological) {
    const byEx = new Map<number, WorkoutSet[]>()
    // Warm-ups are left out of history, so PBs, 1RM, charts, last-time hints and suggestions never count them.
    for (const s of w.sets.filter(working)) byEx.set(s.exercise_id, [...(byEx.get(s.exercise_id) ?? []), s])
    for (const [exId, sets] of byEx) {
      exHistory.set(exId, [...(exHistory.get(exId) ?? []), { date: w.date, workoutId: w.id, sets }])
      const heaviest = top(sets, s => s.weight_kg ?? 0)
      const strongest = top(sets, s => e1rm(s) ?? 0)
      const mostReps = top(sets.filter(s => !s.weight_kg), s => s.reps ?? 0)
      const now = { weight: heaviest?.weight_kg ?? 0, e1rm: strongest ? e1rm(strongest)! : 0, reps: mostReps?.reps ?? 0 }
      const prev = best.get(exId)
      if (prev) {
        if (heaviest && now.weight > prev.weight + MORE && prev.weight > 0) pbs.set(heaviest.id, ['weight'])
        else if (strongest && now.e1rm > prev.e1rm + MORE && prev.e1rm > 0) pbs.set(strongest.id, ['e1rm'])
        else if (mostReps && now.reps > prev.reps && prev.reps > 0) pbs.set(mostReps.id, ['reps'])
      }
      if (now.weight || now.e1rm || now.reps) {
        best.set(exId, { weight: Math.max(prev?.weight ?? 0, now.weight), e1rm: Math.max(prev?.e1rm ?? 0, now.e1rm), reps: Math.max(prev?.reps ?? 0, now.reps) })
      }
    }
  }

  const usedGym = new Set<number>()
  const sessions: Session[] = data.workouts.map(w => {
    const act = (gymByDate.get(w.date) ?? []).find(a => !usedGym.has(a.id)) ?? null
    if (act) usedGym.add(act.id)
    const s = w.sets.filter(working) // counts and volume: working sets only (the workout itself keeps its warm-ups)
    return {
      key: `w${w.id}`,
      date: w.date,
      title: w.title || 'Workout',
      workout: w,
      activity: act,
      durationS: w.duration_s ?? act?.elapsed_s ?? (s.length ? Math.max(20, s.length * 3) * 60 : null),
      durationSource: w.duration_s ? 'app' : act ? 'strava' : s.length ? 'estimate' : null,
      volume: s.reduce((a, x) => a + setVolume(x), 0),
      sets: s.length,
      reps: s.reduce((a, x) => a + (x.reps ?? 0), 0),
      pbs: s.filter(x => pbs.has(x.id)).length,
    }
  })
  for (const acts of gymByDate.values()) {
    for (const a of acts) {
      if (usedGym.has(a.id)) continue
      sessions.push({ key: `a${a.id}`, date: a.date, title: a.name || 'Weight Training', workout: null, activity: a, durationS: a.elapsed_s, durationSource: 'strava', volume: 0, sets: 0, reps: 0, pbs: 0 })
    }
  }
  sessions.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key))

  const activeDays = new Map<string, number>()
  for (const d of [...sessions.map(s => s.date), ...runs.map(r => r.date), ...otherActivities.map(a => a.date)]) activeDays.set(d, (activeDays.get(d) ?? 0) + 1)

  return { data, exById, sessions, runs, otherActivities, pbs, exHistory, activeDays, chronological }
}

// ---------- per exercise ----------

/** Sets from the last session that had this exercise, by name. */
export const lastSets = (m: Model, name: string) => {
  const id = m.data.exercises.find(e => e.name === name)?.id
  return (id && m.exHistory.get(id)?.at(-1)?.sets) || []
}

export function exerciseBests(m: Model, exId: number) {
  const hist = m.exHistory.get(exId) ?? []
  const all = hist.flatMap(h => h.sets.map(s => ({ s, date: h.date, workoutId: h.workoutId })))
  const top = <T,>(f: (x: (typeof all)[number]) => number, extra?: (x: (typeof all)[number]) => T) => {
    let bestX: (typeof all)[number] | null = null
    for (const x of all) if (f(x) > 0 && (!bestX || f(x) > f(bestX))) bestX = x
    return bestX ? { value: f(bestX), date: bestX.date, set: bestX.s, workoutId: bestX.workoutId, extra: extra?.(bestX) } : null
  }
  const sessionVol = hist.map(h => ({ date: h.date, workoutId: h.workoutId, value: h.sets.reduce((a, s) => a + setVolume(s), 0) }))
  const bestSession = sessionVol.reduce<(typeof sessionVol)[number] | null>((a, x) => (x.value > 0 && (!a || x.value > a.value) ? x : a), null)

  // Best weight for each rep count you've done (Hevy's "set records").
  const byReps = new Map<number, { kg: number; date: string }>()
  for (const { s, date } of all) {
    if (!s.reps || !s.weight_kg) continue
    const r = Math.round(s.reps)
    if (!byReps.has(r) || s.weight_kg > byReps.get(r)!.kg) byReps.set(r, { kg: s.weight_kg, date })
  }
  return {
    sessions: hist.length,
    totalSets: all.length,
    heaviest: top(x => x.s.weight_kg ?? 0),
    oneRm: top(x => e1rm(x.s) ?? 0),
    bestSet: top(x => setVolume(x.s)),
    mostReps: top(x => x.s.reps ?? 0),
    longestHold: top(x => x.s.seconds ?? 0),
    bestSession,
    setRecords: [...byReps].sort((a, b) => a[0] - b[0]),
    last: hist.at(-1)?.date ?? null,
  }
}

export const METRICS = {
  heaviest: { label: 'Heaviest weight', unit: 'kg', f: (sets: WorkoutSet[]) => Math.max(0, ...sets.map(s => s.weight_kg ?? 0)) },
  e1rm: { label: 'Est. 1RM', unit: 'kg', f: (sets: WorkoutSet[]) => Math.max(0, ...sets.map(s => e1rm(s) ?? 0)) },
  bestSet: { label: 'Best set volume', unit: 'kg', f: (sets: WorkoutSet[]) => Math.max(0, ...sets.map(setVolume)) },
  volume: { label: 'Session volume', unit: 'kg', f: (sets: WorkoutSet[]) => sets.reduce((a, s) => a + setVolume(s), 0) },
  reps: { label: 'Total reps', unit: 'reps', f: (sets: WorkoutSet[]) => sets.reduce((a, s) => a + (s.reps ?? 0), 0) },
  hold: { label: 'Longest hold', unit: 's', f: (sets: WorkoutSet[]) => Math.max(0, ...sets.map(s => s.seconds ?? 0)) },
} as const
export type MetricKey = keyof typeof METRICS

export const RANGES = { '30D': 30, '3M': 91, '1Y': 365, All: Infinity } as const
export type RangeKey = keyof typeof RANGES
export const inRange = (date: string, range: RangeKey) => RANGES[range] === Infinity || date >= daysAgo(RANGES[range])

export function exerciseSeries(m: Model, exId: number, metric: MetricKey, range: RangeKey) {
  return (m.exHistory.get(exId) ?? [])
    .filter(h => inRange(h.date, range))
    .map(h => ({ date: h.date, workoutId: h.workoutId, value: Math.round(METRICS[metric].f(h.sets) * 10) / 10 }))
    .filter(p => p.value > 0)
}

// ---------- across exercises ----------

export function muscleSets(m: Model, from: string, to = today()) {
  const counts = Object.fromEntries(MUSCLES.map(k => [k, 0])) as Record<(typeof MUSCLES)[number], number>
  for (const w of m.data.workouts) {
    if (w.date < from || w.date > to) continue
    for (const s of w.sets.filter(working)) {
      const mu = m.exById.get(s.exercise_id)?.muscle
      if (mu && mu !== 'other') counts[mu]++
    }
  }
  return counts
}

export function mainExercises(m: Model, days = 30, limit = 5) {
  const from = daysAgo(days)
  const counts = new Map<number, number>()
  for (const w of m.data.workouts) if (w.date >= from) for (const s of w.sets.filter(working)) counts.set(s.exercise_id, (counts.get(s.exercise_id) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, sets]) => {
      const series = exerciseSeries(m, id, 'heaviest', 'All')
      const recent = series.filter(p => p.date >= from)
      return { exercise: m.exById.get(id)!, sets, series, best: Math.max(0, ...recent.map(p => p.value)), change: recent.length > 1 ? recent.at(-1)!.value - recent[0].value : 0, points: m.exHistory.get(id)?.length ?? 0 } // sessions ever, so 'new' means new, not 'quiet this month'
    })
}

export function weekly(m: Model, weeks = 12) {
  const out: { week: string; gym: number; runs: number; km: number; volume: number }[] = []
  const start = weekStart(daysAgo((weeks - 1) * 7))
  for (let i = 0; i < weeks; i++) {
    const d = parseISO(start)
    d.setDate(d.getDate() + i * 7)
    out.push({ week: d.toISOString().slice(0, 10), gym: 0, runs: 0, km: 0, volume: 0 })
  }
  const idx = new Map(out.map((w, i) => [w.week, i]))
  for (const s of m.sessions) {
    const i = idx.get(weekStart(s.date))
    if (i === undefined) continue
    out[i].gym++
    out[i].volume += s.volume
  }
  for (const r of m.runs) {
    const i = idx.get(weekStart(r.date))
    if (i === undefined) continue
    out[i].runs++
    out[i].km += (r.distance_m ?? 0) / 1000
  }
  return out
}

export const DEFAULT_WEEKLY = 1
/** 1-7 whatever's stored: a bad value (say from a hand-edited backup) must never make the streak loop forever. */
export const weeklyTarget = (v?: number | null) => Math.min(7, Math.max(1, Math.round(v || DEFAULT_WEEKLY)))
/** Sessions (gym, runs, anything else from Strava) in each week, keyed by its Monday. */
export function weekCounts(m: Model, until = today()) {
  const out = new Map<string, number>()
  for (const [d, n] of m.activeDays) if (d <= until) out.set(weekStart(d), (out.get(weekStart(d)) ?? 0) + n)
  return out
}

/**
 * Weeks in a row (Mon-Sun) that hit the weekly target, counting back from this week. This week only counts once it's
 * hit; until then it doesn't break the streak either, so a Monday rest day never shows 0.
 */
export function weekStreak(m: Model, weekly?: number | null, until = today()) {
  const target = weeklyTarget(weekly)
  const counts = weekCounts(m, until)
  const thisWeek = counts.get(weekStart(until)) ?? 0
  const d = parseISO(weekStart(until))
  if (thisWeek < target) d.setDate(d.getDate() - 7)
  let n = 0
  while ((counts.get(localISO(d)) ?? 0) >= target) {
    n++
    d.setDate(d.getDate() - 7)
  }
  return { weeks: n, thisWeek, target }
}

export function longestWeekStreak(dates: string[]) {
  const weeks = [...new Set(dates.map(weekStart))].sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const w of weeks) {
    const d = parseISO(w)
    run = prev && (d.getTime() - prev.getTime()) / 86_400_000 <= 8 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

// ---------- runs ----------

export const runPace = (r: Activity) => (r.distance_m && r.moving_s ? r.moving_s / (r.distance_m / 1000) : null)

export function runBests(runs: Activity[]) {
  const withPace = runs.filter(r => (r.distance_m ?? 0) >= 5000 && runPace(r))
  return {
    longest: runs.reduce<Activity | null>((a, r) => ((r.distance_m ?? 0) > (a?.distance_m ?? 0) ? r : a), null),
    fastest5k: withPace.reduce<Activity | null>((a, r) => (!a || runPace(r)! < runPace(a)! ? r : a), null),
    totalM: runs.reduce((a, r) => a + (r.distance_m ?? 0), 0),
    totalS: runs.reduce((a, r) => a + (r.moving_s ?? 0), 0),
  }
}

// ---------- year in review ----------

export function yearsWithData(m: Model) {
  return [...new Set([...m.activeDays.keys()].map(d => +d.slice(0, 4)))].sort((a, b) => b - a)
}

export function yearSummary(m: Model, year: number) {
  const y = String(year)
  const sessions = m.sessions.filter(s => s.date.startsWith(y))
  const runs = m.runs.filter(r => r.date.startsWith(y))
  const workouts = m.data.workouts.filter(w => w.date.startsWith(y))
  const sets = workouts.flatMap(w => w.sets.filter(working))
  const activeDays = [...m.activeDays.keys()].filter(d => d.startsWith(y))

  const months = Array.from({ length: 12 }, (_, i) => {
    const p = `${y}-${String(i + 1).padStart(2, '0')}`
    return {
      month: i,
      days: activeDays.filter(d => d.startsWith(p)).length,
      gym: sessions.filter(s => s.date.startsWith(p)).length,
      runs: runs.filter(r => r.date.startsWith(p)).length,
      km: runs.filter(r => r.date.startsWith(p)).reduce((a, r) => a + (r.distance_m ?? 0) / 1000, 0),
      volume: sessions.filter(s => s.date.startsWith(p)).reduce((a, s) => a + s.volume, 0),
    }
  })
  const bestMonth = [...months].sort((a, b) => b.days - a.days || b.volume - a.volume)[0]

  const exCounts = new Map<number, number>()
  for (const s of sets) exCounts.set(s.exercise_id, (exCounts.get(s.exercise_id) ?? 0) + 1)
  const topExercises = [...exCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ exercise: m.exById.get(id)!, sets: n }))

  const pbSets = workouts.flatMap(w => w.sets.filter(s => m.pbs.has(s.id)).map(s => ({ s, date: w.date, kinds: m.pbs.get(s.id)! })))
  const dow = Array(7).fill(0) as number[]
  for (const d of activeDays) dow[(parseISO(d).getDay() + 6) % 7]++

  return {
    year,
    sessions: sessions.length,
    runs: runs.length,
    activeDays: activeDays.length,
    durationS: sessions.reduce((a, s) => a + (s.durationS ?? 0), 0) + runs.reduce((a, r) => a + (r.moving_s ?? 0), 0),
    volume: sessions.reduce((a, s) => a + s.volume, 0),
    sets: sets.length,
    reps: sets.reduce((a, s) => a + (s.reps ?? 0), 0),
    run: runBests(runs),
    months,
    bestMonth,
    topExercises,
    muscles: muscleSets(m, `${y}-01-01`, `${y}-12-31`),
    pbSets,
    longestStreak: longestWeekStreak(activeDays),
    favouriteDay: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dow.indexOf(Math.max(...dow))],
    activeDates: new Map(activeDays.map(d => [d, m.activeDays.get(d)!])),
  }
}
