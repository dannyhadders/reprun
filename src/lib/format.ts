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
export const kg = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${num(n, 1)} kg`)
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

/** "60 kg × 8", "BW × 12", "BW × 45s" */
export const setText = (s: { weight_kg: number | null; reps: number | null; seconds: number | null }) =>
  `${s.weight_kg !== null ? `${num(s.weight_kg, 1)} kg` : 'BW'} × ${s.reps !== null ? num(s.reps) : s.seconds !== null ? `${num(s.seconds)}s` : '–'}`

/** The logger's four effort choices, stored as RPE so a 1-10 rating from anywhere else still reads. */
export const EFFORT = [{ rpe: 6, emoji: '😌', label: 'Easy' }, { rpe: 8, emoji: '🙂', label: 'Good' }, { rpe: 9, emoji: '😤', label: 'Hard' }, { rpe: 10, emoji: '🥵', label: 'Max' }] as const
/** The nearest choice at or above a rating: 7 reads as Good, 5 as Easy. */
export const effort = (rpe: number | null | undefined) => (rpe ? EFFORT.find(e => rpe <= e.rpe) ?? EFFORT[3] : null)

type TextSet = { exercise: string; weight_kg: number | null; reps: number | null; seconds: number | null; notes?: string | null; rpe?: number | null }
/** A workout as plain text, one line per exercise, for pasting into ChatGPT or sending to a PT. */
export function workoutText(w: { date: string; title: string | null; duration_s?: number | null; notes?: string | null; sets: TextSet[] }) {
  const byEx = new Map<string, TextSet[]>()
  for (const s of w.sets) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s])
  const set = (s: TextSet) => setText(s) + (s.notes ? ` (${s.notes})` : '')
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  return [
    `${w.title || 'Workout'} · ${date(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${w.duration_s ? ` · ${duration(w.duration_s)}` : ''}`,
    `${plural(w.sets.length, 'set')}, ${num(volume)} kg total volume`,
    ...(w.notes ? ['', w.notes] : []),
    '',
    ...[...byEx].map(([name, sets]) => `${name}: ${sets.map(set).join(', ')}${effort(sets[0].rpe) ? ` (felt ${effort(sets[0].rpe)!.label.toLowerCase()})` : ''}`),
  ].join('\n')
}
