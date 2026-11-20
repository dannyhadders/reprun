// The live workout on the phone: pure helpers plus localStorage persistence. No JSX.
import { applyAlias, matchExercise, type Aliases } from '../../shared/exercises.ts'
export { matchExercise }
import { resolveExercise } from '../../shared/catalogue.ts'
import { formatLine, groupNext, jumpTo, parseLine, parsePlan, suggest, tidyGroups, type PlanItem } from '../../shared/plan.ts'
export { groupNext, tidyGroups }
import { barFor } from '../../shared/plates.ts'
import type { Exercise, ImportPayload, ImportWorkout, Muscle, Routine, Workout, WorkoutSet } from '../../shared/types.ts'
import { useEffect, useState } from 'react'
import { api } from './data'
import { addPendingUnit, localISO, pendingUnits, shown, toKg, unitOf } from './format'

export type LogSet = { reps: string; weight: string; done: boolean; note?: string; warmup?: true } // warmup: saved, but not counted in any stat // strings: they're straight from inputs; note undefined = no note box
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
  lb?: boolean // its weights are typed in lb (converted to kg when saved); set from your choice when it's added
  superset?: string // "A1", "A2": done back to back with its neighbours sharing the letter, resting after the last (tidyGroups)
}
export type Active = { clientId: string; startedAt: number; title: string; notes?: string; hideLastNote?: true; exercises: LogExercise[]; restEndsAt: number | null; restFrom?: number | null; hold?: Hold | null } // restFrom: when the rest began, for the timer bar
/** A timed set's countdown: exercise i, set j, ends at endsAt; it ticks the set when it runs out. */
export type Hold = { i: number; j: number; endsAt: number; from: number }

const KEY = { active: 'reprun.active', outbox: 'reprun.outbox', rest: 'reprun.rest', bars: 'reprun.bars' }
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
    ...(unitOf(e.name) === 'lb' && { lb: true }),
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
    const s = suggest(p, last(e.name), e.lb)
    return {
      ...e,
      restS: p.restS ?? e.restS,
      ...(p.timed && { timed: true }),
      ...(p.superset && { superset: p.superset }),
      target: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, note: p.note, ...(p.timed && { timed: true }) },
      // A hold with no weight is just bodyweight: nothing to ask the first time.
      suggest: { weight: shown(s.weight, e.lb ? 'lb' : 'kg'), reps: String(s.reps), fresh: !p.timed && s.weight === null && !last(e.name).length, held: s.held },
    }
  }))
}

/** Same exercises and number of sets as a past workout; placeholders come from last time as usual. */
export function fromWorkout(w: Workout, exById: Map<number, Exercise>): Active {
  const order: number[] = []
  for (const s of w.sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)
  return start(w.title ?? '', tidyGroups(order.flatMap(id => {
    const ex = exById.get(id)
    const sets = w.sets.filter(s => s.exercise_id === id && !s.warmup) // Repeat: the working sets (add warm-ups again with + Warm-up)
    const ss = w.sets.find(s => s.exercise_id === id && s.superset)?.superset
    return ex ? [{ ...newExercise(ex.name, ex.muscle, sets.length), ...(isTimed(sets) && { timed: true }), ...(ss && { superset: ss }) }] : []
  })))
}

/**
 * Swap an exercise for another, for this workout only (the routine is untouched). Ticked sets keep their numbers under
 * the new name; unticked ones lose the kg/reps typed for the old exercise but keep their notes. A routine's sets and rep
 * range carry over, the old plan note doesn't, and today's suggestion is worked out again from the new one's history.
 */
export function swapExercise(ex: LogExercise, name: string, muscle: Muscle, last: WorkoutSet[]): LogExercise {
  const target = ex.target && { ...ex.target, note: null }
  const lb = unitOf(name) === 'lb'
  const s = target && suggest({ repsMin: target.repsMin, repsMax: target.repsMax, weight: null }, last, lb)
  return {
    key: ex.key, name, muscle, restS: ex.restS, target, ...(ex.timed && { timed: true }), ...(lb && { lb: true }), ...(ex.superset && { superset: ex.superset }),
    // Unticked warm-ups were for the old exercise's weight: they go (+ Warm-up can add the new one's).
    sets: ex.sets.filter(x => x.done || !x.warmup).map(x => (x.done ? { ...x, weight: convert(x.weight, !!ex.lb, lb) } : { ...x, weight: '', reps: '' })),
    suggest: s && { weight: shown(s.weight, lb ? 'lb' : 'kg'), reps: String(s.reps), fresh: s.weight === null && !last.length, held: s.held },
  }
}

/**
 * Move the exercise at `from` to `to` (drag to reorder). A running hold keeps pointing at its own exercise. One step past
 * a superset it isn't in jumps the whole superset (shared/plan.ts jumpTo). Returns where it landed.
 */
