import type { ImportActivity } from './types.ts'

// The subset of Strava's SummaryActivity we use (GET /athlete/activities).
export type StravaActivity = {
  id: number
  name: string
  sport_type: string
  start_date_local: string // "2026-11-05T07:12:00Z" (local wall-clock time, despite the Z)
  distance: number // metres
  moving_time: number // seconds
  elapsed_time: number
  total_elevation_gain: number
  average_heartrate?: number
}

// The one place Strava data becomes ours. Real syncs and the sample generator both go through it.
export const fromStrava = (a: StravaActivity, sample = false): ImportActivity => ({
  date: a.start_date_local.slice(0, 10),
  start: a.start_date_local.slice(11, 16),
  sport: a.sport_type,
  name: a.name,
  distance_m: a.distance || null,
  moving_s: a.moving_time,
  elapsed_s: a.elapsed_time,
  elevation_m: a.total_elevation_gain ?? null,
  avg_hr: a.average_heartrate ?? null,
  notes: null,
  source: 'strava',
  external_id: `strava:${a.id}`,
  sample: sample ? 1 : 0,
})

// Deterministic PRNG so the sample data is the same every time.
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * A believable year of Strava history ending `today`, shaped exactly like the real API returns it:
 * 1-3 runs a week getting gradually faster, a long run most weekends, and a timed
 * "Weight Training" activity (Apple Health -> Strava) for every gym day in `gymDates`,
 * plus earlier gym sessions before the spreadsheet started.
 */
export function sampleStravaActivities(today: string, gymDates: string[], skipRunDates: string[] = []): StravaActivity[] {
  const rand = rng(42)
  const out: StravaActivity[] = []
  let id = 9_000_000_000
  const at = (date: string, hh: number) => `${date}T${String(hh).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00Z`
  const start = addDays(today, -364)
  const gym = new Set(gymDates)
  const firstSheetGym = [...gymDates].sort()[0] ?? today

  for (let i = 0; i <= 364; i++) {
    const date = addDays(start, i)
    const dow = new Date(date + 'T12:00:00Z').getUTCDay() // 0 Sun
    const progress = i / 364 // fitter over the year
    const skip = skipRunDates.includes(date)

    const runToday = !skip && ((dow === 2 && rand() < 0.75) || (dow === 4 && rand() < 0.45) || (dow === 0 && rand() < 0.7))
    if (runToday) {
      const long = dow === 0 && rand() < 0.6
      const km = long ? 9 + rand() * 7 + progress * 3 : 4.5 + rand() * 4
      // Easy ~6:30/km a year ago, ~5:50/km now; tempo days a bit quicker. Stays slower than your real 5K PB pace.
      const paceS = (long ? 400 : dow === 2 ? 370 : 390) - progress * 40 + (rand() - 0.5) * 24 // s per km
      const moving = Math.round(km * paceS)
      out.push({
        id: id++,
        name: long ? 'Sunday Long Run' : dow === 2 ? 'Tuesday Tempo' : 'Evening Run',
        sport_type: 'Run',
        start_date_local: at(date, long ? 8 : 18),
        distance: Math.round(km * 1000),
        moving_time: moving,
        elapsed_time: moving + Math.round(rand() * 240),
        total_elevation_gain: Math.round(20 + rand() * (long ? 140 : 60)),
        average_heartrate: Math.round(148 + rand() * 18 - progress * 6),
      })
    }

    // Gym: every spreadsheet day, plus ~3 a week before the spreadsheet existed.
    const preSheetGym = date < firstSheetGym && [1, 3, 5].includes(dow) && rand() < 0.7
    if (gym.has(date) || preSheetGym) {
      const mins = 55 + Math.round(rand() * 25)
      out.push({
        id: id++,
        name: rand() < 0.5 ? 'Strength Training' : 'Weight Training',
        sport_type: 'WeightTraining',
        start_date_local: at(date, 7),
        distance: 0,
        moving_time: mins * 60,
        elapsed_time: mins * 60,
        total_elevation_gain: 0,
        average_heartrate: Math.round(112 + rand() * 20),
      })
    }
  }
  return out
}
