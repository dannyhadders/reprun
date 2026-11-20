// One-off badges, all worked out from the data: nothing stored, so they appear for past history too and follow edits.
// Each kind is a ladder of thresholds; you see every rung you've reached and the next one up with how close you are.
// Self-check: npx tsx scripts/check-plan.ts
import { THINGS } from './motivation.ts'
import { localISO, num, parseISO, today, weekStart } from './format.ts'
import { e1rm, runPace, weeklyTarget, type Model } from './stats.ts'
import { LIFT_NAMES, levelKgs } from './standards.ts'
import { working, type Lift } from '../../shared/types.ts'

export type Milestone = { key: string; emoji: string; title: string; date: string | null; progress: number } // progress 0-1; date when reached

type Ladder = { kind: string; emoji: string; steps: number[]; title: (n: number) => string; events: [string, number][] } // events: (date, amount added) in date order

/** First date the running total of `events` reaches each step, or null with how far along it is. */
function climb(l: Ladder): Milestone[] {
  const out: Milestone[] = []
  let total = 0, i = 0
  for (const [date, add] of l.events) {
    total += add
    for (; i < l.steps.length && total >= l.steps[i]; i++) out.push({ key: `${l.kind}:${l.steps[i]}`, emoji: l.emoji, title: l.title(l.steps[i]), date, progress: 1 })
  }
  if (i < l.steps.length) out.push({ key: `${l.kind}:${l.steps[i]}`, emoji: l.emoji, title: l.title(l.steps[i]), date: null, progress: total / l.steps[i] })
  return out
}

/** Like climb, but for a best-so-far (heaviest lift, longest streak) rather than a running total. */
function peak(l: Ladder): Milestone[] {
  let best = 0
  return climb({ ...l, events: l.events.map(([d, v]) => { const add = Math.max(0, v - best); best = Math.max(best, v); return [d, add] }) })
}

