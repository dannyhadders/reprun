// Self-check for the plan parser and progression rule: npx tsx scripts/check-plan.ts
import { estimateS, formatLine, parseLine, parsePlan, roughTime, suggest } from '../shared/plan.ts'
import { resolveExercise } from '../shared/catalogue.ts'
import { STARTER_ROUTINES } from '../shared/starter.ts'
import { livePb, type ExerciseSession } from '../src/lib/stats.ts'
import { fromStravaCsv, isStravaCsv, parseCsv, stravaDate } from '../shared/stravaCsv.ts'
import { cleanGoals } from '../shared/rules.ts'

const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)

eq(parseLine('EZ-bar Curl – 3x10-12 @ 19kg, rest 75s; squeeze at the top'),
  { name: 'EZ-bar Curl', sets: 3, repsMin: 10, repsMax: 12, weight: 19, restS: 75, note: 'squeeze at the top' }, 'full line')
eq(parseLine('- 3 x 10 lat pulldown'), { name: 'lat pulldown', sets: 3, repsMin: 10, repsMax: 10, weight: null, restS: null, note: null }, 'sets first')
eq(parseLine('Squats - 4 sets of 6-8 @ 80kg (rest 2 min)')?.restS, null, 'rest inside a note stays a note')
eq(parseLine('Squats - 4 sets of 6-8 @ 80kg, rest 2 min'), { name: 'Squats', sets: 4, repsMin: 6, repsMax: 8, weight: 80, restS: 120, note: null }, 'sets of, minutes')
eq(parseLine('1. **Chest-supported Dumbbell Row**: 3×12, 90s rest')?.name, 'Chest-supported Dumbbell Row', 'markdown + dash in name')
eq(parseLine('1. **Chest-supported Dumbbell Row**: 3×12, 90s rest')?.restS, 90, 'rest after value')
eq(parseLine('Warm up 5 min on the bike'), null, 'no sets = not an exercise')

const plan = parsePlan(`Here's your plan!\n\nArm day\nEZ-bar Curl – 3x10-12 @ 19kg\nHammer Curl – 3x12\n\nBack day:\nWarm up 5 min row\nLat Pulldown 4x8-12 @ 52kg`)
eq(plan.map(r => [r.name, r.items.length]), [['Arm day', 2], ['Back day', 1]], 'splits on headings, drops chatter')
eq(plan[1].unparsed, ['Warm up 5 min row'], 'stray line kept for the preview')

const item = parseLine('Lateral Raise – 3x12-15 @ 10kg, rest 45s; slow')!
eq(parseLine(formatLine(item)), item, 'format round-trips')

eq(suggest({ repsMin: 8, repsMax: 10, weight: 50 }, []), { weight: 50, reps: 8 }, 'no history: plan weight')
eq(suggest({ repsMin: 8, repsMax: 10, weight: 50 }, [{ weight_kg: 56, reps: 10 }, { weight_kg: 56, reps: 10 }]), { weight: 58.5, reps: 8 }, 'top of range: add weight')
eq(suggest({ repsMin: 8, repsMax: 10, weight: 50 }, [{ weight_kg: 56, reps: 10 }, { weight_kg: 56, reps: 8 }]), { weight: 56, reps: 10 }, 'not every set: one more rep')
eq(suggest({ repsMin: 10, repsMax: 12, weight: null }, [{ weight_kg: 10, reps: 12 }]), { weight: 11, reps: 10 }, 'light dumbbell: +1 kg')
eq(suggest({ repsMin: 10, repsMax: 12, weight: null }, [{ weight_kg: null, reps: 15 }]), { weight: null, reps: 16 }, 'bodyweight: +1 rep')
eq(estimateS([{ sets: 3, restS: 60 }]), 360, 'estimate: 3 x (40 + 60) + 60')
eq(estimateS([{ sets: 3, restS: null }]), 450, 'estimate: default rest 90 s')
eq([roughTime(2700), roughTime(3600), roughTime(4500), roughTime(60)], ['45 min', '1 hr', '1 hr 15 min', '5 min'], 'roughTime')
// Starter routines: every line parses, and every exercise is in the catalogue (not "other").
for (const r of STARTER_ROUTINES) {
  const items = parsePlan(r.body).flatMap(x => x.items)
  eq(items.length, r.body.split('\n').length, `${r.name}: every line parses`)
  for (const it of items) assert(resolveExercise(it.name, null).muscle !== 'other', `${r.name}: ${it.name} is in the catalogue`)
}
console.log('plan.ts self-check passed')

