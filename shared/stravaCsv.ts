// Strava's "Download your data" archive → activities. For copies without the Strava API (the phone-only one,
// most self-hosted ones), and for history before the API connection. Read in the browser, sent as an ordinary import.
// Checked against a real export (Nov 2026): 104 columns, some names twice ("Distance" in km, then in metres).
import type { ImportActivity } from './types.ts'

/** RFC 4180-ish: commas, double-quoted fields, "" for a quote, newlines inside quotes (Strava's descriptions have them). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(x => x.trim()))
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** "Nov 9, 2025, 9:15:30 AM" (UTC, as Strava writes it), or ISO "2025-11-09 09:15:30", to a UTC Date. */
export function stravaDate(s: string): Date | null {
  const us = /^([A-Za-z]{3})\w* (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?$/i.exec(s.trim())
  if (us) {
    const mon = MONTHS.indexOf(us[1].toLowerCase())
    let h = +us[4]
    if (us[7]) h = (h % 12) + (us[7].toUpperCase() === 'PM' ? 12 : 0)
    return mon < 0 ? null : new Date(Date.UTC(+us[3], mon, +us[2], h, +us[5], +(us[6] ?? 0)))
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim())
  return iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0))) : null
}

const pad = (n: number) => String(n).padStart(2, '0')
const number = (s: string | undefined) => (s && s.trim() && Number.isFinite(+s) ? +s : null)

/** True when this looks like Strava's activities.csv rather than some other spreadsheet. */
export const isStravaCsv = (text: string) => /^﻿?Activity ID,Activity Date,/.test(text)

/**
 * Activities from activities.csv. Dates move from UTC to the phone's own time zone, so an early run lands on the right day.
 * IDs match the Strava API's (`strava:<id>`), so connecting Strava later updates these instead of doubling them.
 */
export function fromStravaCsv(text: string): ImportActivity[] {
  const [head, ...rows] = parseCsv(text.replace(/^﻿/, ''))
  if (!head) return []
  // The second copy of a repeated name is the precise one (metres, seconds), so take the last.
  const col = (name: string) => head.lastIndexOf(name)
  const c = {
    id: col('Activity ID'), date: col('Activity Date'), name: col('Activity Name'), type: col('Activity Type'), notes: col('Activity Description'),
    elapsed: col('Elapsed Time'), moving: col('Moving Time'), distance: col('Distance'), elevation: col('Elevation Gain'), hr: col('Average Heart Rate'),
    sets: col('Total Sets'), reps: col('Total Reps'), lifted: col('Total Weight Lifted'),
  }
  if (c.id < 0 || c.date < 0 || c.type < 0) throw new Error("That isn't Strava's activities.csv (no Activity ID, Date or Type columns).")
  const out: ImportActivity[] = []
  for (const r of rows) {
    const when = stravaDate(r[c.date] ?? '')
    if (!r[c.id] || !when) continue
    // Strava's own totals for a strength session, when it has them; RepRun's sets are logged in RepRun.
    const strength = [number(r[c.sets]) && `${number(r[c.sets])} sets`, number(r[c.reps]) && `${number(r[c.reps])} reps`, number(r[c.lifted]) && `${number(r[c.lifted])} kg lifted`].filter(Boolean).join(', ')
    const notes = [r[c.notes]?.trim(), strength && `Strava: ${strength}`].filter(Boolean).join('\n') || null
    const distance = number(r[c.distance])
    const elapsed = number(r[c.elapsed])
    out.push({
      date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
      start: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
      sport: (r[c.type] ?? '').replace(/[^A-Za-z]/g, '') || 'Workout', // "Weight Training" → WeightTraining, as the API names it
      name: r[c.name]?.trim() || (r[c.type] ?? 'Activity'),
      distance_m: distance ? Math.round(distance * 10) / 10 : null,
      moving_s: number(r[c.moving]) !== null ? Math.round(number(r[c.moving])!) : elapsed !== null ? Math.round(elapsed) : null,
      elapsed_s: elapsed !== null ? Math.round(elapsed) : null,
      elevation_m: number(r[c.elevation]),
      avg_hr: number(r[c.hr]),
      notes,
      source: 'strava',
      external_id: `strava:${r[c.id].trim()}`,
      sample: 0,
    })
  }
  return out
}

/** "153 activities: 32 runs, 47 gym sessions, 74 other" for the import message. */
export function stravaSummary(a: ImportActivity[]) {
  const runs = a.filter(x => /Run$/.test(x.sport)).length
  const gym = a.filter(x => ['WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining'].includes(x.sport)).length
  const other = a.length - runs - gym
  return `${a.length} ${a.length === 1 ? 'activity' : 'activities'}: ${[runs && `${runs} runs`, gym && `${gym} gym sessions`, other && `${other} other`].filter(Boolean).join(', ') || 'none'}`
}