const nth = (n: number) => `${num(n)}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

// withRuns: the Runs and Strava switch (Settings → Features); off, no running milestones at all.
export function milestones(m: Model, weeklyRaw?: number | null, withRuns = true): Milestone[] {
  const weekly = weeklyTarget(weeklyRaw)
  const workouts = m.chronological.map(w => ({ ...w, sets: w.sets.filter(working) })) // warm-ups never earn a milestone
  const sessions = [...m.sessions].reverse() // oldest first
  const runs = [...m.runs].sort((a, b) => a.date.localeCompare(b.date))
  const pbDates = workouts.flatMap(w => w.sets.filter(s => m.pbs.has(s.id)).map(() => w.date))

  // Weeks in a row hitting the target, each dated the day that week's target was hit.
  const hitOn = new Map<string, string>() // Monday -> day the target was reached
  const sofar = new Map<string, number>()
  for (const d of [...m.activeDays.keys()].filter(d => d <= today()).sort()) {
    const wk = weekStart(d), n = (sofar.get(wk) ?? 0) + m.activeDays.get(d)!
    sofar.set(wk, n)
    if (n >= weekly && !hitOn.has(wk)) hitOn.set(wk, d)
  }
  const streaks: [string, number][] = []
  if (sofar.size) {
    const weeks = [...sofar.keys()].sort()
    let run = 0
    for (const d = parseISO(weeks[0]), end = weeks.at(-1)!; localISO(d) <= end; d.setDate(d.getDate() + 7)) {
      const hit = hitOn.get(localISO(d))
      run = hit ? run + 1 : 0
      streaks.push([hit ?? localISO(d), run])
    }
  }
  // Body weight for strength levels: the latest logged, else the profile's.
  const bw = m.data.bodyWeight.at(-1)?.kg ?? m.data.profile.weight_kg
  const lifts = (['bench', 'squat', 'deadlift', 'ohp'] as Lift[]).flatMap(lift => {
    const levels = levelKgs(lift, { sex: m.data.profile.sex, weight_kg: bw })
    if (!levels) return []
    const ids = new Set(m.data.exercises.filter(e => e.lift === lift).map(e => e.id))
    const name = LIFT_NAMES[lift][0].toUpperCase() + LIFT_NAMES[lift].slice(1)
    const events = workouts.map(w => [w.date, Math.max(0, ...w.sets.filter(s => ids.has(s.exercise_id)).map(s => e1rm(s) ?? 0))] as [string, number])
    if (!events.some(([, v]) => v)) return [] // never done it: no nagging about a lift you don't do
    return peak({ kind: `level-${lift}`, emoji: '📈', steps: levels.map(l => l.kg), title: n => `${name}: ${levels.find(l => l.kg === n)!.level} level`, events })
  })
  const RACES: [number, string][] = [[4.95, 'First 5K run'], [9.9, 'First 10K run'], [21, 'First half marathon'], [42, 'First marathon'], [50, 'First ultra (50K+)']]
  const FIVE_K = [35, 30, 27.5, 25, 22.5, 20] // minutes
  const bodyweightSets = workouts.flatMap(w => w.sets.filter(s => !s.weight_kg && s.reps).map(s => [w.date, s.reps!] as [string, number]))
  const seen = new Set<number>()

  return [
    // Turning up
    ...climb({ kind: 'sessions', emoji: '🏋️', steps: [1, 5, 10, 25, 50, 100, 250, 500, 1000], title: n => (n === 1 ? 'First workout' : `${nth(n)} workout`), events: sessions.map(s => [s.date, 1]) }),
    ...climb({ kind: 'hours', emoji: '⏱️', steps: [5, 10, 25, 50, 100, 250, 500], title: n => `${num(n)} hours of training`, events: [...sessions.map(s => [s.date, (s.durationS ?? 0) / 3600] as [string, number]), ...runs.map(r => [r.date, (r.moving_s ?? 0) / 3600] as [string, number])].sort((a, b) => a[0].localeCompare(b[0])) }),
    ...peak({ kind: 'streak', emoji: '🔥', steps: [2, 4, 8, 12, 26, 52], title: n => `${n} weeks in a row${weekly > 1 ? ` at ${weekly}+ a week` : ' training'}`, events: streaks }),
    // Lifting: how much in total, how heavy, how strong for your size, and plenty that isn't about weight at all
    ...climb({ kind: 'volume', emoji: '🐘', steps: THINGS.map(t => t[2]), title: n => `Lifted ${THINGS.find(t => t[2] === n)![0]} in total`, events: sessions.map(s => [s.date, s.volume]) }),
    ...peak({ kind: 'heaviest', emoji: '🪨', steps: [20, 30, 40, 50, 60, 80, 100, 120, 140, 160, 180, 200], title: n => `First ${n} kg lift`, events: workouts.map(w => [w.date, Math.max(0, ...w.sets.map(s => (s.reps ? s.weight_kg ?? 0 : 0)))]) }),
    ...lifts,
    ...climb({ kind: 'reps', emoji: '🔁', steps: [1000, 5000, 10000, 25000, 50000, 100000], title: n => `${num(n)} reps`, events: workouts.map(w => [w.date, w.sets.reduce((a, s) => a + (s.reps ?? 0), 0)]) }),
    ...peak({ kind: 'bw-reps', emoji: '🤸', steps: [10, 20, 30, 50], title: n => `${n} bodyweight reps in one set`, events: bodyweightSets }),
    ...climb({ kind: 'variety', emoji: '🧩', steps: [5, 10, 25, 50], title: n => `${n} different exercises`, events: workouts.map(w => [w.date, w.sets.filter(s => !seen.has(s.exercise_id) && seen.add(s.exercise_id)).length]) }),
    ...climb({ kind: 'pbs', emoji: '🏆', steps: [1, 10, 25, 50, 100, 250], title: n => (n === 1 ? 'First PB' : `${num(n)} PBs`), events: pbDates.map(d => [d, 1]) }),
    // Running: how far in total, how often, how far in one go, how fast
    ...climb({ kind: 'runs', emoji: '👟', steps: [1, 10, 25, 50, 100, 250], title: n => (n === 1 ? 'First run' : `${nth(n)} run`), events: runs.map(r => [r.date, 1]) }),
    ...climb({ kind: 'km', emoji: '🏃', steps: [5, 25, 50, 100, 250, 500, 1000, 2000, 5000], title: n => `${num(n)} km run`, events: runs.map(r => [r.date, (r.distance_m ?? 0) / 1000]) }),
    ...peak({ kind: 'distance', emoji: '🏅', steps: RACES.map(r => r[0]), title: n => RACES.find(r => r[0] === n)![1], events: runs.map(r => [r.date, (r.distance_m ?? 0) / 1000]) }),
    // Faster = bigger, so 5K time goes in as 1/minutes: progress is then "your best 5K time vs the target".
    ...peak({ kind: '5k', emoji: '⚡', steps: FIVE_K.map(t => 1 / t), title: n => `5K in under ${num(Math.round(1 / n * 10) / 10, 1)} min`, events: runs.filter(r => (r.distance_m ?? 0) >= 4950 && runPace(r)).map(r => [r.date, 1 / (runPace(r)! * 5 / 60)]) }),
  ].filter(x => ((x.date || runs.length) && withRuns) || !['runs', 'km', 'distance', '5k'].includes(x.key.split(':')[0])) // no running goals for people who don't run
}
