// The live workout on the phone: pure helpers plus localStorage persistence. No JSX.
import { matchExercise, type Aliases } from '../../shared/exercises.ts'
export { matchExercise }
import { resolveExercise } from '../../shared/catalogue.ts'
import { parsePlan, suggest, type PlanItem } from '../../shared/plan.ts'
import type { Exercise, ImportPayload, ImportWorkout, Muscle, Routine, Workout, WorkoutSet } from '../../shared/types.ts'
import { useEffect, useState } from 'react'
import { api } from './data'
import { localISO } from './format'

export type LogSet = { reps: string; weight: string; done: boolean; note?: string } // strings: they're straight from inputs; note undefined = no note box
export type LogExercise = {
  name: string
  muscle: Muscle
  restS: number
  sets: LogSet[]
  target?: Pick<PlanItem, 'sets' | 'repsMin' | 'repsMax' | 'note'> // from a routine
  suggest?: { weight: string; reps: string; fresh?: boolean; held?: boolean } // progression pick, shown as placeholders; fresh = no history and no weight in the plan; held = weight kept because last time felt hard
  collapsed?: boolean // folded away in the logger; ticked count still shows
  rpe?: number // how hard it felt, rated once it's done; saved on each of its sets
}
export type Active = { clientId: string; startedAt: number; title: string; notes?: string; exercises: LogExercise[]; restEndsAt: number | null; restFrom?: number | null } // restFrom: when the rest began, for the timer bar

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

export const start = (title = '', exercises: LogExercise[] = []): Active =>
  ({ clientId: crypto.randomUUID(), startedAt: Date.now(), title, exercises, restEndsAt: null })

export const newExercise = (raw: string, muscle?: Muscle, sets = 1, reps = '', weight = ''): LogExercise => {
  const e = resolveExercise(raw, null)
  return {
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
      target: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, note: p.note },
      suggest: { weight: s.weight === null ? '' : String(s.weight), reps: String(s.reps), fresh: s.weight === null && !last(e.name).length, held: s.held },
    }
  }))
}

/** Same exercises and number of sets as a past workout; placeholders come from last time as usual. */
export function fromWorkout(w: Workout, exById: Map<number, Exercise>): Active {
  const order: number[] = []
  for (const s of w.sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)
  return start(w.title ?? '', order.flatMap(id => {
    const ex = exById.get(id)
    return ex ? [newExercise(ex.name, ex.muscle, w.sets.filter(s => s.exercise_id === id).length)] : []
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
    name, muscle, restS: ex.restS, target,
    sets: ex.sets.map(x => (x.done ? x : { ...x, weight: '', reps: '' })),
    suggest: s && { weight: s.weight === null ? '' : String(s.weight), reps: String(s.reps), fresh: s.weight === null && !last.length, held: s.held },
  }
}

export const rememberRest =(name: string, s: number) => write(KEY.rest, { ...read<Record<string, number>>(KEY.rest, {}), [name]: s })

const validSet = (s: LogSet) => s.done && +s.reps > 0 && (s.weight === '' || +s.weight >= 0)

export const totals = (a: Active) => {
  const sets = a.exercises.flatMap(e => e.sets.filter(validSet))
  return { sets: sets.length, volume: sets.reduce((v, s) => v + (+s.weight || 0) * +s.reps, 0) }
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
        weight_kg: s.weight === '' ? null : +s.weight, reps: +s.reps, seconds: null, notes: s.note?.trim() || null, rpe: e.rpe ?? null,
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
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ---------- rest-over beep ----------
// iOS only lets audio play from a context that was unlocked inside a tap, so unlock() runs on each set tick.
let ctx: AudioContext | null = null
export const unlockAudio = () => {
  ctx ??= new AudioContext()
  void ctx.resume()
  // iOS speaks later only if speech was started once inside a tap: a silent, empty line does it.
  if (!spoke && 'speechSynthesis' in window) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(''), { volume: 0 }))
  spoke = true
}
let spoke = false

// ---------- spoken cues ----------
const VOICE = 'reprun.voice'
export const voiceOn = () => read(VOICE, true)
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
    return [ex.name, w && `${w} kilos`, r && `${r} reps`].filter(Boolean).join(', ')
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
