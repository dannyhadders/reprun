// Turns the ChatGPT training workbook into an ImportPayload. Runs in the browser (Settings > Import)
// and in scripts/seed.ts. Sheets it reads: Set Log, Session Summary, Running Log,
// PBs & Benchmarks, Progress & Targets. Missing sheets are fine.
import type { WorkBook } from 'xlsx'
import { utils } from 'xlsx'
import { resolveExercise } from './catalogue.ts'
import type { ImportActivity, ImportPayload, ImportWorkout } from './types.ts'

type Row = Record<string, unknown>

const rows = (wb: WorkBook, name: string): Row[] =>
  wb.Sheets[name] ? utils.sheet_to_json<Row>(wb.Sheets[name], { defval: null, raw: true }) : []

const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null)
const isoDate = (v: unknown) => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** '10' -> reps 10; '1 min' -> 60 s; '30 sec each side' -> 30 s; '~11–12' -> 11; 'Not recorded' -> nothing. */
export function parseReps(v: unknown): { reps: number | null; seconds: number | null } {
  const s = String(v ?? '').toLowerCase()
  const n = s.match(/\d+(\.\d+)?/)
  if (!n) return { reps: null, seconds: null }
  const x = parseFloat(n[0])
  if (s.includes('min')) return { reps: null, seconds: x * 60 }
  if (s.includes('sec')) return { reps: null, seconds: x }
  return { reps: x, seconds: null }
}

/** '52:22' -> 3142, '1:02:03' -> 3723, '55:07 elapsed' -> 3307. */
export function parseDuration(v: unknown): number | null {
  const m = String(v ?? '').match(/(\d+):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]
}

export function parseWorkbook(wb: WorkBook): ImportPayload {
  const summary = new Map(rows(wb, 'Session Summary').map(r => [isoDate(r['Date']), str(r['Notes'])]))

  const byDate = new Map<string, ImportWorkout>()
  for (const r of rows(wb, 'Set Log')) {
    const date = isoDate(r['Date'])
    const raw = str(r['Exercise'])
    if (!date || !raw) continue
    const load = r['Load (kg)']
    const weight = typeof load === 'number' ? load : null
    const ex = resolveExercise(raw, weight)
    const { reps, seconds } = parseReps(r['Reps'])
    const repsText = str(r['Reps'])
    // Keep whatever the numbers can't carry: the original name variant, approximate reps, bodyweight.
    const extra = [
      raw.toLowerCase() !== ex.name.toLowerCase() && /[(]|weighted|bodyweight|drop/i.test(raw) ? raw : null,
      reps !== null && repsText && !/^\d+$/.test(repsText) ? `reps: ${repsText}` : null,
      str(load)?.toLowerCase() === 'bodyweight' ? 'bodyweight' : null,
      str(r['Notes']),
    ].filter(Boolean)

    let w = byDate.get(date)
    if (!w) {
      w = { date, title: str(r['Session']), notes: summary.get(date) ?? null, source: 'sheet', sets: [] }
      byDate.set(date, w)
    }
    w.sets.push({
      exercise: ex.name,
      muscle: ex.muscle,
      lift: ex.lift ?? null,
      position: w.sets.length + 1,
      weight_kg: weight,
      reps,
      seconds,
      notes: extra.join('; ') || null,
    })
  }

  const activities: ImportActivity[] = []
  for (const r of rows(wb, 'Running Log')) {
    const date = isoDate(r['Date'])
    if (!date) continue // "2026-10 (exact date not captured)" etc. live on in PBs & Benchmarks instead
    const km = typeof r['Distance (km)'] === 'number' ? (r['Distance (km)'] as number) : null
    const time = parseDuration(r['Time'])
    const activity = str(r['Activity']) ?? 'Run'
    activities.push({
      date,
      start: null,
      sport: /swim/i.test(activity) ? 'Swim' : /bike|ride/i.test(activity) ? 'Ride' : 'Run',
      name: activity,
      distance_m: km !== null ? km * 1000 : null,
      moving_s: time,
      elapsed_s: time,
      elevation_m: null,
      avg_hr: null,
      notes: [str(r['PB / detail']), str(r['Notes'])].filter(Boolean).join(' · ') || null,
      source: 'sheet',
      external_id: `sheet:${date}:${km ?? activity}`,
      sample: 0,
    })
  }

  const records = rows(wb, 'PBs & Benchmarks')
    .filter(r => str(r['Distance / lift']) && str(r['Best / benchmark']))
    .map(r => ({
      category: str(r['Category']),
      name: str(r['Distance / lift'])!,
      value: str(r['Best / benchmark'])!,
      date: isoDate(r['Date']),
      context: [isoDate(r['Date']) ? null : str(r['Date']), str(r['Context'])].filter(Boolean).join(' · ') || null,
      source: 'sheet',
    }))

  const goals = rows(wb, 'Progress & Targets')
    .filter(r => str(r['Exercise']) && str(r['Suggested next target']))
    .map(r => ({
      exercise: resolveExercise(str(r['Exercise'])!, null).name,
      latest: str(r['Latest recorded performance']),
      target: str(r['Suggested next target'])!,
      context: str(r['Context / caution']),
      source: 'sheet',
    }))

  return { workouts: [...byDate.values()], activities, records, goals }
}
