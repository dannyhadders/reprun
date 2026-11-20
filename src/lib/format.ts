import { lbToKg } from '../../shared/plan.ts'
export const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => localISO()
export const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISO(d)
}
export const parseISO = (s: string) => new Date(s + 'T12:00:00')
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
/** Monday of the week containing `iso`. */
export const weekStart = (iso: string) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localISO(d)
}

export const num = (n: number, dp = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: 0 })
// kg or lb. Weights are always stored in kg; this is only what you see and type. Your default is on the profile, and
// so is each exercise you've switched (the unit button in the logger: machines marked in lb at a kg gym).
export type Unit = 'kg' | 'lb'
const LB = 2.20462
let units: { unit: Unit; each: Record<string, Unit> } = { unit: 'kg', each: {} }
// Switches the server hasn't confirmed yet (no signal, or still on their way): laid over the profile so every screen
// and the next workout use them at once, and dropped one by one once a loaded profile shows them (lib/session.ts sends them).
const PENDING = 'reprun.units'
export const pendingUnits = (): Record<string, Unit> => { try { return JSON.parse(localStorage.getItem(PENDING) || '{}') } catch { return {} } }
const savePending = (p: Record<string, Unit>) => { try { if (Object.keys(p).length) localStorage.setItem(PENDING, JSON.stringify(p)); else localStorage.removeItem(PENDING) } catch { /* kept in memory only */ } }
/** An exercise switched to `u` (lower-case name): applies now, and waits on the phone until the server has it. */
export const addPendingUnit = (key: string, u: Unit) => (savePending({ ...pendingUnits(), [key]: u }), void (units.each = { ...units.each, [key]: u }))
export const dropPendingUnit = (key: string) => { const p = pendingUnits(); delete p[key]; savePending(p) }
/** Called by DataProvider whenever the data loads, so every page formats with the current choice. */
export const setUnits = (p: { unit?: Unit; units?: Record<string, Unit> }) => {
  const unit = p.unit ?? 'kg', each = { ...p.units }, left: Record<string, Unit> = {}
  for (const [k, u] of Object.entries(pendingUnits())) if ((Object.hasOwn(each, k) ? each[k] : unit) !== u) (left[k] = u), (each[k] = u)
  savePending(left)
  units = { unit, each }
}
/** An exercise's unit (your switch for it, else your default); no name = your default, for totals. */
export const unitOf = (name?: string): Unit => (name && Object.hasOwn(units.each, name.toLowerCase()) && units.each[name.toLowerCase()]) || units.unit
export const fromKg = (v: number, u: Unit) => (u === 'lb' ? v * LB : v)
export const toKg = (v: number, u: Unit) => (u === 'lb' ? lbToKg(v) : v) // snaps a kg weight shown in lb back: no false PB
/** A kg value as the box shows it: "220.5" in lb, "100" in kg. */
export const shown = (v: number | null | undefined, u: Unit) => (v === null || v === undefined ? '' : String(u === 'lb' ? Math.round(v * LB * 10) / 10 : Math.round(v * 100) / 100)) // kg exact (31.25 stays 31.25)
/** "100 kg", or "220.5 lb" for an exercise in lb. The name picks the unit; without one it's your default. */
export const kg = (n: number | null | undefined, name?: string) => {
  const u = unitOf(name)
  return n === null || n === undefined ? '–' : `${num(fromKg(n, u), 1)} ${u}`
}
export const km = (m: number | null | undefined, dp = 2) => (m === null || m === undefined ? '–' : `${num(m / 1000, dp)} km`)

export const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parseISO(iso).toLocaleDateString('en-GB', opts)
export const shortDate = (iso: string) => date(iso, { day: 'numeric', month: 'short' })
export const weekday = (iso: string) => date(iso, { weekday: 'long' })
export const monthLabel = (iso: string) => date(iso, { month: 'long', year: 'numeric' })

