import type { Activity, Backup, BodyWeight, Data, Exercise, Goal, Muscle, ImportActivity, ImportPayload, ImportResult, Profile, RecordRow, Routine, Workout, WorkoutSet } from '../shared/types.ts'
import { isBackup, planRestore, workoutSeen } from '../shared/backup.ts'
import { cleanProfile, isDate, num, routineOk, rpe, setNumbers } from '../shared/rules.ts'
import { addAlias, exerciseNameOk, mergeAliases, MUSCLE_LIST, nameFiler, rewriteRoutine, type Aliases } from '../shared/exercises.ts'
import { demoData } from '../shared/demo.ts'
import { fromStrava, sampleStravaActivities, type StravaActivity } from '../shared/strava.ts'

type Env = {
  DB: D1Database
  ASSETS: Fetcher
  ALLOWED_EMAIL?: string
  ACCESS_TEAM?: string // the <team> in <team>.cloudflareaccess.com, or any URL on it (e.g. the JWKS link)
  ACCESS_AUD?: string // the Access application's Audience (AUD) tag
  DEMO?: string // "1" on the public demo: no sign-in, made-up data, wiped every night
  STRAVA_CLIENT_ID?: string
  STRAVA_CLIENT_SECRET?: string
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const bad = (msg: string, status = 400) => json({ error: msg }, status)

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    if (!env.DB) return bad('This copy keeps everything on your phone; it has no server data', 404) // the phone-only build

    // Cloudflare Access sits in front of every real copy. Local dev and the public demo skip sign-in.
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (!env.DEMO && !local) {
      const jwt = env.ACCESS_AUD && env.ACCESS_TEAM
      // Anyone can send the email header to a workers.dev address, Access or not, so there it needs the signed token.
      if (!env.ALLOWED_EMAIL || (!jwt && url.hostname.endsWith('.workers.dev'))) {
        return bad('Almost there: turn on Cloudflare Access and add its secrets (see docs/SETUP.md)', 403)
      }
      const email = jwt ? await accessEmail(req, env.ACCESS_TEAM!, env.ACCESS_AUD!) : req.headers.get('cf-access-authenticated-user-email')
      if (email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) return bad('Not signed in', 401)
    }

    try {
      return await route(req, env, url)
    } catch (e) {
      console.error(e)
      return bad(e instanceof Error ? e.message : 'Server error', 500)
    }
  },

  // Cron trigger, only configured for the demo (wrangler.jsonc env.demo).
  async scheduled(_event, env) {
    if (env.DEMO) await resetDemo(env.DB)
  },
} satisfies ExportedHandler<Env>

const TABLES = ['sets', 'workouts', 'exercises', 'activities', 'records', 'goals', 'body_weight', 'settings', 'routines']

