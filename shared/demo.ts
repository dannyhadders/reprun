// Made-up training history for the public demo: twelve weeks of push / pull / legs ending `today`,
// with the weights creeping up, so every chart, PB and suggestion has something to show.
// The worker loads it when the demo database is empty and again every night (see worker/index.ts).
import { resolveExercise } from './catalogue.ts'
import { formatLine } from './plan.ts'
import { rng } from './strava.ts'
import type { BodyWeight, Goal, ImportPayload, ImportSet, ImportWorkout, Profile, RecordRow } from './types.ts'

type Lift = { name: string; sets: number; reps: [number, number]; kg: number | null; secs?: number; rest: number }
const DAYS: Record<string, Lift[]> = {
  Push: [
    { name: 'Bench Press', sets: 3, reps: [6, 8], kg: 50, rest: 150 },
    { name: 'Incline Dumbbell Press', sets: 3, reps: [8, 10], kg: 16, rest: 90 },
    { name: 'Dumbbell Shoulder Press', sets: 3, reps: [8, 10], kg: 14, rest: 90 },
    { name: 'Lateral Raise', sets: 3, reps: [12, 15], kg: 6, rest: 60 },
    { name: 'Triceps Pushdown', sets: 3, reps: [10, 12], kg: 20, rest: 60 },
  ],
  Pull: [
    { name: 'Lat Pulldown', sets: 3, reps: [8, 10], kg: 45, rest: 90 },
    { name: 'Seated Cable Row', sets: 3, reps: [8, 10], kg: 45, rest: 90 },
    { name: 'Chest-supported Dumbbell Row', sets: 3, reps: [10, 12], kg: 16, rest: 75 },
    { name: 'EZ-bar Curl', sets: 3, reps: [10, 12], kg: 17.5, rest: 60 },
    { name: 'Hammer Curl', sets: 3, reps: [10, 12], kg: 10, rest: 60 },
  ],
  Legs: [
    { name: 'Squat', sets: 3, reps: [5, 6], kg: 60, rest: 180 },
    { name: 'Romanian Deadlift', sets: 3, reps: [8, 10], kg: 50, rest: 120 },
    { name: 'Leg Extension', sets: 3, reps: [12, 15], kg: 35, rest: 60 },
    { name: 'Lying Leg Curl', sets: 3, reps: [12, 15], kg: 30, rest: 60 },
    { name: 'Plank', sets: 3, reps: [1, 1], kg: null, secs: 45, rest: 60 },
  ],
}
const WEEKS = 12
const label = (day: string) => (day === 'Legs' ? 'Leg day' : `${day} day`) // workout titles match routine names, so Next up rotates
const round = (kg: number) => Math.round(kg / 2.5) * 2.5 || Math.round(kg) // dumbbells under 2.5 kg steps stay whole

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// ~1% heavier a week, so a lift gains a step every couple of weeks.
const weightAt = (l: Lift, week: number) => (l.kg === null ? null : round(l.kg * (1 + 0.012 * week)))

export function demoData(today: string) {
  const rand = rng(7)
  const workouts: ImportWorkout[] = []
  const order = Object.keys(DAYS)
  let n = 0
  for (let i = WEEKS * 7; i >= 1; i--) {
    const date = addDays(today, -i)
    const dow = new Date(date + 'T12:00:00Z').getUTCDay()
    if (![1, 3, 5].includes(dow) || rand() < 0.12) continue // Mon / Wed / Fri, missing the odd one
    const day = order[n++ % order.length]
    const week = WEEKS - Math.ceil(i / 7)
    let position = 0
    const sets: ImportSet[] = DAYS[day].flatMap(l => {
      const e = resolveExercise(l.name, null)
      return Array.from({ length: l.sets }, (_, s) => ({
        exercise: e.name, muscle: e.muscle, lift: e.lift ?? null, position: position++,
        weight_kg: weightAt(l, week),
        reps: l.secs ? null : Math.max(l.reps[0] - 1, l.reps[1] - s - Math.floor(rand() * 2)), // fade a rep or two across sets
        seconds: l.secs ? l.secs + week * 5 : null,
        notes: null,
      }))
    })
    workouts.push({ date, title: label(day), notes: null, source: 'app', sets, duration_s: (50 + Math.round(rand() * 20)) * 60 })
  }

  const routines = order.map(name => ({
    name: label(name),
    body: DAYS[name]
      .filter(l => !l.secs)
      .map(l => formatLine({ name: l.name, sets: l.sets, repsMin: l.reps[0], repsMax: l.reps[1], weight: weightAt(l, WEEKS), restS: l.rest, note: null }))
      .join('\n'),
  }))

  const goals: Omit<Goal, 'id'>[] = [
    { exercise: 'Bench Press', latest: null, target: 'Bench 70 kg for 5 by spring', context: null, source: 'demo' },
    { exercise: 'Squat', latest: null, target: 'Squat 100 kg for a single', context: null, source: 'demo' },
    { exercise: 'Lat Pulldown', latest: null, target: 'Full stack for 8 clean reps', context: null, source: 'demo' },
  ]
  const records: Omit<RecordRow, 'id'>[] = [
    { category: 'Running', name: '5K', value: '24:12', date: addDays(today, -20), context: 'Parkrun', source: 'demo' },
    { category: 'Running', name: '10K', value: '52:40', date: addDays(today, -45), context: null, source: 'demo' },
  ]
  const bodyWeight: BodyWeight[] = Array.from({ length: WEEKS }, (_, w) => ({
    date: addDays(today, -(WEEKS - w) * 7),
    kg: Math.round((78 - w * 0.25 + (rand() - 0.5)) * 10) / 10,
    source: 'demo',
  }))
  const profile: Profile = { age: 30, sex: 'male', weight_kg: bodyWeight.at(-1)!.kg }
  const payload: ImportPayload = { workouts, activities: [], records, goals }
  return { payload, routines, bodyWeight, profile }
}
