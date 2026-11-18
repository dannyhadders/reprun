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
eq(suggest({ repsMin: 8, repsMax: 10, weight: 50 }, [{ weight_kg: 56, reps: 10, rpe: 9 }, { weight_kg: 56, reps: 10, rpe: 9 }]), { weight: 56, reps: 10, held: true }, 'top of range but felt hard: hold')
eq(suggest({ repsMin: 8, repsMax: 10, weight: 50 }, [{ weight_kg: 56, reps: 10, rpe: 7 }, { weight_kg: 56, reps: 10, rpe: 7 }]), { weight: 58.5, reps: 8 }, 'top of range, felt fine: add weight')
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

// Weekly streak and milestones (src/lib/stats.ts, milestones.ts).
const { buildModel, weekStreak } = await import('../src/lib/stats.ts')
const { milestones } = await import('../src/lib/milestones.ts')
const set = (id: number, kg: number, reps: number, rpe: number | null = null) => ({ id, workout_id: 0, exercise_id: 1, position: 0, weight_kg: kg, reps, seconds: null, notes: null, rpe })
// Weeks of Mon 2026-10-26, 11-02, 11-09 (3 each), then 11-16 with 1 so far.
const days = ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']
const data = {
  exercises: [{ id: 1, name: 'Squat', muscle: 'legs' as const, lift: 'squat' as const }],
  workouts: days.map((date, i) => ({ id: i + 1, date, title: 'Legs', notes: null, source: 'app', duration_s: 3600, client_id: null, sets: [set(i + 1, 90 + i * 2, 5)] })),
  activities: [], records: [], goals: [], bodyWeight: [], routines: [], aliases: {}, demo: false,
  profile: { age: null, sex: 'male' as const, weight_kg: null },
  strava: { configured: false, connected: false, lastSync: null },
}
const model = buildModel(data)
eq(weekStreak(model, 3, '2026-11-17'), { weeks: 3, thisWeek: 1, target: 3 }, 'streak: this week under target neither counts nor breaks it')
eq(weekStreak(model, 4, '2026-11-17').weeks, 0, 'streak: target never hit')
eq(weekStreak(model, 1, '2026-11-17').weeks, 4, 'streak: this week counts once hit')
const ms = milestones(model, 3)
const got = (k: string) => ms.find(x => x.key === k)
eq(got('sessions:10')?.date, '2026-11-16', 'milestone: 10th workout on its date')
eq(got('heaviest:100')?.date, '2026-11-05', 'milestone: first 100 kg lift (90 + 5×2, the 6th)')
eq(got('streak:2')?.date, '2026-11-05', 'milestone: 2-week streak on the day week 2 hit 3')
eq([got('sessions:25')?.date, got('sessions:25')?.progress], [null, 0.4], 'milestone: next step with progress')
assert(!got('sessions:50'), 'milestone: only the next step up is shown')
console.log('streak + milestones self-check passed')
eq([0, -2, null, 99].map(t => weekStreak(model, t, '2026-11-17').target), [1, 1, 1, 7], 'streak: a bad target is clamped (default 1), never loops')
const { rpe, cleanProfile } = await import('../shared/rules.ts')
eq([9, 1, 10, 0, 11, 8.5, '9', null, undefined].map(rpe), [9, 1, 10, null, null, null, null, null, null], 'rpe: whole 1-10 only')
eq([cleanProfile({ weekly: 4 }).weekly, cleanProfile({ weekly: 0 }).weekly, cleanProfile({}).weekly], [4, undefined, undefined], 'profile: weekly kept only when 1-7')
console.log('effort + profile self-check passed')
// Running milestones: a half marathon and a sub-25 5K (24 min) from two runs.
const run = (id: number, date: string, km: number, mins: number) => ({ id, date, start: null, sport: 'Run', name: null, distance_m: km * 1000, moving_s: mins * 60, elapsed_s: mins * 60, elevation_m: null, avg_hr: null, notes: null, source: 'strava', external_id: String(id), sample: 0 })
const rm = milestones(buildModel({ ...data, workouts: [], activities: [run(1, '2026-11-01', 5, 24), run(2, '2026-11-08', 21.2, 130)] }), 1)
const rgot = (k: string) => rm.find(x => x.key.startsWith(k))
eq([rgot('distance:21')?.title, rgot('distance:21')?.date], ['First half marathon', '2026-11-08'], 'run: half marathon')
eq(rgot('distance:42')?.date, null, 'run: marathon still to come')
assert(rm.some(x => x.title === '5K in under 25 min' && x.date === '2026-11-01') && rm.some(x => x.title === '5K in under 22.5 min' && !x.date), 'run: 5K time ladder')
assert(!milestones(buildModel({ ...data, activities: [] }), 1).some(x => x.key.startsWith('km:')), 'no running goals for someone who never runs')
console.log('running milestones self-check passed')

