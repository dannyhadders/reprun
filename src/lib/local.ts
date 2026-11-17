// Phone-only copies (the `local` build, app.reprun.co.uk): the Worker's /api routes, run in the browser
// over one Data object in localStorage. The import and restore rules come from shared/, so they match the Worker's.
// ponytail: the whole dataset is read and written per call; a year of training is ~0.5 MB, well inside localStorage.
import { isBackup, planRestore, workoutSeen } from '../../shared/backup.ts'
import { cleanProfile, isDate, num, routineOk, rpe, setNumbers } from '../../shared/rules.ts'
import { addAlias, exerciseNameOk, mergeAliases, MUSCLE_LIST, nameFiler, rewriteRoutine } from '../../shared/exercises.ts'
import type { Backup, BodyWeight, Data, ImportPayload, ImportResult, Muscle, Profile, Routine } from '../../shared/types.ts'
import { localISO } from './format.ts'

declare const __LOCAL__: boolean // vite.config.ts: true only in the phone-only build (CLOUDFLARE_ENV=local)
/** This is a phone-only copy: no server, everything lives in this browser. */
export const LOCAL = __LOCAL__
export const LOCAL_KEY = 'reprun.local'
const SAMPLE_KEY = 'reprun.sample' // set while the copy holds the made-up sample history

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
/** Has this phone picked "start fresh" or "sample data" yet? Until then the app shows the welcome screen. */
export const started = () => get(LOCAL_KEY) !== null
export const isSample = () => get(SAMPLE_KEY) === '1'

/** First run, or "start fresh" from sample data: an empty copy, or one filled with the demo's made-up history. */
export async function startLocal(sample: boolean) {
  // Ask iOS/Android not to clear this site's storage when space runs low. Installed home-screen apps usually get it.
  void (navigator as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.().catch(() => false)
  // Fetch the sample code before touching storage: if that fails (offline first open), nothing has changed.
  const mods = sample ? await Promise.all([import('../../shared/demo.ts'), import('../../shared/strava.ts')]) : null
  store(blank())
  for (const k of [SAMPLE_KEY, 'reprun.lastBackup']) localStorage.removeItem(k) // a backup of sample data doesn't count
  if (!mods) return
  const [{ demoData }, { fromStrava, sampleStravaActivities }] = mods
  const today = localISO()
  const d = demoData(today)
  const runs = sampleStravaActivities(today, d.payload.workouts.map(w => w.date)).filter(a => a.sport_type === 'Run').map(a => fromStrava(a, true))
  await local('POST', 'import', { app: 'reprun', version: 1, exported: today, ...d.payload, routines: d.routines, bodyWeight: d.bodyWeight, profile: d.profile } satisfies Backup)
  await local('POST', 'import', { workouts: [], activities: runs, records: [], goals: [] } satisfies ImportPayload)
  localStorage.setItem(SAMPLE_KEY, '1')
}

/** Settings → Start over: everything this copy keeps on the phone, gone. The welcome screen shows again. */
export function wipeLocal() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('reprun.')) localStorage.removeItem(k)
}

const blank = (): Data => ({
  exercises: [], workouts: [], activities: [], records: [], goals: [], bodyWeight: [], routines: [],
  profile: { age: null, sex: 'male', weight_kg: null },
  aliases: {},
  demo: false,
  strava: { configured: false, connected: false, lastSync: null },
})
const load = (): Data => {
  const s = localStorage.getItem(LOCAL_KEY)
  return s ? { ...blank(), ...(JSON.parse(s) as Data) } : blank() // older copies lack newer fields
}
// Not caught on purpose: a full or blocked storage must fail loudly, so a finished workout stays in the outbox.
const store = (d: Data) => localStorage.setItem(LOCAL_KEY, JSON.stringify(d))
const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1
const fail = (msg: string): never => { throw new Error(msg) }

/** Same order as the Worker's loadAll, so screens can't tell the difference. */
function sorted(d: Data): Data {
  const by = <T,>(rows: T[], ...keys: ((x: T) => string | number)[]) =>
    [...rows].sort((a, b) => { for (const k of keys) { const x = k(a), y = k(b); if (x !== y) return x < y ? -1 : 1 } return 0 })
  return {
    ...d,
    exercises: by(d.exercises, e => e.name),
    workouts: by(d.workouts, w => w.date, w => w.id).reverse().map(w => ({ ...w, sets: by(w.sets, s => s.position) })),
    activities: by(d.activities, a => a.date, a => a.start ?? '').reverse(),
    records: by(d.records, r => r.category ?? '', r => r.id),
    goals: by(d.goals, g => g.id),
    bodyWeight: by(d.bodyWeight, b => b.date),
    routines: by(d.routines, r => r.id),
  }
}

