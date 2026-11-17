// Self-check for the phone-only copy (src/lib/local.ts): npx tsx scripts/check-local.ts
const mem = new Map<string, string>()
Object.assign(globalThis, { __LOCAL__: true, localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } })
const { local } = await import('../src/lib/local.ts')
const { toBackup } = await import('../shared/backup.ts')
const { demoData } = await import('../shared/demo.ts')
import type { Backup, Data, ImportResult } from '../shared/types.ts'

const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const get = () => local<Data>('GET', 'data')
const count = (d: Data) => [d.workouts.length, d.workouts.reduce((n, w) => n + w.sets.length, 0), d.routines.length, d.bodyWeight.length, d.records.length, d.goals.length].join('/')

// Empty to start with.
assert((await get()).workouts.length === 0, 'starts empty')

// Demo history as a backup: in, then in again adds nothing.
const demo = demoData('2026-11-16')
const b: Backup = { app: 'reprun', version: 1, exported: '', ...demo.payload, routines: demo.routines, bodyWeight: demo.bodyWeight, profile: demo.profile }
const r1 = await local<ImportResult>('POST', 'import', b)
assert(r1.workouts > 20 && r1.sets > 300, `restore adds the history (${r1.workouts}/${r1.sets})`)
const d1 = await get()
const r2 = await local<ImportResult>('POST', 'import', b)
assert(r2.workouts === 0 && r2.sets === 0 && !r2.routines && !r2.bodyWeight && !r2.records && !r2.goals, 'restoring twice adds nothing')
assert(count(await get()) === count(d1), 'same counts after the second restore')
assert(d1.profile.age === demo.profile.age, 'profile restored')

// Its own backup back in adds nothing, and nothing goes missing on the way out.
assert((await local<ImportResult>('POST', 'import', toBackup(d1))).workouts === 0, 'own backup adds nothing')
assert(JSON.stringify(toBackup(d1).workouts) === JSON.stringify(toBackup(await get()).workouts), 'backup round trip is lossless')

// Sorted like the Worker: newest workout first, sets in order.
const ws = d1.workouts
assert(ws.every((w, i) => i === 0 || ws[i - 1].date >= w.date), 'workouts newest first')
assert(ws.every(w => w.sets.every((s, i) => i === 0 || w.sets[i - 1].position <= s.position)), 'sets in position order')
assert(ws.every(w => w.sets.every(s => s.workout_id === w.id)), 'sets point at their workout')

// A logger upload: once, and a retry is skipped.
const up = { workouts: [{ date: '2026-11-17', title: 'Push day', notes: null, source: 'app', duration_s: 3000, client_id: 'c1', sets: [{ exercise: 'Brand New Lift', muscle: 'chest' as const, lift: null, position: 0, weight_kg: 50, reps: 8, seconds: null, notes: null }] }], activities: [], records: [], goals: [] }
assert((await local<ImportResult>('POST', 'import', up)).workouts === 1, 'upload saves')
assert((await local<ImportResult>('POST', 'import', up)).workouts === 0, 'retried upload skipped')
const mine = (await get()).workouts.find(w => w.client_id === 'c1')!
assert(mine && (await get()).exercises.some(e => e.name === 'Brand New Lift' && e.id === mine.sets[0].exercise_id), 'new exercise added and linked')

