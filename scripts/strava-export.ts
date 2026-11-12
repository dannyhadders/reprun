// Backfills activities from a Strava data export (Settings -> My Account -> Download your data),
// for when the API isn't available. Same ids as the API, so re-running or a later API sync won't duplicate.
//   npm run import:strava -- path/to/activities.csv [--local]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { fromStrava, type StravaActivity } from '../shared/strava.ts'

const file = process.argv[2]
if (!file) throw new Error('usage: npm run import:strava -- path/to/activities.csv [--local]')
const target = process.argv.includes('--local') ? '--local' : '--remote'

// Header names repeat (two Distance columns: km then metres), so look columns up by position of first/last match.
const [head, ...rows] = XLSX.utils.sheet_to_json<string[]>(XLSX.read(readFileSync(file, 'utf8'), { type: 'string', raw: true }).Sheets.Sheet1, { header: 1, raw: false, defval: '' })
const first = (h: string) => head.indexOf(h)
const last = (h: string) => head.lastIndexOf(h)
const col = { id: first('Activity ID'), date: first('Activity Date'), name: first('Activity Name'), type: first('Activity Type'),
  elapsed: first('Elapsed Time'), moving: last('Moving Time'), distance: last('Distance'), elevation: last('Elevation Gain'), hr: last('Average Heart Rate') }
for (const [k, i] of Object.entries(col)) if (i < 0) throw new Error(`activities.csv: missing column for ${k}`)

// Export dates are UTC ("Nov 11, 2026, 5:32:20 AM"); the API's start_date_local is UK wall-clock time.
const london = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
const toLocal = (utc: string) => london.format(new Date(`${utc} UTC`)).replace(' ', 'T') + 'Z'

const num = (s: string) => (s === '' ? 0 : Number(s))
const activities = rows.filter(r => r[col.id]).map((r): StravaActivity => ({
  id: Number(r[col.id]),
  name: r[col.name],
  sport_type: r[col.type].replace(/\s+/g, ''), // export uses "Weight Training", API sport_type is "WeightTraining"
  start_date_local: toLocal(r[col.date]),
  distance: num(r[col.distance]),
  moving_time: Math.round(num(r[col.moving]) || num(r[col.elapsed])),
  elapsed_time: Math.round(num(r[col.elapsed])),
  total_elevation_gain: num(r[col.elevation]),
  average_heartrate: r[col.hr] === '' ? undefined : num(r[col.hr]),
})).map(a => fromStrava(a))

const q = (v: unknown) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const sql = ['DELETE FROM activities WHERE sample = 1;', ...activities.map(a =>
  `INSERT INTO activities (date, start, sport, name, distance_m, moving_s, elapsed_s, elevation_m, avg_hr, notes, source, external_id, sample) VALUES (${
    [a.date, a.start, a.sport, a.name, a.distance_m, a.moving_s, a.elapsed_s, a.elevation_m, a.avg_hr, a.notes, a.source, a.external_id, a.sample].map(q).join(', ')
  }) ON CONFLICT(external_id) DO UPDATE SET date = excluded.date, start = excluded.start, sport = excluded.sport, name = excluded.name, distance_m = excluded.distance_m, moving_s = excluded.moving_s, elapsed_s = excluded.elapsed_s, elevation_m = excluded.elevation_m, avg_hr = excluded.avg_hr;`)]

const out = join(mkdtempSync(join(tmpdir(), 'reprun-')), 'strava-export.sql')
writeFileSync(out, sql.join('\n'))
console.log(`${activities.length} activities (${activities[activities.length - 1]?.date} to ${activities[0]?.date}) -> ${target.slice(2)} DB, sample data removed`)
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', out], { stdio: 'inherit' })