export async function local<T>(method: string, path: string, body?: unknown): Promise<T> {
  const [resource, id] = path.split('/')
  const d = load()
  const n = Number(id)
  let out: unknown = { ok: true }

  if (resource === 'data' && method === 'GET') return sorted(d) as T
  else if (resource === 'import' && method === 'POST') out = importLocal(d, body as ImportPayload | Backup)
  else if (resource === 'sets' && id) {
    // Like the Worker, editing or deleting something that's already gone does nothing.
    const w = d.workouts.find(w => w.sets.some(s => s.id === n))
    if (w && method === 'DELETE') w.sets = w.sets.filter(s => s.id !== n)
    else if (w && method === 'PATCH') {
      const b = body as { weight_kg?: unknown; reps?: unknown; seconds?: unknown; notes?: string | null }
      const v = setNumbers(b)
      if (typeof v === 'string') fail(v)
      const s = w.sets.find(s => s.id === n)!
      ;[s.weight_kg, s.reps, s.seconds] = v as [number | null, number | null, number | null]
      s.notes = b.notes ?? null
    }
  } else if (resource === 'workouts' && id) {
    if (method === 'DELETE') d.workouts = d.workouts.filter(w => w.id !== n)
    else if (method === 'PATCH') {
      const w = d.workouts.find(w => w.id === n)
      const b = body as { title?: string | null; notes?: string | null }
      if (w) {
        w.title = b.title ?? null
        w.notes = b.notes ?? null
      }
    }
  } else if (resource === 'activities' && id && method === 'DELETE') d.activities = d.activities.filter(a => a.id !== n)
  else if (resource === 'body-weight' && method === 'POST') {
    const b = body as BodyWeight
    const kg = num(b.kg)
    if (!isDate(b.date) || kg === null || Number.isNaN(kg) || kg <= 0) fail('Need a date and a weight')
    d.bodyWeight = [...d.bodyWeight.filter(x => x.date !== b.date), { date: b.date, kg: kg!, source: 'manual' }]
  } else if (resource === 'body-weight' && id && method === 'DELETE') d.bodyWeight = d.bodyWeight.filter(x => x.date !== id)
  else if (resource === 'routines') {
    if (method === 'POST') {
      const list = (body as { routines: Partial<Routine>[] }).routines
      if (!Array.isArray(list) || !list.length || list.length > 50 || !list.every(routineOk)) fail('Each routine needs a name and some exercises')
      const created = new Date().toISOString().replace('T', ' ').slice(0, 19)
      for (const r of list) d.routines.push({ id: nextId(d.routines), name: r.name!.trim(), body: r.body!, created })
    } else if (method === 'PUT' && id) {
      const r = body as Partial<Routine>
      if (!routineOk(r)) fail('A routine needs a name and some exercises')
      const x = d.routines.find(x => x.id === n)
      if (x) {
        x.name = r.name!.trim()
        x.body = r.body!
      }
    } else if (method === 'DELETE' && id) d.routines = d.routines.filter(r => r.id !== n)
  } else if (resource === 'profile' && method === 'PUT') {
    const b = body as Profile
    d.profile = cleanProfile(b)
  } else if (resource === 'aliases' && id && method === 'DELETE') delete d.aliases[decodeURIComponent(id).toLowerCase()]
  else if (resource === 'exercises' && id && method === (path.endsWith('/merge') ? 'POST' : 'PATCH')) out = editExercise(d, n, path.endsWith('/merge'), body as { name?: unknown; muscle?: unknown; into?: unknown })
  else if (resource === 'strava') fail('Strava needs your own copy of RepRun (docs/SETUP.md)')
  else fail('Not found')

  store(d)
  return out as T
}