export function moveExercise(a: Active, from: number, to: number): number {
  to = jumpTo(a.exercises, from, to)
  if (from === to || !a.exercises[from] || !a.exercises[to]) return from
  a.exercises.splice(to, 0, ...a.exercises.splice(from, 1))
  const h = a.hold
  if (h) h.i = h.i === from ? to : h.i > from && h.i <= to ? h.i - 1 : h.i < from && h.i >= to ? h.i + 1 : h.i
  return to
}

// ---------- supersets ----------
/** Make exercises i and k a superset: k moves to just under i (keeping i's own place) and both get a fresh letter. */
export function pairExercises(a: Active, i: number, k: number) {
  if (i === k || !a.exercises[i] || !a.exercises[k] || a.exercises[i].superset || a.exercises[k].superset) return
  const to = k > i ? i + 1 : i
  moveExercise(a, k, to)
  const top = k > i ? i : i - 1
  a.exercises[top].superset = 'Z1' // tidyGroups gives the real letters, in order
  a.exercises[top + 1].superset = 'Z2'
  tidyGroups(a.exercises)
}
/** Split exercise i's superset: every exercise in it goes back to resting after each set. */
export function unpairExercises(a: Active, i: number) {
  let k = i
  while (k > 0 && groupNext(a.exercises, k - 1) === k) k-- // the group's first
  if (!a.exercises[k]?.superset) return
  for (let n: number | null = k; n !== null;) {
    const next: number | null = groupNext(a.exercises, n)
    delete a.exercises[n].superset
    n = next
  }
}
/** The rest after exercise i's set: a superset rests once, for its last exercise's rest time. */
export function restAfter(a: Active, i: number) {
  let last = i
  for (let n = groupNext(a.exercises, last); n !== null; n = groupNext(a.exercises, n)) last = n
  return a.exercises[last].restS
}
/**
 * Whose turn it is in a superset: the first exercise of the group (exercise i's, or any) that's a set behind the one
 * ahead of it, counting working sets (warm-ups go in their own time). Nothing when the round is done: time to rest.
 */
export function supersetTurn(a: Active, i?: number): { i: number; j: number } | null {
  const ex = a.exercises
  for (let k = 0; k < ex.length; k++) {
    if (!ex[k].superset || (i !== undefined && ex[k].superset![0] !== ex[i]?.superset?.[0])) continue
    if (k > 0 && ex[k - 1].superset?.[0] === ex[k].superset![0]) continue // not the group's first
    const group: number[] = [k]
    for (let n = groupNext(ex, k); n !== null; n = groupNext(ex, n)) group.push(n)
    const done = (n: number) => ex[n].sets.filter(s => s.done && !s.warmup).length
    const most = Math.max(...group.map(done))
    const behind = group.find(n => done(n) < most && ex[n].sets.some(s => !s.done && !s.warmup))
    if (behind !== undefined) return { i: behind, j: ex[behind].sets.findIndex(s => !s.done && !s.warmup) }
  }
  return null
}

/** A typed weight in kg, from a box in kg or lb. */
export const setKg = (w: string, lb?: boolean) => toKg(+w, lb ? 'lb' : 'kg')
/** A typed weight moved from one unit to the other ("100" kg → "220.5" lb). Blank stays blank. */
export const convert = (w: string, fromLb: boolean, toLb: boolean) => (w === '' || fromLb === toLb ? w : shown(setKg(w, fromLb), toLb ? 'lb' : 'kg'))
/** Switch an exercise's boxes between kg and lb, numbers converted, today's suggestion too. */
export function switchUnit(ex: LogExercise) {
  const lb = !ex.lb
  for (const s of ex.sets) s.weight = convert(s.weight, !!ex.lb, lb)
  if (ex.suggest) ex.suggest.weight = convert(ex.suggest.weight, !!ex.lb, lb)
  if (lb) ex.lb = true
  else delete ex.lb
}

// ---------- an exercise's unit, remembered on the profile ----------
// The switch applies at once and waits on the phone (lib/format.ts pending units) until a loaded profile shows it, so two
// quick switches, or one with no signal, can't be lost. Sent one at a time; again at Finish and on the next switch.
let sending: Promise<unknown> = Promise.resolve()
export function rememberUnit(name: string, to: 'kg' | 'lb') {
  addPendingUnit(name.toLowerCase(), to)
  return sendUnits()
}
export function sendUnits(): Promise<boolean> {
  const next = sending.then(async () => {
    const pending = pendingUnits()
    if (!Object.keys(pending).length) return false
    // Only these keys, on top of what the server has: an older copy of the profile here can't undo anything. Back to
    // your default goes as a removal, so the exercise follows the default if you change it later.
    const def = unitOf()
    const units = Object.fromEntries(Object.entries(pending).map(([k, u]) => [k, u === def ? null : u]))
    try { await api('PATCH', 'profile', { units }); return true } catch { return false }
  })
  sending = next
  return next
}

