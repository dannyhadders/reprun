import type { Activity, BodyWeight, Data, Exercise, Goal, ImportActivity, ImportPayload, ImportResult, Profile, RecordRow, Routine, Workout, WorkoutSet } from '../shared/types.ts'
import { demoData } from '../shared/demo.ts'
import { fromStrava, sampleStravaActivities, type StravaActivity } from '../shared/strava.ts'

type Env = {
  DB: D1Database
  ASSETS: Fetcher
  ALLOWED_EMAIL?: string
  DEMO?: string // "1" on the public demo: no sign-in, made-up data, wiped every night
  STRAVA_CLIENT_ID?: string
  STRAVA_CLIENT_SECRET?: string
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const bad = (msg: string, status = 400) => json({ error: msg }, status)
const num = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : NaN)

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    // Cloudflare Access sits in front in production and adds this header. Locally ALLOWED_EMAIL is empty.
    if (!env.DEMO && env.ALLOWED_EMAIL && req.headers.get('cf-access-authenticated-user-email') !== env.ALLOWED_EMAIL) {
      return bad('Not signed in', 401)
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
  if (resource === 'import' && m === 'POST') return json(await importPayload(db, (await req.json()) as ImportPayload))

  if (resource === 'sets' && id) {
    if (m === 'DELETE') return (await db.prepare('DELETE FROM sets WHERE id = ?').bind(id).run(), json({ ok: true }))
    if (m === 'PATCH') {
      const b = (await req.json()) as Partial<WorkoutSet>
      const [w, r, s] = [num(b.weight_kg), num(b.reps), num(b.seconds)]
      if ([w, r, s].some(x => Number.isNaN(x) || (x !== null && x < 0))) return bad('Weight, reps and seconds must be positive numbers')
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || kg === null || Number.isNaN(kg) || kg <= 0) return bad('Need a date and a weight')
      await db.prepare('INSERT INTO body_weight (date, kg, source) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg').bind(b.date, kg, 'manual').run()
      return json({ ok: true })
    }
    if (m === 'DELETE' && id) return (await db.prepare('DELETE FROM body_weight WHERE date = ?').bind(id).run(), json({ ok: true }))
  }

  if (resource === 'routines') {
    const ok = (r: Partial<Routine>) => typeof r.name === 'string' && r.name.trim() && r.name.length <= 100 && typeof r.body === 'string' && r.body.trim() && r.body.length <= 10_000
    if (m === 'POST') {
      const list = ((await req.json()) as { routines: Partial<Routine>[] }).routines
      if (!Array.isArray(list) || !list.length || list.length > 50 || !list.every(ok)) return bad('Each routine needs a name and some exercises')
      await db.batch(list.map(r => db.prepare('INSERT INTO routines (name, body) VALUES (?, ?)').bind(r.name!.trim(), r.body)))
      return json({ ok: true })
    }
    if (m === 'PUT' && id) {
      const r = (await req.json()) as Partial<Routine>
      if (!ok(r)) return bad('A routine needs a name and some exercises')
      await db.prepare('UPDATE routines SET name = ?, body = ? WHERE id = ?').bind(r.name!.trim(), r.body, id).run()
      return json({ ok: true })
    }
    if (m === 'DELETE' && id) return (await db.prepare('DELETE FROM routines WHERE id = ?').bind(id).run(), json({ ok: true }))
  }

  if (resource === 'profile' && m === 'PUT') {
    const b = (await req.json()) as Profile
    await setSetting(db, 'profile', { age: num(b.age), sex: b.sex === 'female' ? 'female' : 'male', weight_kg: num(b.weight_kg) })
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
    db.prepare("SELECT key, value FROM settings WHERE key IN ('profile', 'strava')"),
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
    demo: !!env.DEMO,
    strava: { configured: !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET), connected: !!tokens?.refresh_token, lastSync: tokens?.last_sync ?? null },
  }
}

async function importPayload(db: D1Database, p: ImportPayload): Promise<ImportResult> {
  const result: ImportResult = { workouts: 0, skipped: [], sets: 0, activities: 0, records: 0, goals: 0 }

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
  const rows = (await db.prepare('SELECT date, source, client_id FROM workouts').all()).results as { date: string; source: string; client_id: string | null }[]
  const existing = new Set(rows.map(w => `${w.date}|${w.source}`))
  const clientIds = new Set(rows.map(w => w.client_id))
  for (const w of p.workouts) {
    if (w.client_id ? clientIds.has(w.client_id) : w.source === 'sheet' && existing.has(`${w.date}|${w.source}`)) {
      result.skipped.push(w.date)
      continue
    }
    const row = await db.prepare('INSERT INTO workouts (date, title, notes, source, duration_s, client_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(w.date, w.title, w.notes, w.source, w.duration_s ?? null, w.client_id ?? null).first<{ id: number }>()
    if (w.sets.length) {
      await db.batch(w.sets.map(s =>
        db.prepare('INSERT INTO sets (workout_id, exercise_id, position, weight_kg, reps, seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(row!.id, ids.get(s.exercise)!, s.position, s.weight_kg, s.reps, s.seconds, s.notes)))
    }
    result.workouts++
    result.sets += w.sets.length
  }

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
