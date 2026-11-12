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
}

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
export type Profile = { age: number | null; sex: 'male' | 'female'; weight_kg: number | null }

export type Data = {
  exercises: Exercise[]
  workouts: Workout[]
  activities: Activity[]
  records: RecordRow[]
  goals: Goal[]
  bodyWeight: BodyWeight[]
  routines: Routine[]
  profile: Profile
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
export type ImportResult = { workouts: number; skipped: string[]; sets: number; activities: number; records: number; goals: number }
