import type { GoalId } from './rules.ts'

export type Muscle = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'other'
export type Lift = 'bench' | 'squat' | 'deadlift' | 'ohp'

export type Exercise = { id: number; name: string; muscle: Muscle; lift: Lift | null }

export type WorkoutSet = {
  id: number
  workout_id: number
  exercise_id: number
  position: number
  weight_kg: number | null
  reps: number | null
  seconds: number | null
  notes: string | null
  rpe?: number | null // how hard the exercise felt, 1-10; older sets and imports have none
  warmup?: number | boolean | null // 1/true: a warm-up set, saved but left out of PBs, volume, counts and progression
}
/** A working set, not a warm-up: what every stat counts. */
export const working = <S extends { warmup?: number | boolean | null }>(s: S) => !s.warmup

export type Workout = {
  id: number
  date: string
  title: string | null
  notes: string | null
  source: string
  duration_s: number | null // set by the live logger
  client_id: string | null // set by the live logger, makes uploads idempotent
  sets: WorkoutSet[]
}

export type Activity = {
  id: number
  date: string
  start: string | null
  sport: string
  name: string | null
  distance_m: number | null
  moving_s: number | null
  elapsed_s: number | null
  elevation_m: number | null
  avg_hr: number | null
  notes: string | null
  source: string
  external_id: string | null
  sample: number
}

export type RecordRow = { id: number; category: string | null; name: string; value: string; date: string | null; context: string | null; source: string }
export type Goal = { id: number; exercise: string; latest: string | null; target: string; context: string | null; source: string }
export type BodyWeight = { date: string; kg: number; source: string }
export type Routine = { id: number; name: string; body: string; created: string }
export type Profile = { age: number | null; sex: 'male' | 'female'; weight_kg: number | null; goals?: GoalId[]; weekly?: number; unit?: 'kg' | 'lb'; units?: Record<string, 'kg' | 'lb'>; setup?: Record<string, string> } // setup: an exercise's setup note (lower-case name → text) // goals: up to two, from onboarding or Settings; weekly: sessions a week for the streak (1-7)

export type Data = {
  exercises: Exercise[]
  workouts: Workout[]
  activities: Activity[]
  records: RecordRow[]
  goals: Goal[]
  bodyWeight: BodyWeight[]
  routines: Routine[]
  profile: Profile
  aliases: Record<string, string> // your renamed/merged exercises: old name (lower case) → current name
  demo: boolean
  strava: { configured: boolean; connected: boolean; lastSync: string | null }
}

// What an import sends: exercises by name, no ids yet.
export type ImportSet = Omit<WorkoutSet, 'id' | 'workout_id' | 'exercise_id'> & { exercise: string; muscle: Muscle; lift: Lift | null }
export type ImportWorkout = { date: string; title: string | null; notes: string | null; source: string; sets: ImportSet[]; duration_s?: number | null; client_id?: string | null }
export type ImportActivity = Omit<Activity, 'id'>
export type ImportPayload = {
  workouts: ImportWorkout[]
  activities: ImportActivity[]
  records: Omit<RecordRow, 'id'>[]
  goals: Omit<Goal, 'id'>[]
}
export type ImportResult = { workouts: number; skipped: string[]; sets: number; activities: number; records: number; goals: number; routines?: number; bodyWeight?: number }

// Everything, in one file (Settings → Backup). Restoring it merges: what's already there is kept as it is.
export type Backup = ImportPayload & {
  app: 'reprun'
  version: 1
  exported: string
  routines: Pick<Routine, 'name' | 'body'>[]
  bodyWeight: BodyWeight[]
  profile: Profile
  aliases?: Record<string, string> // renamed/merged exercise names (shared/exercises.ts)
}