/** Demo only: wipe everything and load the made-up history, dated up to today. */
async function resetDemo(db: D1Database) {
  await db.batch(TABLES.map(t => db.prepare(`DELETE FROM ${t}`)))
  const today = new Date().toISOString().slice(0, 10)
  const d = demoData(today)
  await importPayload(db, d.payload)
  const runs = sampleStravaActivities(today, d.payload.workouts.map(w => w.date)).filter(a => a.sport_type === 'Run')
  await upsertActivities(db, runs.map(a => fromStrava(a, true)))
  await db.batch([
    ...d.routines.map(r => db.prepare('INSERT INTO routines (name, body) VALUES (?, ?)').bind(r.name, r.body)),
    ...d.bodyWeight.map(b => db.prepare('INSERT INTO body_weight (date, kg, source) VALUES (?, ?, ?)').bind(b.date, b.kg, b.source)),
  ])
  await setSetting(db, 'profile', d.profile)
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB
  const [, , resource, id] = url.pathname.split('/') // /api/<resource>/<id>
  const m = req.method

  if (resource === 'data' && m === 'GET') {
    // ponytail: first visit after a deploy seeds the demo; two visitors at that exact moment could double it until the nightly reset.
    if (env.DEMO && !(await db.prepare('SELECT 1 FROM workouts LIMIT 1').first())) await resetDemo(db)
    return json(await loadAll(env))
  }
  if (resource === 'import' && m === 'POST') return json(await importPayload(db, (await req.json()) as ImportPayload | Backup))

  if (resource === 'sets' && id) {
    if (m === 'DELETE') return (await db.prepare('DELETE FROM sets WHERE id = ?').bind(id).run(), json({ ok: true }))
    if (m === 'PATCH') {
      const b = (await req.json()) as Partial<WorkoutSet>
      const v = setNumbers(b)
      if (typeof v === 'string') return bad(v)
      const [w, r, s] = v
      await db.prepare('UPDATE sets SET weight_kg = ?, reps = ?, seconds = ?, notes = ? WHERE id = ?').bind(w, r, s, b.notes ?? null, id).run()
      return json({ ok: true })
    }
  }

  if (resource === 'workouts' && id) {
    if (m === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM sets WHERE workout_id = ?').bind(id), db.prepare('DELETE FROM workouts WHERE id = ?').bind(id)])
      return json({ ok: true })
    }
    if (m === 'PATCH') {
      const b = (await req.json()) as Partial<Workout>
      await db.prepare('UPDATE workouts SET title = ?, notes = ? WHERE id = ?').bind(b.title ?? null, b.notes ?? null, id).run()
      return json({ ok: true })
    }
  }

  if (resource === 'activities' && id && m === 'DELETE') {
    await db.prepare('DELETE FROM activities WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }

  if (resource === 'body-weight') {
    if (m === 'POST') {
      const b = (await req.json()) as BodyWeight
      const kg = num(b.kg)
      if (!isDate(b.date) || kg === null || Number.isNaN(kg) || kg <= 0) return bad('Need a date and a weight')
      await db.prepare('INSERT INTO body_weight (date, kg, source) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg').bind(b.date, kg, 'manual').run()
      return json({ ok: true })
    }
    if (m === 'DELETE' && id) return (await db.prepare('DELETE FROM body_weight WHERE date = ?').bind(id).run(), json({ ok: true }))
  }

  if (resource === 'routines') {
    if (m === 'POST') {
      const list = ((await req.json()) as { routines: Partial<Routine>[] }).routines
      if (!Array.isArray(list) || !list.length || list.length > 50 || !list.every(routineOk)) return bad('Each routine needs a name and some exercises')
      await db.batch(list.map(r => db.prepare('INSERT INTO routines (name, body) VALUES (?, ?)').bind(r.name!.trim(), r.body)))
      return json({ ok: true })
    }
    if (m === 'PUT' && id) {
      const r = (await req.json()) as Partial<Routine>
      if (!routineOk(r)) return bad('A routine needs a name and some exercises')
      await db.prepare('UPDATE routines SET name = ?, body = ? WHERE id = ?').bind(r.name!.trim(), r.body, id).run()
      return json({ ok: true })
    }
    if (m === 'DELETE' && id) return (await db.prepare('DELETE FROM routines WHERE id = ?').bind(id).run(), json({ ok: true }))
  }

  if (resource === 'profile' && m === 'PUT') {
    const b = (await req.json()) as Profile
    await setSetting(db, 'profile', cleanProfile(b))
    return json({ ok: true })
  }

  if (resource === 'exercises' && id) {
    const merge = url.pathname.endsWith('/merge')
    if (m !== (merge ? 'POST' : 'PATCH')) return bad('Not found', 404)
    return editExercise(db, req, Number(id), merge)
  }
  if (resource === 'aliases' && id && m === 'DELETE') { // forget an old name, so typing it makes a new exercise again
    const aliases = await getSetting<Aliases>(db, 'aliases', {})
    delete aliases[decodeURIComponent(id).toLowerCase()]
    await setSetting(db, 'aliases', aliases)
    return json({ ok: true })
  }
  if (resource === 'strava') return strava(req, env, url, id)
  return bad('Not found', 404)
}

async function loadAll(env: Env): Promise<Data> {
  const db = env.DB
  const [ex, wo, se, ac, rec, go, bw, st, ro] = await db.batch([
    db.prepare('SELECT * FROM exercises ORDER BY name'),
    db.prepare('SELECT * FROM workouts ORDER BY date DESC, id DESC'),
    db.prepare('SELECT * FROM sets ORDER BY workout_id, position'),
    db.prepare('SELECT * FROM activities ORDER BY date DESC, start DESC'),
    db.prepare('SELECT * FROM records ORDER BY category, id'),
    db.prepare('SELECT * FROM goals ORDER BY id'),
    db.prepare('SELECT * FROM body_weight ORDER BY date'),
    db.prepare("SELECT key, value FROM settings WHERE key IN ('profile', 'strava', 'aliases')"),
    db.prepare('SELECT * FROM routines ORDER BY id'),
  ])
  const sets = new Map<number, WorkoutSet[]>()
  for (const s of se.results as WorkoutSet[]) sets.set(s.workout_id, [...(sets.get(s.workout_id) ?? []), s])
  const settings = Object.fromEntries((st.results as { key: string; value: string }[]).map(r => [r.key, JSON.parse(r.value)]))
  const tokens = settings.strava as StravaTokens | undefined
  return {
    exercises: ex.results as Exercise[],
    workouts: (wo.results as Omit<Workout, 'sets'>[]).map(w => ({ ...w, sets: sets.get(w.id) ?? [] })),
    activities: ac.results as Activity[],
    records: rec.results as RecordRow[],
    goals: go.results as Goal[],
    bodyWeight: bw.results as BodyWeight[],
    routines: ro.results as Routine[],
    profile: settings.profile ?? { age: null, sex: 'male', weight_kg: null },
    aliases: settings.aliases ?? {},
    demo: !!env.DEMO,
    strava: { configured: !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET), connected: !!tokens?.refresh_token, lastSync: tokens?.last_sync ?? null },
  }
}

/** Spreadsheet imports, logger uploads and backup restores. A backup merges: anything already here is left as it is. */
async function importPayload(db: D1Database, p: ImportPayload | Backup): Promise<ImportResult> {
  const result: ImportResult = { workouts: 0, skipped: [], sets: 0, activities: 0, records: 0, goals: 0 }
  const backup = isBackup(p)
  if (![p.workouts, p.activities, p.records, p.goals].every(Array.isArray)) throw new Error('That file isn\'t a RepRun import')

  // Old names you've renamed or merged land on the current one (shared/exercises.ts).
  const aliases = await getSetting<Aliases>(db, 'aliases', {})
  const file = nameFiler(aliases, ((await db.prepare('SELECT name FROM exercises').all()).results as { name: string }[]).map(e => e.name))
  for (const w of p.workouts) for (const s of w.sets) s.exercise = file(s.exercise)
  for (const g of p.goals) if (typeof g?.exercise === 'string') g.exercise = file(g.exercise) // targets follow too

  // Exercises first, so sets can reference them by id. Existing ones keep any edits.
  const exercises = new Map<string, { muscle: string; lift: string | null }>()
  for (const w of p.workouts) for (const s of w.sets) exercises.set(s.exercise, { muscle: s.muscle, lift: s.lift })
  if (exercises.size) {
    await db.batch([...exercises].map(([name, e]) => db.prepare('INSERT OR IGNORE INTO exercises (name, muscle, lift) VALUES (?, ?, ?)').bind(name, e.muscle, e.lift)))
  }
  const ids = new Map(((await db.prepare('SELECT id, name FROM exercises').all()).results as { id: number; name: string }[]).map(e => [e.name, e.id]))

  // A day that's already in from the same source is skipped, so re-importing a longer sheet only adds new days
  // and never overwrites edits made in the app.
  // App uploads carry a client_id instead, so a retried upload is skipped but two sessions in one day are kept.
  const rows = (await db.prepare('SELECT date, source, title, client_id FROM workouts').all()).results as Pick<Workout, 'date' | 'source' | 'title' | 'client_id'>[]
  const seen = workoutSeen(rows, backup)
  // One batch for every new workout and its sets: it saves completely or not at all, and counts as a single
  // D1 query (the Free plan allows 50 per request). Sets find their workout as the newest row, which is safe
  // because a batch runs as one transaction.
  const writes: D1PreparedStatement[] = []
  for (const w of p.workouts) {
    if (seen(w)) {
      result.skipped.push(w.date)
      continue
    }
    writes.push(db.prepare('INSERT INTO workouts (date, title, notes, source, duration_s, client_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(w.date, w.title ?? null, w.notes ?? null, w.source, w.duration_s ?? null, w.client_id ?? null))
    for (const s of w.sets) {
      writes.push(db.prepare('INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, seconds, notes, rpe) VALUES ((SELECT max(id) FROM workouts), ?, ?, ?, ?, ?, ?, ?)')
        .bind(ids.get(s.exercise)!, s.position ?? 0, s.weight_kg ?? null, s.reps ?? null, s.seconds ?? null, s.notes ?? null, rpe(s.rpe)))
    }
    result.workouts++
    result.sets += w.sets.length
  }
  if (writes.length) await db.batch(writes)

  if (backup) return { ...result, ...(await restoreRest(db, p)) }
  result.activities = await upsertActivities(db, p.activities)

  // Records and goals mirror the sheet: replace what the sheet gave last time.
  if (p.records.length) {
    await db.batch([
      db.prepare("DELETE FROM records WHERE source = 'sheet'"),
      ...p.records.map(r => db.prepare('INSERT INTO records (category, name, value, date, context, source) VALUES (?, ?, ?, ?, ?, ?)').bind(r.category, r.name, r.value, r.date, r.context, r.source)),
    ])
    result.records = p.records.length
  }
  if (p.goals.length) {
    await db.batch([
      db.prepare("DELETE FROM goals WHERE source = 'sheet'"),
      ...p.goals.map(g => db.prepare('INSERT INTO goals (exercise, latest, target, context, source) VALUES (?, ?, ?, ?, ?)').bind(g.exercise, g.latest, g.target, g.context, g.source)),
    ])
    result.goals = p.goals.length
  }
  return result
}

/** The rest of a backup restore (shared/backup.ts planRestore): only adds what's missing, never changes or deletes. */
async function restoreRest(db: D1Database, b: Backup) {
  const all = async <T,>(sql: string) => (await db.prepare(sql).all()).results as T[]
  const [activities, records, goals, routines, bodyWeight] = await Promise.all([
    all<Activity>('SELECT * FROM activities'), all<RecordRow>('SELECT * FROM records'), all<Goal>('SELECT * FROM goals'), all<Routine>('SELECT * FROM routines'), all<BodyWeight>('SELECT date FROM body_weight'),
  ])
  const add = planRestore({ activities, records, goals, routines, bodyWeight }, b)
  await db.batch([
    ...add.activities.map(a => db.prepare(`INSERT OR IGNORE INTO activities (date, start, sport, name, distance_m, moving_s, elapsed_s, elevation_m, avg_hr, notes, source, external_id, sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).bind(a.date, a.start, a.sport, a.name, a.distance_m, a.moving_s, a.elapsed_s, a.elevation_m, a.avg_hr, a.notes, a.source, a.external_id)),
    ...add.records.map(r => db.prepare('INSERT INTO records (category, name, value, date, context, source) VALUES (?, ?, ?, ?, ?, ?)').bind(r.category, r.name, r.value, r.date, r.context, r.source)),
    ...add.goals.map(g => db.prepare('INSERT INTO goals (exercise, latest, target, context, source) VALUES (?, ?, ?, ?, ?)').bind(g.exercise, g.latest, g.target, g.context, g.source)),
    ...add.routines.map(r => db.prepare('INSERT INTO routines (name, body) VALUES (?, ?)').bind(r.name.trim(), r.body)),
    ...add.bodyWeight.map(w => db.prepare('INSERT OR IGNORE INTO body_weight (date, kg, source) VALUES (?, ?, ?)').bind(w.date, Number(w.kg), w.source ?? 'manual')),
    // Profile only if this copy has none yet.
    ...(b.profile ? [db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('profile', ?)").bind(JSON.stringify(b.profile))] : []),
    db.prepare("INSERT INTO settings (key, value) VALUES ('aliases', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(JSON.stringify(mergeAliases(await getSetting<Aliases>(db, 'aliases', {}), b.aliases,
        ((await db.prepare('SELECT name FROM exercises').all()).results as { name: string }[]).map(e => e.name)))),
  ])
  return { activities: add.activities.length, records: add.records.length, goals: add.goals.length, routines: add.routines.length, bodyWeight: add.bodyWeight.length }
}

async function upsertActivities(db: D1Database, list: ImportActivity[]) {
  if (!list.length) return 0
  await db.batch(list.map(a =>
    db.prepare(`INSERT INTO activities (date, start, sport, name, distance_m, moving_s, elapsed_s, elevation_m, avg_hr, notes, source, external_id, sample)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET date = excluded.date, start = excluded.start, sport = excluded.sport, name = excluded.name,
        distance_m = excluded.distance_m, moving_s = excluded.moving_s, elapsed_s = excluded.elapsed_s,
        elevation_m = excluded.elevation_m, avg_hr = excluded.avg_hr`)
      .bind(a.date, a.start, a.sport, a.name, a.distance_m, a.moving_s, a.elapsed_s, a.elevation_m, a.avg_hr, a.notes, a.source, a.external_id, a.sample)))
  return list.length
}

async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  return row ? (JSON.parse(row.value) as T) : fallback
}

/** PATCH /api/exercises/:id {name?, muscle?} renames or re-files; POST /api/exercises/:id/merge {into} moves every
 *  set onto another exercise and removes this one. Either way the old name becomes an alias and routines are
 *  rewritten. One batch, so it all happens or none of it does. */
async function editExercise(db: D1Database, req: Request, id: number, merge: boolean): Promise<Response> {
  const exercises = (await db.prepare('SELECT * FROM exercises').all()).results as Exercise[]
  const ex = exercises.find(e => e.id === id)
  if (!ex) return bad('That exercise is gone', 404)
  const b = (await req.json()) as { name?: unknown; muscle?: unknown; into?: unknown }
  const routines = (await db.prepare('SELECT id, body FROM routines').all()).results as Pick<Routine, 'id' | 'body'>[]
  const aliases = await getSetting<Aliases>(db, 'aliases', {})

  // Both paths end the same way: goals and routines follow the new name, and the old one becomes an alias.
  const follow = (to: string) => [
    db.prepare('UPDATE goals SET exercise = ? WHERE exercise = ?').bind(to, ex.name),
    ...routines.map(r => [r, rewriteRoutine(r.body, ex.name, to)] as const).filter(([r, body]) => body !== r.body)
      .map(([r, body]) => db.prepare('UPDATE routines SET body = ? WHERE id = ?').bind(body, r.id)),
    db.prepare("INSERT INTO settings (key, value) VALUES ('aliases', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(JSON.stringify(addAlias(aliases, ex.name, to))),
  ]

  if (merge) {
    const into = exercises.find(e => e.id === Number(b.into))
    if (!into || into.id === ex.id) return bad('Pick another exercise to merge into')
    const moved = await db.prepare('SELECT count(*) AS n FROM sets WHERE exercise_id = ?').bind(ex.id).first<{ n: number }>()
    await db.batch([
      db.prepare('UPDATE sets SET exercise_id = ? WHERE exercise_id = ?').bind(into.id, ex.id),
      db.prepare('UPDATE exercises SET lift = COALESCE(lift, ?) WHERE id = ?').bind(ex.lift, into.id), // keep its own big-lift tag
      db.prepare('DELETE FROM exercises WHERE id = ?').bind(ex.id),
      ...follow(into.name),
    ])
    return json({ ok: true, moved: moved?.n ?? 0, into: into.id })
  }

  const name = b.name === undefined ? ex.name : b.name
  const muscle = b.muscle === undefined ? ex.muscle : b.muscle
  if (!exerciseNameOk(name)) return bad('An exercise needs a name (up to 100 characters)')
  if (!MUSCLE_LIST.includes(muscle as Muscle)) return bad('Pick a muscle group')
  const clash = name.trim() !== ex.name && exercises.find(e => e.id !== ex.id && e.name.toLowerCase() === name.trim().toLowerCase())
  if (clash) return json({ error: `You already have "${clash.name}"`, mergeInto: clash.id }, 409)
  await db.batch([
    db.prepare('UPDATE exercises SET name = ?, muscle = ? WHERE id = ?').bind(name.trim(), muscle, ex.id),
    ...(name.trim() === ex.name ? [] : follow(name.trim())),
  ])
  return json({ ok: true })
}

async function setSetting(db: D1Database, key: string, value: unknown) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
}

// ---------- Strava ----------
// Flow: /api/strava/connect -> Strava consent -> /api/strava/callback stores tokens -> POST /api/strava/sync
// backfills everything (200 activities per request), then only fetches what's newer than the last sync.

type StravaTokens = { access_token: string; refresh_token: string; expires_at: number; last_sync?: string; last_epoch?: number }

async function strava(req: Request, env: Env, url: URL, action: string | undefined): Promise<Response> {
  const db = env.DB

  // Demo data: shaped exactly like real Strava activities and run through the same mapper.
  if (action === 'sample') {
    if (req.method === 'DELETE') {
      await db.prepare('DELETE FROM activities WHERE sample = 1').run()
      return json({ ok: true })
    }
    const gym = ((await db.prepare('SELECT DISTINCT date FROM workouts').all()).results as { date: string }[]).map(r => r.date)
    const sheetRuns = ((await db.prepare("SELECT date FROM activities WHERE source = 'sheet'").all()).results as { date: string }[]).map(r => r.date)
    const today = new Date().toISOString().slice(0, 10)
    const n = await upsertActivities(db, sampleStravaActivities(today, gym, sheetRuns).map(a => fromStrava(a, true)))
    return json({ activities: n })
  }

  if (env.DEMO) return bad('Strava is switched off in the demo', 403)
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) {
    return bad('Strava isn\'t configured yet. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET (see README).', 503)
  }

  if (action === 'connect') {
    const auth = new URL('https://www.strava.com/oauth/authorize')
    auth.search = new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      redirect_uri: `${url.origin}/api/strava/callback`,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
    }).toString()
    return Response.redirect(auth.toString(), 302)
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code')
    if (!code) return Response.redirect(`${url.origin}/settings?strava=denied`, 302)
    const tokens = await stravaToken(env, { grant_type: 'authorization_code', code })
    await setSetting(db, 'strava', tokens)
    return Response.redirect(`${url.origin}/settings?strava=connected`, 302)
  }

  if (action === 'sync' && req.method === 'POST') {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'strava'").first<{ value: string }>()
    if (!row) return bad('Connect Strava first')
    let tokens = JSON.parse(row.value) as StravaTokens
    if (tokens.expires_at < Date.now() / 1000 + 60) {
      tokens = { ...tokens, ...(await stravaToken(env, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })) }
    }
    let total = 0
    let newest = tokens.last_epoch ?? 0
    for (let page = 1; ; page++) {
      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}&after=${tokens.last_epoch ?? 0}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (!res.ok) return bad(`Strava said ${res.status}: ${(await res.text()).slice(0, 200)}`, 502)
      const batch = (await res.json()) as (StravaActivity & { start_date: string })[]
      if (!batch.length) break
      total += await upsertActivities(db, batch.map(a => fromStrava(a)))
      newest = Math.max(newest, ...batch.map(a => Date.parse(a.start_date) / 1000))
      if (batch.length < 200) break
    }
    await setSetting(db, 'strava', { ...tokens, last_epoch: newest, last_sync: new Date().toISOString() })
    return json({ activities: total })
  }

  return bad('Not found', 404)
}

async function stravaToken(env: Env, body: Record<string, string>): Promise<StravaTokens> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed (${res.status})`)
  const t = (await res.json()) as StravaTokens
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }
}

// Cloudflare Access signs a token (cf-access-jwt-assertion) for every request it lets through.
// Checking it makes sign-in safe even where the email header could be faked.
let accessKeys: { team: string; at: number; keys: (JsonWebKey & { kid: string })[] } | undefined

async function accessEmail(req: Request, team: string, aud: string): Promise<string | null> {
  team = team.trim().replace(/^https?:\/\//, '').replace(/\.cloudflareaccess\.com.*$/, '')
  const token = req.headers.get('cf-access-jwt-assertion')
  if (!token) return null
  const [h, p, sig] = token.split('.')
  const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  try {
    const header = JSON.parse(new TextDecoder().decode(b64(h)))
    const claims = JSON.parse(new TextDecoder().decode(b64(p)))
    // Keys cached for an hour per isolate; an unknown kid (Access rotated keys) refetches, at most once a minute.
    const age = accessKeys?.team === team ? Date.now() - accessKeys.at : Infinity
    const known = () => accessKeys?.keys.find((k) => k.kid === header.kid)
    if (age > 3600_000 || (!known() && age > 60_000)) {
      const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
      accessKeys = { team, at: Date.now(), keys: ((await res.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys }
    }
    const jwk = known()
    if (!jwk || header.alg !== 'RS256') return null
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(sig), new TextEncoder().encode(`${h}.${p}`))
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!ok || !auds.includes(aud) || claims.iss !== `https://${team}.cloudflareaccess.com` || !(claims.exp * 1000 > Date.now())) return null
    return claims.email ?? null
  } catch {
    return null
  }
}
