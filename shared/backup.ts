// Backup files: build one from the app's data, and the keys a restore uses to spot what's already there.
import { isDate, routineOk } from './rules.ts'
import type { Backup, BodyWeight, Data, Goal, ImportActivity, ImportWorkout, RecordRow, Routine, Workout } from './types.ts'

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

/** Which incoming workouts are already here. Spreadsheet days match on date, logger uploads on client_id,
 *  backups on workoutKey. Remembers what it lets through, so a file can't add the same workout twice. */
export function workoutSeen(rows: Pick<Workout, 'date' | 'source' | 'title' | 'client_id'>[], backup: boolean) {
  const days = new Set(rows.map(w => `${w.date}|${w.source}`))
  const clientIds = new Set(rows.map(w => w.client_id))
  const keys = new Set(rows.map(workoutKey))
  return (w: ImportWorkout) => {
    const seen = backup ? keys.has(workoutKey(w)) : w.client_id ? clientIds.has(w.client_id) : w.source === 'sheet' && days.has(`${w.date}|${w.source}`)
    if (seen) return true
    keys.add(workoutKey(w))
    if (w.client_id) clientIds.add(w.client_id) // days aren't added: a sheet with two sessions on one day keeps both, as before
    return false
  }
}

/** The rest of a backup restore: only what's missing. Nothing here is ever changed or deleted. */
export function planRestore(have: { activities: ImportActivity[]; records: Omit<RecordRow, 'id'>[]; goals: Omit<Goal, 'id'>[]; routines: Pick<Routine, 'name' | 'body'>[]; bodyWeight: Pick<BodyWeight, 'date'>[] }, b: Backup) {
  // Checked before keying, so a hand-edited file can't crash the restore half-way.
  const list = <T,>(x: unknown, valid: (r: T) => boolean = r => !!r && typeof r === 'object') => (Array.isArray(x) ? (x as T[]) : []).filter(valid)
  const missing = <T,>(rows: T[], incoming: T[], key: (x: T) => string) => {
    const s = new Set(rows.map(key))
    return incoming.filter(x => !s.has(key(x)))
  }
  const weights = new Set(have.bodyWeight.map(w => w.date)) // one per date, like the table's primary key
  return {
    activities: missing(have.activities, list(b.activities), activityKey),
    records: missing(have.records, list(b.records), recordKey),
    goals: missing(have.goals, list(b.goals), goalKey),
    routines: missing(have.routines, list<Pick<Routine, 'name' | 'body'>>(b.routines, r => !!r && routineOk(r)), routineKey),
    bodyWeight: list<BodyWeight>(b.bodyWeight, w => !!w && isDate(w.date) && Number(w.kg) > 0).filter(w => !weights.has(w.date) && !!weights.add(w.date)),
  }
}
