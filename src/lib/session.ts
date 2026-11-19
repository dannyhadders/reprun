// The live workout on the phone: pure helpers plus localStorage persistence. No JSX.
import { applyAlias, matchExercise, type Aliases } from '../../shared/exercises.ts'
export { matchExercise }
import { resolveExercise } from '../../shared/catalogue.ts'
import { formatLine, parseLine, parsePlan, suggest, type PlanItem } from '../../shared/plan.ts'
import type { Exercise, ImportPayload, ImportWorkout, Muscle, Routine, Workout, WorkoutSet } from '../../shared/types.ts'
import { useEffect, useState } from 'react'
import { api } from './data'
import { localISO } from './format'

export type LogSet = { reps: string; weight: string; done: boolean; note?: string } // strings: they're straight from inputs; note undefined = no note box
export type LogExercise = {
  key?: string // stable React key, so a dragged card keeps its DOM node (and the finger on it) as it moves
  name: string
  muscle: Muscle
  restS: number
  sets: LogSet[]
  target?: Pick<PlanItem, 'sets' | 'repsMin' | 'repsMax' | 'note' | 'timed'> // from a routine
  timed?: boolean // held for seconds (a plank): each set's `reps` box holds the seconds, saved as `seconds`
  suggest?: { weight: string; reps: string; fresh?: boolean; held?: boolean } // progression pick, shown as placeholders; fresh = no history and no weight in the plan; held = weight kept because last time felt hard
  collapsed?: boolean // folded away in the logger; ticked count still shows
  rpe?: number // how hard it felt, rated once it's done; saved on each of its sets
}
export type Active = { clientId: string; startedAt: number; title: string; notes?: string; exercises: LogExercise[]; restEndsAt: number | null; restFrom?: number | null; hold?: Hold | null } // restFrom: when the rest began, for the timer bar
/** A timed set's countdown: exercise i, set j, ends at endsAt; it ticks the set when it runs out. */
export type Hold = { i: number; j: number; endsAt: number; from: number }

const KEY = { active: 'reprun.active', outbox: 'reprun.outbox', rest: 'reprun.rest' }
const DEFAULT_REST = 90

// localStorage can throw (private mode, quota); losing a convenience is fine, crashing mid-workout isn't.
const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch { /* nothing useful to do */ }
}

export const loadActive = () => read<Active | null>(KEY.active, null)
export const saveActive = (a: Active | null) => write(KEY.active, a)

// Every exercise starts folded: the workout opens as a tidy list, and you open the one you're doing.
export const start = (title = '', exercises: LogExercise[] = []): Active =>
  ({ clientId: crypto.randomUUID(), startedAt: Date.now(), title, exercises: exercises.map(e => ({ ...e, collapsed: true })), restEndsAt: null })

export const newExercise = (raw: string, muscle?: Muscle, sets = 1, reps = '', weight = ''): LogExercise => {
  const e = resolveExercise(raw, null)
  return {
    key: crypto.randomUUID(),
    name: e.name,
    muscle: muscle ?? e.muscle,
    restS: read<Record<string, number>>(KEY.rest, {})[e.name] ?? DEFAULT_REST,
    sets: Array.from({ length: Math.max(1, sets) }, () => ({ reps, weight, done: false })),
  }
}

// Exercises in a plan are matched to ones you've logged before, so history, PBs and suggestions line up.
type Last = (name: string) => WorkoutSet[]

export function fromRoutine(r: Routine, known: Exercise[], last: Last, aliases: Aliases = {}): Active {
  const items = parsePlan(r.body).flatMap(x => x.items)
  return start(r.name, items.map(p => {
    const ex = matchExercise(p.name, known, aliases)
    const e = newExercise(ex?.name ?? p.name, ex?.muscle, p.sets)
    const s = suggest(p, last(e.name))
    return {
      ...e,
      restS: p.restS ?? e.restS,
      ...(p.timed && { timed: true }),
      target: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, note: p.note, ...(p.timed && { timed: true }) },
      // A hold with no weight is just bodyweight: nothing to ask the first time.
      suggest: { weight: s.weight === null ? '' : String(s.weight), reps: String(s.reps), fresh: !p.timed && s.weight === null && !last(e.name).length, held: s.held },
    }
  }))
}

/** Same exercises and number of sets as a past workout; placeholders come from last time as usual. */
export function fromWorkout(w: Workout, exById: Map<number, Exercise>): Active {
  const order: number[] = []
  for (const s of w.sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)
  return start(w.title ?? '', order.flatMap(id => {
    const ex = exById.get(id)
    const sets = w.sets.filter(s => s.exercise_id === id)
    return ex ? [{ ...newExercise(ex.name, ex.muscle, sets.length), ...(isTimed(sets) && { timed: true }) }] : []
  }))
}