export const ago = (iso: string) => {
  const d = daysBetween(iso, today())
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  if (d < 30) return `${Math.floor(d / 7)} wk ago`
  return shortDate(iso)
}

export const duration = (s: number | null | undefined) => {
  if (!s) return '–'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
export const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.round(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
/** seconds per km -> "5:26 /km" */
export const pace = (sPerKm: number | null) => (sPerKm ? `${clock(sPerKm)} /km` : '–')

export const plural = (n: number, word: string, many = word + 's') => `${num(n)} ${n === 1 ? word : many}`
export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** "60 kg × 8", "BW × 12", "BW × 45s"; in lb when the exercise `name` is. */
export const setText = (s: { weight_kg: number | null; reps: number | null; seconds: number | null }, name?: string) =>
  `${s.weight_kg !== null ? kg(s.weight_kg, name) : 'BW'} × ${s.reps !== null ? num(s.reps) : s.seconds !== null ? `${num(s.seconds)}s` : '–'}`

/** The logger's four effort choices, stored as RPE so a 1-10 rating from anywhere else still reads. */
export const EFFORT = [{ rpe: 6, emoji: '😌', label: 'Easy' }, { rpe: 8, emoji: '🙂', label: 'Good' }, { rpe: 9, emoji: '😤', label: 'Hard' }, { rpe: 10, emoji: '🥵', label: 'Max' }] as const
/** The nearest choice at or above a rating: 7 reads as Good, 5 as Easy. */
export const effort = (rpe: number | null | undefined) => (rpe ? EFFORT.find(e => rpe <= e.rpe) ?? EFFORT[3] : null)

type TextSet = { exercise: string; weight_kg: number | null; reps: number | null; seconds: number | null; notes?: string | null; rpe?: number | null; warmup?: number | boolean | null }
/** A workout as plain text, one line per exercise, for pasting into ChatGPT or sending to a PT. */
/** A run or other activity on one line, for the ChatGPT prompt: "Run · Tue 17 Nov 2026 · 10.2 km · 52 min · avg HR 151". */
export const activityText = (a: { sport: string; date: string; distance_m: number | null; moving_s: number | null; elapsed_s: number | null; avg_hr: number | null }) =>
  [a.sport, date(a.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), a.distance_m ? `${num(a.distance_m / 1000, 1)} km` : null,
    a.moving_s || a.elapsed_s ? duration(a.moving_s || a.elapsed_s) : null, a.avg_hr ? `avg HR ${Math.round(a.avg_hr)}` : null].filter(Boolean).join(' · ')

export function workoutText(w: { date: string; title: string | null; duration_s?: number | null; notes?: string | null; sets: TextSet[] }) {
  const byEx = new Map<string, TextSet[]>()
  for (const s of w.sets) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s])
  const set = (s: TextSet) => setText(s, s.exercise) + (s.notes ? ` (${s.notes})` : '')
  // Warm-ups are listed (so a PT or ChatGPT can see how you warmed up) but not counted in the sets or the volume.
  const work = w.sets.filter(s => !s.warmup)
  const volume = work.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  const line = (sets: TextSet[]) => {
    const warm = sets.filter(s => s.warmup), rest = sets.filter(s => !s.warmup)
    return [warm.length && `warm-up ${warm.map(set).join(', ')}`, rest.map(set).join(', ')].filter(Boolean).join(' · ')
  }
  return [
    `${w.title || 'Workout'} · ${date(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${w.duration_s ? ` · ${duration(w.duration_s)}` : ''}`,
    `${plural(work.length, 'set')}${w.sets.length > work.length ? ` (plus ${plural(w.sets.length - work.length, 'warm-up set')})` : ''}, ${kg(Math.round(volume))} total volume`,
    ...(w.notes ? ['', w.notes] : []),
    '',
    ...[...byEx].map(([name, sets]) => `${name}: ${line(sets)}${effort(sets[0].rpe) ? ` (felt ${effort(sets[0].rpe)!.label.toLowerCase()})` : ''}`),
  ].join('\n')
}
