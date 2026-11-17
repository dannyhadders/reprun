// Self-check for the plan parser and progression rule: npx tsx scripts/check-plan.ts
import { estimateS, formatLine, parseLine, parsePlan, roughTime, suggest } from '../shared/plan.ts'
import { resolveExercise } from '../shared/catalogue.ts'
import { STARTER_ROUTINES } from '../shared/starter.ts'

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
