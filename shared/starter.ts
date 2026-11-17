// Starter routines for a new copy with none yet (Planner → "Add starter routines", onboarding). Plain plan text, so they
// parse, edit and progress like any pasted plan. No weights: the logger suggests them from the first session on.
import type { GoalId } from './rules.ts'

export const STARTER_ROUTINES: { name: string; body: string }[] = [
  {
    name: 'Push day',
    body: `Bench Press – 3x6-8, rest 2 min
Incline Dumbbell Press – 3x8-10, rest 90s
Overhead Press – 3x6-8, rest 2 min
Lateral Raise – 3x12-15, rest 60s
Triceps Pushdown – 3x10-12, rest 60s`,
  },
  {
    name: 'Pull day',
    body: `Lat Pulldown – 3x8-10, rest 90s
Seated Cable Row – 3x8-10, rest 90s
Face Pull – 3x12-15, rest 60s
Barbell Curl – 3x8-10, rest 60s
Hammer Curl – 3x10-12, rest 60s`,
  },
  {
    name: 'Leg day',
    body: `Squat – 3x6-8, rest 3 min
Romanian Deadlift – 3x8-10, rest 2 min
Incline Leg Press – 3x10-12, rest 90s
Leg Curl – 3x10-12, rest 60s
Calf Raise – 3x12-15, rest 60s`,
  },
  {
    name: 'Back day',
    body: `Deadlift – 3x5, rest 3 min
Barbell Row – 3x6-8, rest 2 min
Pull-up – 3x5-8, rest 2 min
Single-arm Dumbbell Row – 3x8-10, rest 90s
Back Extension – 3x10-12, rest 60s`,
  },
  {
    name: 'Arms day',
    body: `EZ-bar Curl – 3x8-10, rest 60s
Close-grip Bench Press – 3x6-8, rest 90s
Incline Dumbbell Curl – 3x10-12, rest 60s
Overhead Triceps Extension – 3x10-12, rest 60s
Cable Curl – 3x12-15, rest 60s`,
  },
  {
    name: 'Full body',
    body: `Goblet Squat – 3x10-12, rest 90s
Push-up – 3x8-12, rest 60s
Single-arm Dumbbell Row – 3x10-12, rest 60s
Romanian Deadlift – 3x8-10, rest 90s
Dumbbell Shoulder Press – 3x8-10, rest 60s
Dead Bug – 3x10-12, rest 45s`,
  },
  {
    name: 'Conditioning',
    body: `Kettlebell Swing – 3x15, rest 45s
Walking Lunge – 3x10-12, rest 60s
Push-up – 3x10-15, rest 45s
Seated Cable Row – 3x12-15, rest 45s
Leg Raise – 3x10-12, rest 45s`,
  },
]

// Which starters suit which goal. No goals: the five split days, as before goals existed.
const FOR: Record<GoalId, string[]> = {
  strength: ['Push day', 'Pull day', 'Leg day'],
  muscle: ['Push day', 'Pull day', 'Leg day', 'Back day', 'Arms day'],
  lose: ['Full body', 'Conditioning'],
  fitness: ['Full body', 'Conditioning'],
  running: ['Leg day', 'Full body'], // strength for runners: legs and the whole chain
  consistent: ['Full body'],
}
const SPLIT = ['Push day', 'Pull day', 'Leg day', 'Back day', 'Arms day']
/** The starters for these goals, in a sensible order, without repeats. */
export const startersFor = (goals: GoalId[] = []) => STARTER_ROUTINES.filter(r => (goals.length ? goals.some(g => FOR[g].includes(r.name)) : SPLIT.includes(r.name)))