// Edits.
await local('PATCH', `sets/${mine.sets[0].id}`, { weight_kg: '52.5', reps: '6', seconds: null, notes: 'hard' })
const s = (await get()).workouts.find(w => w.client_id === 'c1')!.sets[0]
assert(s.weight_kg === 52.5 && s.reps === 6 && s.notes === 'hard', 'set edit')
assert(await local('PATCH', `sets/${s.id}`, { weight_kg: '-1' }).then(() => false, () => true), 'negative weight refused')
await local('PATCH', `workouts/${mine.id}`, { title: 'Chest', notes: null })
assert((await get()).workouts.find(w => w.id === mine.id)!.title === 'Chest', 'workout rename')
await local('DELETE', `workouts/${mine.id}`)
assert(!(await get()).workouts.some(w => w.id === mine.id), 'workout delete')
await local('POST', 'body-weight', { date: '2026-11-17', kg: 80 })
await local('POST', 'body-weight', { date: '2026-11-17', kg: 79.5 })
assert((await get()).bodyWeight.filter(x => x.date === '2026-11-17').map(x => x.kg).join() === '79.5', 'body weight replaces by date')
await local('POST', 'routines', { routines: [{ name: 'Arms', body: 'Curl – 3x10' }] })
const arms = (await get()).routines.find(r => r.name === 'Arms')!
await local('PUT', `routines/${arms.id}`, { name: 'Arms 2', body: 'Curl – 3x12' })
assert((await get()).routines.find(r => r.id === arms.id)!.name === 'Arms 2', 'routine edit')
assert(await local('POST', 'routines', { routines: [{ name: '', body: 'x' }] }).then(() => false, () => true), 'empty routine refused')
assert(await local('GET', 'strava/connect').then(() => false, () => true), 'strava refused')
// A hand-edited backup with junk in it: the junk is skipped, nothing crashes.
const junk = { ...toBackup(await get()), routines: [{ name: null, body: 'x' }, null, { name: 'Legs', body: 'Squat – 3x5' }], bodyWeight: [{ date: 'nope', kg: 1 }, { date: '2026-12-01', kg: 0 }, { date: '2026-12-01', kg: 81 }], records: [null] } as unknown as Backup
const rj = await local<ImportResult>('POST', 'import', junk)
assert(rj.routines === 1 && rj.bodyWeight === 1 && rj.records === 0, `junk skipped, good rows kept (${rj.routines}/${rj.bodyWeight}/${rj.records})`)
// Rename and merge (shared/exercises.ts): history moves, routines and goals follow, old names become aliases.
await local('POST', 'routines', { routines: [{ name: 'Typo day', body: 'Bench Pres – 3x8, rest 90s\nSquat – 3x5' }] })
const typo = { workouts: [{ date: '2026-11-18', title: 'Typo', notes: null, source: 'app', duration_s: 600, client_id: 'typo1', sets: [{ exercise: 'Bench Pres', muscle: 'other' as const, lift: null, position: 0, weight_kg: 70, reps: 5, seconds: null, notes: null }] }], activities: [], records: [], goals: [] }
await local('POST', 'import', typo)
let dd = await get()
const bad = dd.exercises.find(e => e.name === 'Bench Pres')!, bench = dd.exercises.find(e => e.name === 'Bench Press')!
const benchSets = dd.workouts.flatMap(w => w.sets).filter(s => s.exercise_id === bench.id).length
await local('PATCH', `exercises/${bad.id}`, { name: 'Bench Prez', muscle: 'chest' })
dd = await get()
assert(dd.exercises.find(e => e.id === bad.id)!.name === 'Bench Prez' && dd.exercises.find(e => e.id === bad.id)!.muscle === 'chest', 'rename + muscle')
assert(dd.routines.find(r => r.name === 'Typo day')!.body.startsWith('Bench Prez – 3x8'), 'routine follows a rename')
assert(await local('PATCH', `exercises/${bad.id}`, { name: 'bench press' }).then(() => false, () => true), 'rename onto an existing name refused')
const m = await local<{ moved: number }>('POST', `exercises/${bad.id}/merge`, { into: bench.id })
dd = await get()
assert(m.moved === 1 && !dd.exercises.some(e => e.id === bad.id), 'merge moves the set and removes the duplicate')
assert(dd.workouts.flatMap(w => w.sets).filter(s => s.exercise_id === bench.id).length === benchSets + 1, 'merged set is on Bench Press')
assert(dd.routines.find(r => r.name === 'Typo day')!.body.startsWith('Bench Press – 3x8'), 'routine follows a merge')
assert(dd.aliases['bench pres'] === 'Bench Press' && dd.aliases['bench prez'] === 'Bench Press', 'old names alias to the survivor')
// An upload still using the oldest name (e.g. sat in the outbox) lands on Bench Press, not a new exercise.
await local('POST', 'import', { ...typo, workouts: [{ ...typo.workouts[0], client_id: 'typo2' }] })
dd = await get()
assert(!dd.exercises.some(e => /bench pre[sz]$/i.test(e.name)) && dd.workouts.find(w => w.client_id === 'typo2')!.sets[0].exercise_id === bench.id, 'old name in an upload lands on the survivor')
assert(await local('POST', `exercises/${bench.id}/merge`, { into: bench.id }).then(() => false, () => true), 'merge into itself refused')
// Review fixes: case-only renames, targets via aliases, forgetting an old name, muscle-only edits, catalogue + alias.
const { matchExercise } = await import('../shared/exercises.ts')
const up2 = (id: string, ex: string) => ({ workouts: [{ date: '2026-11-19', title: 'x', notes: null, source: 'app', duration_s: 60, client_id: id, sets: [{ exercise: ex, muscle: 'other' as const, lift: null, position: 0, weight_kg: 10, reps: 10, seconds: null, notes: null }] }], activities: [], records: [], goals: [] })
await local('POST', 'import', up2('c-fly', 'cable fly'))
let d3 = await get()
const fly = d3.exercises.find(e => e.name === 'cable fly')!
await local('PATCH', `exercises/${fly.id}`, { name: 'Cable Fly' })
await local('POST', 'import', up2('c-fly2', 'cable fly')) // an upload made before the rename
d3 = await get()
assert(d3.exercises.filter(e => e.name.toLowerCase() === 'cable fly').length === 1, 'case-only rename does not split history')
await local('PATCH', `exercises/${fly.id}`, { muscle: 'chest' })
assert((await get()).exercises.find(e => e.id === fly.id)!.muscle === 'chest', 'muscle-only edit fine')
await local('POST', 'import', { workouts: [], activities: [], records: [], goals: [{ exercise: 'Bench Pres', latest: null, target: '90 kg', context: null, source: 'sheet' }] })
assert((await get()).goals.some(g => g.target === '90 kg' && g.exercise === 'Bench Press'), 'sheet targets go through aliases')
d3 = await get()
const benchId = d3.exercises.find(e => e.name === 'Bench Press')!.id
await local('PATCH', `exercises/${benchId}`, { name: 'Flat Bench' })
d3 = await get()
assert(matchExercise('bench', d3.exercises, d3.aliases)?.name === 'Flat Bench', 'catalogue name then alias: "bench" finds Flat Bench')
await local('DELETE', `aliases/${encodeURIComponent('bench pres')}`)
assert(!('bench pres' in (await get()).aliases), 'forget an old name')
assert(JSON.stringify(toBackup(await get()).aliases) === JSON.stringify((await get()).aliases), 'backup carries aliases')
assert(await local('GET', `exercises/${benchId}`).then(() => false, () => true), 'wrong method refused')
// Profile: goals cleaned to known ids, no repeats, two at most; sex falls back to male.
await local('PUT', 'profile', { age: '34', weight_kg: 82.5, sex: 'nope', goals: ['lose', 'lose', 'made-up', 'strength', 'muscle'] })
const prof = (await get()).profile
assert(JSON.stringify(prof) === JSON.stringify({ age: 34, sex: 'male', weight_kg: 82.5, goals: ['lose', 'strength'] }), `profile cleaned: ${JSON.stringify(prof)}`)
assert(JSON.stringify(toBackup(await get()).profile.goals) === '["lose","strength"]', 'backup carries goals')
console.log('local: all checks passed')
