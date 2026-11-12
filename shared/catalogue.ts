import type { Lift, Muscle } from './types.ts'

type Entry = { name: string; muscle: Muscle; lift?: Lift }

// Names as ChatGPT writes them (lower case) -> one canonical exercise.
// Unknown names import as-is under "other"; add them here to tidy them up.
const ALIASES: Record<string, Entry> = {}
const add = (names: string[], e: Entry) => names.forEach(n => (ALIASES[n] = e))

add(['bench press', 'barbell bench press', 'bench'], { name: 'Bench Press', muscle: 'chest', lift: 'bench' })
add(['incline dumbbell press', 'incline db press'], { name: 'Incline Dumbbell Press', muscle: 'chest' })
add(['pec deck'], { name: 'Pec Deck', muscle: 'chest' })
add(['dumbbell chest flyes', 'dumbbell flyes', 'dumbbell fly'], { name: 'Dumbbell Fly', muscle: 'chest' })
add(['cable row', 'seated cable row'], { name: 'Seated Cable Row', muscle: 'back' })
add(['lat pulldown'], { name: 'Lat Pulldown', muscle: 'back' })
add(['chest-supported dumbbell row'], { name: 'Chest-supported Dumbbell Row', muscle: 'back' })
add(['back extension', 'back extensions'], { name: 'Back Extension', muscle: 'back' })
add(['deadlift', 'barbell deadlift'], { name: 'Deadlift', muscle: 'back', lift: 'deadlift' })
add(['shoulder press', 'dumbbell shoulder press'], { name: 'Dumbbell Shoulder Press', muscle: 'shoulders' })
add(['overhead press', 'barbell overhead press', 'ohp'], { name: 'Overhead Press', muscle: 'shoulders', lift: 'ohp' })
add(['lateral raise', 'lateral raises'], { name: 'Lateral Raise', muscle: 'shoulders' })
add(['dumbbell shrug', 'shrugs'], { name: 'Dumbbell Shrug', muscle: 'shoulders' })
add(['preacher curl'], { name: 'Preacher Curl', muscle: 'arms' })
add(['single-arm preacher curl over bench', 'single-arm preacher curl'], { name: 'Single-arm Preacher Curl', muscle: 'arms' })
add(['ez-bar curl'], { name: 'EZ-bar Curl', muscle: 'arms' })
add(['curls', 'bicep curl', 'biceps curl'], { name: 'Bicep Curl', muscle: 'arms' })
add(['hammer curl', 'hammer curls'], { name: 'Hammer Curl', muscle: 'arms' })
add(['cross-body hammer curl'], { name: 'Cross-body Hammer Curl', muscle: 'arms' })
add(['triceps pushdown', 'tricep pushdown'], { name: 'Triceps Pushdown', muscle: 'arms' })
add(['overhead triceps extension', 'overhead triceps extension (drop set)'], { name: 'Overhead Triceps Extension', muscle: 'arms' })
add(['skull crushers'], { name: 'Skull Crusher', muscle: 'arms' })
add(['incline leg press', 'incline leg press (earlier comparison)', 'leg press'], { name: 'Incline Leg Press', muscle: 'legs' })
add(['leg extension'], { name: 'Leg Extension', muscle: 'legs' })
add(['prone leg curl'], { name: 'Lying Leg Curl', muscle: 'legs' })
add(['romanian deadlift'], { name: 'Romanian Deadlift', muscle: 'legs' })
add(['squat', 'back squat', 'barbell squat'], { name: 'Squat', muscle: 'legs', lift: 'squat' })
add(['split squat'], { name: 'Split Squat', muscle: 'legs' })
add(['calf raise', 'calf raises', 'calf dips', 'calf press'], { name: 'Calf Raise', muscle: 'legs' }) // same machine, logged under both names
add(['cable crunch'], { name: 'Cable Crunch', muscle: 'core' })
add(['leg raise', 'leg raises', 'bodyweight leg raise', 'weighted leg raise'], { name: 'Leg Raise', muscle: 'core' })
add(['reverse crunch'], { name: 'Reverse Crunch', muscle: 'core' })
add(['suitcase crunches'], { name: 'Suitcase Crunch', muscle: 'core' })
add(['weighted sit-up', 'sit-up'], { name: 'Sit-up', muscle: 'core' })
add(['russian twist', 'weighted russian twists'], { name: 'Russian Twist', muscle: 'core' })
add(['plank'], { name: 'Plank', muscle: 'core' })
add(['side plank'], { name: 'Side Plank', muscle: 'core' })

export function resolveExercise(raw: string, weightKg: number | null): Entry {
  const key = raw.trim().toLowerCase()
  const e = ALIASES[key] ?? { name: raw.trim(), muscle: 'other' as Muscle }
  // Two-arm preacher curls use the 9 kg bar; anything up to 10 kg is one arm.
  if (e.name === 'Preacher Curl' && weightKg !== null && weightKg <= 10) return ALIASES['single-arm preacher curl']
  return e
}
