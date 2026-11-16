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
console.log('local: all checks passed')