// Swap an exercise mid-workout (session.ts). session.ts pulls in app code that reads build-time globals, so set those first.
Object.assign(globalThis, { __LOCAL__: false, __BUILD__: { sha: 'check', date: '' }, addEventListener: () => {} })
// ponytail: a non-literal path so tsc doesn't pull session.ts (browser code) into the Node type-check; typed as any here.
const sessionPath: string = '../src/lib/session.ts'
const { swapExercise } = await import(sessionPath)
{
  const ex = {
    name: 'Bench Press', muscle: 'chest' as const, restS: 120, rpe: 8, collapsed: true,
    target: { sets: 3, repsMin: 8, repsMax: 10, note: 'pause at the bottom' },
    suggest: { weight: '60', reps: '9' },
    sets: [{ weight: '60', reps: '9', done: true, note: 'felt easy' }, { weight: '60', reps: '9', done: false, note: 'wide grip' }, { weight: '', reps: '', done: false }],
  }
  const last = [{ weight_kg: 40, reps: 10 }, { weight_kg: 40, reps: 10 }] as never[]
  const s = swapExercise(ex, 'Machine Chest Press', 'chest', last)
  eq([s.name, s.muscle, s.restS], ['Machine Chest Press', 'chest', 120], 'swap: new name, rest kept')
  eq(s.sets[0], ex.sets[0], 'swap: ticked set keeps its numbers and note')
  eq(s.sets[1], { weight: '', reps: '', done: false, note: 'wide grip' }, 'swap: unticked set clears kg/reps, keeps note')
  eq(s.target, { sets: 3, repsMin: 8, repsMax: 10, note: null }, 'swap: plan sets/reps carry, old note goes')
  eq([s.suggest?.weight, s.rpe, s.collapsed], ['42.5', undefined, undefined], 'swap: suggestion from the new one, effort and fold reset')
  eq(swapExercise({ ...ex, target: undefined }, 'Dips', 'chest', []).suggest, undefined, 'swap: no plan, no suggestion')
  console.log('swap self-check passed')
}

// Streak nudge and Sunday recap (src/lib/reminders.ts). Same data: weeks of 3, then 1 so far in the week of Mon 2026-11-16.
{
  const { reminders } = await import('../src/lib/reminders.ts')
  const withTarget = (weekly: number) => buildModel({ ...data, profile: { ...data.profile, weekly } })
  const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime() // November 2026, local time
  const tue = new Date(2026, 10, 17, 10)

  const [nudge, recap] = reminders(withTarget(3), 'Legs', tue)
  eq([nudge.kind, nudge.at, nudge.title], ['nudge', at(20, 18), 'Keep your 3-week streak going 🔥'], 'nudge: 2 to go on Tuesday → Friday 6pm, a spare day left')
  assert(nudge.body.startsWith('2 more sessions this week keeps it alive. Next up: Legs.'), nudge.body)
  eq([recap.kind, recap.at, recap.title], ['recap', at(22, 19), 'Your week: 1 session'], 'recap: Sunday 7pm, under target so no tick')
  assert(recap.body.startsWith('1 gym session · 1 PB 🏆. Streak: 3 weeks 🔥.'), recap.body)

  eq(reminders(withTarget(3), null, new Date(2026, 10, 21, 10))[0].at, at(21, 18), 'nudge: past the spare day, today at 6pm')
  eq(reminders(withTarget(3), null, new Date(2026, 10, 21, 19)).map(n => n.kind), ['recap'], 'nudge: 2 to go with only Sunday left, none')
  const hit = reminders(withTarget(1), null, tue)
  eq(hit.map(n => n.kind), ['recap'], 'nudge: week already hit, none')
  assert(hit[0].title === 'Your week: 1 session ✅' && hit[0].body.includes('Streak: 4 weeks 🔥.'), hit[0].title + hit[0].body)
  eq(reminders(withTarget(1), null, new Date(2026, 10, 22, 20)), [], 'recap: Sunday evening gone, none until next week')

  const none = buildModel({ ...data, workouts: [] })
  const [n0, r0] = reminders(none, 'Push day', new Date(2026, 10, 16, 9))
  eq([n0.title, n0.at], ['Time for a session?', at(21, 18)], 'nothing yet, target 1: Saturday 6pm')
  assert(n0.body.startsWith('One more session this week hits your target of 1. Next up: Push day.'), n0.body)
  eq(r0.title, 'A quiet week', 'quiet week recap')
  console.log('reminders self-check passed')
}
