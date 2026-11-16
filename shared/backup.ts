// Backup files: build one from the app's data, and the keys a restore uses to spot what's already there.
import type { Backup, Data, ImportActivity, ImportWorkout } from './types.ts'

const noId = <T extends { id: number }>({ id: _id, ...rest }: T) => rest

export function toBackup(d: Data, exported = new Date().toISOString()): Backup {
  const ex = new Map(d.exercises.map(e => [e.id, e]))
  return {
    app: 'reprun',
    version: 1,
    exported,
    workouts: d.workouts.map(({ date, title, notes, source, duration_s, client_id, sets }) => ({
      date, title, notes, source, duration_s, client_id,
      sets: sets.map(({ exercise_id, position, weight_kg, reps, seconds, notes }) => {
        const e = ex.get(exercise_id)!
        return { exercise: e.name, muscle: e.muscle, lift: e.lift, position, weight_kg, reps, seconds, notes }
      }),
    })),
    activities: d.activities.filter(a => !a.sample).map(noId), // sample runs are Strava placeholders
    records: d.records.map(noId),
    goals: d.goals.map(noId),
    routines: d.routines.map(({ name, body }) => ({ name, body })),
    bodyWeight: d.bodyWeight,
    profile: d.profile,
  }
}

export const isBackup = (x: unknown): x is Backup =>
  !!x && typeof x === 'object' && (x as Backup).app === 'reprun' && (x as Backup).version === 1 && Array.isArray((x as Backup).workouts)

// Restore matches on these. Logger workouts have a client_id; hand-added ones and runs don't, so they match on content.
// ponytail: two hand-added workouts with the same date, source and title count as one; rare enough.
export const workoutKey = (w: Pick<ImportWorkout, 'date' | 'source' | 'title' | 'client_id'>) => w.client_id ?? `${w.date}|${w.source}|${w.title ?? ''}`
export const activityKey = (a: Pick<ImportActivity, 'external_id' | 'date' | 'sport' | 'distance_m' | 'moving_s'>) => a.external_id ?? `${a.date}|${a.sport}|${a.distance_m}|${a.moving_s}`
export const recordKey = (r: { name: string; value: string; date: string | null; source: string }) => `${r.name}|${r.value}|${r.date}|${r.source}`
export const goalKey = (g: { exercise: string; target: string; source: string }) => `${g.exercise}|${g.target}|${g.source}`
export const routineKey = (r: { name: string; body: string }) => `${r.name.trim()}|${r.body}`