/** The Worker's importPayload, over the local copy. */
function importLocal(d: Data, p: ImportPayload | Backup): ImportResult {
  if (![p.workouts, p.activities, p.records, p.goals].every(Array.isArray)) fail('That file isn\'t a RepRun import')
  const backup = isBackup(p)
  const result: ImportResult = { workouts: 0, skipped: [], sets: 0, activities: 0, records: 0, goals: 0 }

  // Old names you've renamed or merged land on the current one.
  const file = nameFiler(d.aliases, d.exercises.map(e => e.name))
  for (const w of p.workouts) for (const s of w.sets) s.exercise = file(s.exercise)
  for (const g of p.goals) if (typeof g?.exercise === 'string') g.exercise = file(g.exercise) // targets follow too
  // Exercises by name; existing ones keep any edits.
  const ids = new Map(d.exercises.map(e => [e.name, e.id]))
  for (const w of p.workouts) for (const s of w.sets) {
    if (!ids.has(s.exercise)) {
      const id = nextId(d.exercises)
      d.exercises.push({ id, name: s.exercise, muscle: s.muscle, lift: s.lift })
      ids.set(s.exercise, id)
    }
  }

  const seen = workoutSeen(d.workouts, backup)
  let setId = nextId(d.workouts.flatMap(w => w.sets))
  for (const w of p.workouts) {
    if (seen(w)) {
      result.skipped.push(w.date)
      continue
    }
    const wid = nextId(d.workouts)
    d.workouts.push({
      id: wid, date: w.date, title: w.title ?? null, notes: w.notes ?? null, source: w.source, duration_s: w.duration_s ?? null, client_id: w.client_id ?? null,
      sets: w.sets.map(s => ({ id: setId++, workout_id: wid, exercise_id: ids.get(s.exercise)!, position: s.position ?? 0, weight_kg: s.weight_kg ?? null, reps: s.reps ?? null, seconds: s.seconds ?? null, notes: s.notes ?? null, rpe: rpe(s.rpe) })),
    })
    result.workouts++
    result.sets += w.sets.length
  }

  if (backup) {
    const add = planRestore(d, p)
    for (const a of add.activities) d.activities.push({ ...a, id: nextId(d.activities), sample: 0 })
    for (const r of add.records) d.records.push({ ...r, id: nextId(d.records) })
    for (const g of add.goals) d.goals.push({ ...g, id: nextId(d.goals) })
    const created = new Date().toISOString().replace('T', ' ').slice(0, 19)
    for (const r of add.routines) d.routines.push({ id: nextId(d.routines), name: r.name.trim(), body: r.body, created })
    for (const w of add.bodyWeight) d.bodyWeight.push({ date: w.date, kg: Number(w.kg), source: w.source ?? 'manual' })
    // Profile only if this copy has none yet, like the Worker. ponytail: "none" = no age and no weight.
    if (p.profile && d.profile.age === null && d.profile.weight_kg === null) d.profile = p.profile
    d.aliases = mergeAliases(d.aliases, p.aliases, d.exercises.map(e => e.name))
    return { ...result, activities: add.activities.length, records: add.records.length, goals: add.goals.length, routines: add.routines.length, bodyWeight: add.bodyWeight.length }
  }

  // Activities: replace by external_id, like the Worker's upsert.
  for (const a of p.activities) {
    const i = a.external_id ? d.activities.findIndex(x => x.external_id === a.external_id) : -1
    if (i >= 0) d.activities[i] = { ...d.activities[i], ...a, id: d.activities[i].id, notes: d.activities[i].notes, source: d.activities[i].source, sample: d.activities[i].sample }
    else d.activities.push({ ...a, id: nextId(d.activities) })
  }
  result.activities = p.activities.length
  // Records and goals mirror the sheet: replace what the sheet gave last time.
  if (p.records.length) {
    d.records = d.records.filter(r => r.source !== 'sheet')
    for (const r of p.records) d.records.push({ ...r, id: nextId(d.records) })
    result.records = p.records.length
  }
  if (p.goals.length) {
    d.goals = d.goals.filter(g => g.source !== 'sheet')
    for (const g of p.goals) d.goals.push({ ...g, id: nextId(d.goals) })
    result.goals = p.goals.length
  }
  return result
}

/** The Worker's editExercise: rename / re-file, or merge into another. The old name becomes an alias. */
function editExercise(d: Data, id: number, merge: boolean, b: { name?: unknown; muscle?: unknown; into?: unknown }) {
  const ex = d.exercises.find(e => e.id === id) ?? fail('That exercise is gone')
  const follow = (to: string) => {
    for (const g of d.goals) if (g.exercise === ex.name) g.exercise = to
    for (const r of d.routines) r.body = rewriteRoutine(r.body, ex.name, to)
    d.aliases = addAlias(d.aliases, ex.name, to)
  }
  if (merge) {
    const into = d.exercises.find(e => e.id === Number(b.into))
    if (!into || into.id === ex.id) fail('Pick another exercise to merge into')
    let moved = 0
    for (const w of d.workouts) for (const s of w.sets) {
      if (s.exercise_id !== ex.id) continue
      s.exercise_id = into!.id
      moved++
    }
    into!.lift = into!.lift ?? ex.lift
    d.exercises = d.exercises.filter(e => e.id !== ex.id)
    follow(into!.name)
    return { ok: true, moved, into: into!.id }
  }
  const name = b.name === undefined ? ex.name : b.name
  const muscle = b.muscle === undefined ? ex.muscle : b.muscle
  if (!exerciseNameOk(name)) fail('An exercise needs a name (up to 100 characters)')
  if (!MUSCLE_LIST.includes(muscle as Muscle)) fail('Pick a muscle group')
  const clash = (name as string).trim() !== ex.name && d.exercises.find(e => e.id !== ex.id && e.name.toLowerCase() === (name as string).trim().toLowerCase())
  if (clash) fail(`You already have "${clash.name}"`) // the edit screen offers a merge before it gets here
  if ((name as string).trim() !== ex.name) follow((name as string).trim())
  ex.name = (name as string).trim()
  ex.muscle = muscle as Muscle
  return { ok: true }
}
