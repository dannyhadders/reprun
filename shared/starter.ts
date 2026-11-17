// Starter routines for a new copy with none yet (Planner → "Add starter routines"). Plain plan text, so they
// parse, edit and progress like any pasted plan. No weights: the logger suggests them from the first session on.
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
]