// Live PB in the logger: same rule as buildModel's PBs.
const past = (sets: [number | null, number][]) => [{ date: '2026-01-01', workoutId: 1, sets: sets.map(([w, r], id) => ({ id, workout_id: 1, exercise_id: 1, set_no: id + 1, weight_kg: w, reps: r, seconds: null, notes: null })) }] as unknown as ExerciseSession[] // only weight and reps matter here
const live = (sets: [number | null, number, boolean][]) => sets.map(([weight_kg, reps, done]) => ({ weight_kg, reps, done }))
eq(livePb([], live([[100, 5, true]])), -1, 'pb: first session is the baseline')
eq(livePb(past([[80, 5]]), live([[85, 5, true], [90, 3, false]])), 0, 'pb: heaviest ticked set')
eq(livePb(past([[80, 5]]), live([[85, 5, true], [90, 3, true]])), 1, 'pb: moves to the heavier set')
eq(livePb(past([[80, 5]]), live([[80, 8, true]])), 0, 'pb: same weight, more reps = e1RM')
eq(livePb(past([[80, 5]]), live([[70, 5, true]])), -1, 'pb: lighter is no PB')
eq(livePb(past([[null, 10]]), live([[null, 12, true]])), 0, 'pb: bodyweight reps')
eq(livePb(past([[80, 5]]), live([[85, 5, false]])), -1, 'pb: not until ticked')
eq(livePb(past([[80, 5]]), live([[85, 0, true]])), -1, 'pb: no reps, not saved, no PB')

// Strava's activities.csv: repeated column names (km then metres), quoted multi-line descriptions, UTC dates.
process.env.TZ = 'Europe/London'
eq(parseCsv('a,"b ""c""",d\r\n"x\ny",2,\n'), [['a', 'b "c"', 'd'], ['x\ny', '2', '']], 'csv: quotes, newlines in quotes, CRLF')
eq(stravaDate('Nov 9, 2025, 9:15:30 PM')?.toISOString(), '2025-11-09T21:15:30.000Z', 'strava date: 12-hour, UTC')
eq(stravaDate('Jul 1, 2025, 12:05:00 AM')?.toISOString(), '2025-07-01T00:05:00.000Z', 'strava date: 12 AM is midnight')
const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Elapsed Time,Moving Time,Distance,Elevation Gain,Average Heart Rate,Total Sets,Total Reps,Total Weight Lifted\n' +
  '111,"Jul 1, 2025, 11:30:00 PM",Late run,Run,"Hot one\nwater stop",3148,7.76,3148.0,3142.0,7768.2,100.6,156.0,,,\n' +
  '222,"Nov 9, 2025, 6:00:00 AM",Gym,Weight Training,,3600,0,3600.0,3600.0,0.0,,120.0,12,96,4800\n'
assert(isStravaCsv(csv) && !isStravaCsv('Date,Exercise\n'), 'csv: recognised by its header')
const acts = fromStravaCsv(csv)
eq(acts.map(a => [a.date, a.start, a.sport, a.distance_m, a.moving_s, a.external_id]), [['2025-07-02', '00:30', 'Run', 7768.2, 3142, 'strava:111'], ['2025-11-09', '06:00', 'WeightTraining', null, 3600, 'strava:222']], 'csv: metres, local date across midnight (BST), sport names')
eq(acts[1].notes, 'Strava: 12 sets, 96 reps, 4800 kg lifted', 'csv: strength totals kept as a note')
eq(acts[0].notes, 'Hot one\nwater stop', 'csv: description kept')
eq(cleanGoals(['lose', 'x', 'lose', 'strength', 'muscle']), ['lose', 'strength'], 'goals: known, unique, two')
console.log('strava csv + goals self-check passed')

// Starters by goal: no goals keeps the original five; goals pick, combine and don't repeat.
const { startersFor } = await import('../shared/starter.ts')
eq(startersFor().map(r => r.name), ['Push day', 'Pull day', 'Leg day', 'Back day', 'Arms day'], 'starters: no goals = the split')
eq(startersFor(['lose']).map(r => r.name), ['Full body', 'Conditioning'], 'starters: lose weight')
eq(startersFor(['strength', 'running']).map(r => r.name), ['Push day', 'Pull day', 'Leg day', 'Full body'], 'starters: two goals, no repeats')
console.log('starters self-check passed')

// ChatGPT prompt: details only when known, the quiz, and the format.
const { planPrompt } = await import('../shared/plan.ts')
const pp = planPrompt(['Squat'], { goals: ['lose', 'strength'], weight_kg: 82, age: null, sex: 'female' })
assert(pp.includes("About me: I want to lose weight and get stronger, I weigh 82 kg, I'm a woman."), `prompt: about line: ${pp.split('\n')[1]}`)
assert(pp.includes('ask me a few short questions') && pp.includes('Bicep Curl – 3x8-10 @ 12kg') && pp.endsWith('exact exercise names: Squat.'), 'prompt: quiz, format, names')
assert(!planPrompt([]).includes('About me') && !planPrompt([]).includes('exact exercise names'), 'prompt: nothing known, nothing said')
console.log('prompt self-check passed')