/**
 * Swap an exercise for another, for this workout only (the routine is untouched). Ticked sets keep their numbers under
 * the new name; unticked ones lose the kg/reps typed for the old exercise but keep their notes. A routine's sets and rep
 * range carry over, the old plan note doesn't, and today's suggestion is worked out again from the new one's history.
 */
export function swapExercise(ex: LogExercise, name: string, muscle: Muscle, last: WorkoutSet[]): LogExercise {
  const target = ex.target && { ...ex.target, note: null }
  const s = target && suggest({ repsMin: target.repsMin, repsMax: target.repsMax, weight: null }, last)
  return {
    key: ex.key, name, muscle, restS: ex.restS, target, ...(ex.timed && { timed: true }),
    sets: ex.sets.map(x => (x.done ? x : { ...x, weight: '', reps: '' })),
    suggest: s && { weight: s.weight === null ? '' : String(s.weight), reps: String(s.reps), fresh: s.weight === null && !last.length, held: s.held },
  }
}

/** Move the exercise at `from` to `to` (drag to reorder). A running hold keeps pointing at its own exercise. */
export function moveExercise(a: Active, from: number, to: number) {
  if (from === to || !a.exercises[from] || !a.exercises[to]) return
  a.exercises.splice(to, 0, ...a.exercises.splice(from, 1))
  const h = a.hold
  if (h) h.i = h.i === from ? to : h.i > from && h.i <= to ? h.i - 1 : h.i < from && h.i >= to ? h.i + 1 : h.i
}

export const rememberRest =(name: string, s: number) => write(KEY.rest, { ...read<Record<string, number>>(KEY.rest, {}), [name]: s })

const validSet = (s: LogSet) => s.done && +s.reps > 0 && (s.weight === '' || +s.weight >= 0)

/** Sets held for time, not counted in reps: what makes an exercise timed when it comes from history, not a plan. */
export const isTimed = (sets: Pick<WorkoutSet, 'reps' | 'seconds'>[]) => sets.length > 0 && sets.every(s => s.reps === null && (s.seconds ?? 0) > 0)

export const totals = (a: Active) => {
  const sets = a.exercises.flatMap(e => e.sets.filter(validSet))
  const lifted = a.exercises.flatMap(e => (e.timed ? [] : e.sets.filter(validSet))) // seconds held aren't kilos lifted
  return { sets: sets.length, volume: lifted.reduce((v, s) => v + (+s.weight || 0) * +s.reps, 0) }
}

/**
 * "Save as routine" on the finish screen: what you just did as a plan (name and body, as Import plan saves it), or null
 * when it isn't new: you named it after a routine (that's how a routine's workout is titled) or a routine has the same
 * exercises in any order. An untitled workout gets "Thursday workout", since "Workout" is every untitled one.
 * Each exercise in the order done, from its sets at the top weight (warm-ups don't count): how many, the rep (or seconds)
 * range, the weight and the rest you used. null too when a name wouldn't read back the same from the plan text (a ";",
 * brackets, a number that looks like sets): a routine naming a different exercise is worse than no button.
 */