/** The bar an exercise is on, for the plate calculator: your pick (per phone, like rest), else the usual one for that lift. */
export const barOf = (name: string) => read<Record<string, string>>(KEY.bars, {})[name] ?? barFor(name)
export const rememberBar = (name: string, id: string) => write(KEY.bars, { ...read<Record<string, string>>(KEY.bars, {}), [name]: id })

/** The note you wrote the last time you did a workout with this name (a routine's), for the top of the logger. */
export function lastNote(workouts: Pick<Workout, 'id' | 'date' | 'title' | 'notes'>[], title: string) {
  const t = title.trim().toLowerCase()
  if (!t) return null
  const same = workouts.filter(w => w.title?.trim().toLowerCase() === t)
  const last = same.reduce<(typeof same)[number] | null>((b, w) => (!b || w.date > b.date || (w.date === b.date && w.id > b.id) ? w : b), null)
  return last?.notes?.trim() ? { date: last.date, notes: last.notes.trim() } : null // last time wrote nothing: nothing, not an older one
}

export const rememberRest =(name: string, s: number) => write(KEY.rest, { ...read<Record<string, number>>(KEY.rest, {}), [name]: s })

const validSet = (s: LogSet) => s.done && +s.reps > 0 && (s.weight === '' || +s.weight >= 0)

/** Sets held for time, not counted in reps: what makes an exercise timed when it comes from history, not a plan. */
export const isTimed = (sets: Pick<WorkoutSet, 'reps' | 'seconds'>[]) => sets.length > 0 && sets.every(s => s.reps === null && (s.seconds ?? 0) > 0)

/** sets and volume: working sets only (the header, the finish screen); ticked: every ticked set, warm-ups too. */
export const totals = (a: Active) => {
  const ticked = a.exercises.flatMap(e => e.sets.filter(validSet))
  const sets = ticked.filter(s => !s.warmup)
  const lifted = a.exercises.flatMap(e => (e.timed ? [] : e.sets.filter(s => validSet(s) && !s.warmup).map(s => ({ ...s, weight: String(setKg(s.weight || '0', e.lb)) })))) // seconds held aren't kilos lifted
  return { sets: sets.length, ticked: ticked.length, volume: lifted.reduce((v, s) => v + (+s.weight || 0) * +s.reps, 0) }
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
  const names = [...new Set(w.sets.filter(s => !s.warmup).map(s => s.exercise))]
  if (!names.length) return null
  // Renames, merges and the catalogue's other names count as the same exercise, logged before or not.
  const key = (n: string) => (matchExercise(n, known, aliases)?.name ?? resolveExercise(applyAlias(aliases, n), null).name).trim().toLowerCase()
  const same = (list: string[]) => [...new Set(list.map(key))].sort().join('|')
  const mine = same(names)
  if (routines.some(r => (title && r.name.trim().toLowerCase() === title.toLowerCase()) || same(parsePlan(r.body).flatMap(x => x.items).map(p => p.name)) === mine)) return null
  const rests = read<Record<string, number>>(KEY.rest, {})
  const items = names.map(n => {
    const all = w.sets.filter(s => s.exercise === n && !s.warmup) // the routine is the working sets
    const timed = all.some(s => s.seconds !== null)
    const top = Math.max(0, ...all.map(s => s.weight_kg ?? 0))
    const work = top ? all.filter(s => (s.weight_kg ?? 0) === top) : all
    const counts = work.map(s => (timed ? s.seconds : s.reps) ?? 0)
    return { name: n, sets: work.length, repsMin: Math.min(...counts), repsMax: Math.max(...counts), weight: top || null, restS: rests[n] ?? null, note: null, ...(timed && { timed: true }), ...(all.find(s => s.superset) && { superset: all.find(s => s.superset)!.superset! }) } as PlanItem
  })
  const lines = tidyGroups(items).map(formatLine)
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
        weight_kg: s.weight === '' ? null : setKg(s.weight, e.lb), reps: e.timed ? null : +s.reps, seconds: e.timed ? +s.reps : null, notes: s.note?.trim() || null, rpe: e.rpe ?? null, ...(s.warmup && { warmup: true }), ...(e.superset && { superset: e.superset }),
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
    return [ex.name, w && `${w} ${ex.lb ? 'pounds' : 'kilos'}`, r && `${r} ${ex.timed ? 'seconds' : 'reps'}`].filter(Boolean).join(', ')
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