export function routineFromWorkout(w: ImportWorkout, routines: Routine[], known: Exercise[], aliases: Aliases = {}) {
  const title = w.title?.trim().slice(0, 100)
  const name = title || `${new Date(`${w.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long' })} workout`
  const names = [...new Set(w.sets.map(s => s.exercise))]
  if (!names.length) return null
  // Renames, merges and the catalogue's other names count as the same exercise, logged before or not.
  const key = (n: string) => (matchExercise(n, known, aliases)?.name ?? resolveExercise(applyAlias(aliases, n), null).name).trim().toLowerCase()
  const same = (list: string[]) => [...new Set(list.map(key))].sort().join('|')
  const mine = same(names)
  if (routines.some(r => (title && r.name.trim().toLowerCase() === title.toLowerCase()) || same(parsePlan(r.body).flatMap(x => x.items).map(p => p.name)) === mine)) return null
  const rests = read<Record<string, number>>(KEY.rest, {})
  const lines = names.map(n => {
    const all = w.sets.filter(s => s.exercise === n)
    const timed = all.some(s => s.seconds !== null)
    const top = Math.max(0, ...all.map(s => s.weight_kg ?? 0))
    const work = top ? all.filter(s => (s.weight_kg ?? 0) === top) : all
    const counts = work.map(s => (timed ? s.seconds : s.reps) ?? 0)
    return formatLine({ name: n, sets: work.length, repsMin: Math.min(...counts), repsMax: Math.max(...counts), weight: top || null, restS: rests[n] ?? null, note: null, ...(timed && { timed: true }) })
  })
  if (lines.some((l, k) => parseLine(l)?.name !== names[k])) return null
  return { name, body: lines.join('\n') }
}

/** Only ticked sets with reps go up; untouched planned sets are dropped. */
export function toImport(a: Active, endedAt = Date.now()): ImportWorkout {
  let position = 0
  return {
    date: localISO(new Date(a.startedAt)),
    title: a.title.trim() || null,
    notes: a.notes?.trim() || null,
    source: 'app',
    duration_s: Math.round((endedAt - a.startedAt) / 1000),
    client_id: a.clientId,
    sets: a.exercises.flatMap(e => {
      const lift = resolveExercise(e.name, null).lift ?? null
      return e.sets.filter(validSet).map(s => ({
        exercise: e.name, muscle: e.muscle, lift, position: position++,
        weight_kg: s.weight === '' ? null : +s.weight, reps: e.timed ? null : +s.reps, seconds: e.timed ? +s.reps : null, notes: s.note?.trim() || null, rpe: e.rpe ?? null,
      }))
    }),
  }
}

// ---------- outbox: finished workouts waiting for signal ----------

export const outbox = () => read<ImportWorkout[]>(KEY.outbox, [])

export function queue(w: ImportWorkout) {
  write(KEY.outbox, [...outbox().filter(x => x.client_id !== w.client_id), w])
}

/** Uploads everything queued. Each one leaves the outbox only after the server accepted it; client_id makes retries safe. */
let running: Promise<{ sent: number; error: string | null }> | null = null
export const flush = () => (running ??= send().finally(() => (running = null))) // one upload at a time

async function send() {
  let sent = 0
  for (let w: ImportWorkout | undefined; (w = outbox()[0]); sent++) { // re-read each time: a workout finished mid-upload goes up too
    const payload: ImportPayload = { workouts: [w], activities: [], records: [], goals: [] }
    try {
      await api('POST', 'import', payload)
    } catch (e) {
      return { sent, error: e instanceof Error ? e.message : String(e) }
    }
    write(KEY.outbox, outbox().filter(x => x.client_id !== w.client_id))
  }
  return { sent, error: null }
}

/** Date.now(), re-rendering every second. */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t = setInterval(tick, 1000)
    // Back from the home screen: catch up at once, as iOS can leave the interval asleep for a while after it.
    addEventListener('pageshow', tick)
    document.addEventListener('visibilitychange', tick)
    return () => (clearInterval(t), removeEventListener('pageshow', tick), document.removeEventListener('visibilitychange', tick))
  }, [])
  return now
}

// ---------- rest-over beep ----------
// iOS only lets audio play from a context that was unlocked inside a tap, so unlock() runs on each set tick.
let ctx: AudioContext | null = null
export const unlockAudio = () => {
  // iPhone (Safari 16.4+): mix with music, quieter for a moment, instead of pausing Spotify for a beep.
  const session = (navigator as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'transient'
  ctx ??= new AudioContext()
  void ctx.resume()
  // iOS speaks later only if speech was started once inside a tap: a silent, empty line does it.
  if (!spoke && 'speechSynthesis' in window) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(''), { volume: 0 }))
  spoke = true
}
let spoke = false

// ---------- spoken cues ----------
const VOICE = 'reprun.voice'
// Off unless turned on: iPhone pauses your music for the voice (no web setting mixes speech), while the beep mixes in.
export const voiceOn = () => read(VOICE, false)
export const setVoice = (on: boolean) => {
  write(VOICE, on)
  if (!on) window.speechSynthesis?.cancel()
}

/** The first set not ticked yet, in plain words: "Squat, 100 kilos, 5 reps". Falls back to the suggested weight/reps. */
export function nextUp(a: Active) {
  for (const ex of a.exercises) {
    const s = ex.sets.find(x => !x.done)
    if (!s) continue
    const w = s.weight || ex.suggest?.weight
    const r = s.reps || ex.suggest?.reps
    return [ex.name, w && `${w} kilos`, r && `${r} ${ex.timed ? 'seconds' : 'reps'}`].filter(Boolean).join(', ')
  }
  return null
}

/** Rest over: beep, then say what's next unless the voice is muted. */
export function restOver(a: Active) {
  beep()
  if (!voiceOn() || !('speechSynthesis' in window)) return
  const n = nextUp(a)
  speechSynthesis.speak(new SpeechSynthesisUtterance(n ? `Rest over. Next: ${n}.` : 'Rest over.'))
}
export function beep() {
  navigator.vibrate?.([200, 100, 200]) // Android; iPhone has no vibrate API, so it only beeps
  if (!ctx) return
  for (const [at, freq] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    g.gain.setValueAtTime(0.3, ctx.currentTime + at)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start(ctx.currentTime + at)
    o.stop(ctx.currentTime + at + 0.2)
  }
}
