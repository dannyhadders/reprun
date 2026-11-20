// Workout plans as plain text, e.g. pasted from a PT or ChatGPT:
//
//   Arm day
//   EZ-bar Curl – 3x10-12 @ 19kg, rest 75s; squeeze at the top
//   3 sets of 8 hammer curls
//
// A routine is stored as its text, so the parser can get smarter without migrating data.
// Self-check: npx tsx scripts/check-plan.ts

import { GOALS, type GoalId } from './rules.ts'
import type { Profile } from './types.ts'

// timed: repsMin/repsMax are seconds held ("Plank – 3x45s"), not reps. superset: its label ("A1", "A2"), the way PTs and
// ChatGPT write a superset: the ones sharing a letter are done back to back, resting after the last (tidyGroups).
export type PlanItem = { name: string; sets: number; repsMin: number; repsMax: number; weight: number | null; restS: number | null; note: string | null; timed?: boolean; superset?: string }
export type ParsedRoutine = { name: string; items: PlanItem[]; unparsed: string[] }

const SETS = /(\d+)\s*(?:x|×|\*|sets?\s*(?:of|x)?)\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i
const WEIGHT = /@?\s*(\d+(?:\.\d+)?)\s*(kgs?|lbs?)\b/i

/**
 * Pounds to kg, as stored. A kg weight shown in lb (57.5 → "126.8", 13.6 → "30") would come back a little heavier (57.52,
 * 13.61): a false PB. So it snaps to the nearest 0.05 kg when within 0.02268 kg, half of the 0.1 lb the app shows. Swept:
 * every 0.05 kg step to 400 kg goes kg → lb → kg exactly, and every 0.5 lb step to 900 lb reads back as typed.
 */
export function lbToKg(lb: number) {
  const k = lb / 2.20462, step = Math.round(k * 20) / 20
  return Math.round((Math.abs(k - step) < 0.02268 ? step : k) * 100) / 100
}
/** The next weight up for double progression: +2.5 kg (+1 under 20), or for an exercise in lb +5 lb (+2.5 under 45 lb). */
export const stepUp = (kg: number, lb = false) => {
  if (!lb) return kg + (kg >= 20 ? 2.5 : 1)
  const now = Math.round(kg * 2.20462 * 2) / 2
  return lbToKg(now + (now >= 45 ? 5 : 2.5))
}
const REST = /rest\s*:?\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|s|sec|secs|seconds)?\b|(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|s|sec|secs|seconds)\s*rest/i

const words = (t: string) => t.split(/\s+/).filter(Boolean).length
/** A long line ending like a sentence: chat-reply advice, never an exercise or a day's name. */
const sentence = (t: string) => /[.?!]$/.test(t) && words(t) > 6

// Bullets, numbering and markdown that chat apps add.
const clean = (l: string) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').replace(/[#*_`]/g, '').trim()

// "A1. Bench Press – 3x8", "B2) Row …", "A1: …" (after bullets, numbering and bold are cleaned off): a superset label.
// The . ) or : is required, so a name like "C2 Rower" stays a name.
const LABEL = /^([A-H])([1-9])\s*[.):]\s*(?=\S)/

export function parseLine(raw: string): PlanItem | null {
  let line = clean(raw)
  const lab = line.match(LABEL)
  if (lab) line = line.slice(lab[0].length)
  let note: string | null = null
  const n = line.match(/;\s*(.+)$|\(([^)]+)\)/)
  if (n) {
    note = (n[1] ?? n[2]).trim()
    line = line.replace(n[0], ' ').trim()
  }
  const s = line.match(SETS)
  if (!s) return null
  // Chat replies wrap the plan in tips with sets in them ("If 4x6 feels easy, go up next time."): a sentence, or a
  // long run of words before the sets, is advice, not an exercise.
  if (sentence(line) || words(line.slice(0, s.index)) > 6) return null
  const rest = line.match(REST)
  const restVal = rest ? Number(rest[1] ?? rest[3]) : null
  const restUnit = rest ? (rest[2] ?? rest[4] ?? '') : ''
  const before = line.slice(0, s.index).replace(/[\s–\-:,]+$/, '')
  const after = line.slice(s.index! + s[0].length).replace(REST, '').replace(WEIGHT, '').replace(/^[\s,–\-:]+|[\s,–\-:]+$/g, '')
  const name = (before || after.split(',')[0]).replace(/\s+/g, ' ').trim()
  if (!name) return null
  const w = line.slice(s.index! + s[0].length).match(WEIGHT) ?? before.match(WEIGHT)
  const repsMin = Number(s[2])
  // "3x45s", "2x45-60 sec", "3 sets of 30 seconds": held for that long, not reps.
  const timed = /^\s*(?:s|secs?|seconds?)\b/i.test(line.slice(s.index! + s[0].length))
  return {
    name: before ? name.replace(WEIGHT, '').trim() : name,
    sets: Number(s[1]),
    repsMin,
    repsMax: s[3] ? Math.max(repsMin, Number(s[3])) : repsMin,
    weight: w ? (/^lb/i.test(w[2]) ? lbToKg(Number(w[1])) : Number(w[1])) : null, // "@ 135lb" is kept in kg
    // "rest 2" with no unit means minutes; "rest 90" means seconds.
    restS: restVal === null ? null : /^m/i.test(restUnit) || (!restUnit && restVal <= 5) ? Math.round(restVal * 60) : Math.round(restVal),
    note,
    ...(timed && { timed: true }),
    ...(lab && { superset: lab[1] + lab[2] }),
  }
}

/**
 * Supersets in a list (plan items, builder rows, the logger's exercises): the ones sharing a letter, next to each other,
 * done back to back. Tidied in place: a letter on one item alone, or apart from the rest of its group, is dropped, and the
 * groups are labelled again A1, A2, B1… in order, so moving, removing or adding never leaves a half-made superset.
 */
export function tidyGroups<T extends { superset?: string }>(list: T[]): T[] {
  let next = 0
  for (let k = 0; k < list.length;) {
    const g = list[k].superset?.[0]
    let end = k + 1
    // A group runs while the letter's the same; a "…1" starts a new one (two days of A1/A2 are two supersets).
    while (g && end < list.length && list[end].superset?.[0] === g && !list[end].superset!.endsWith('1')) end++
    const keep = g && end - k >= 2 && next < 8 // A to H, as plan text reads them
    const letter = keep ? String.fromCharCode(65 + next++) : ''
    for (let x = k; x < end; x++) {
      if (keep) list[x].superset = `${letter}${x - k + 1}`
      else delete list[x].superset
    }
    k = end
  }
  return list
}
/** The rest of a superset's group after this one, or nothing when it's the last (or not in one): it rests after the last. */
export const groupNext = (list: { superset?: string }[], k: number) =>
  list[k]?.superset && list[k + 1]?.superset?.[0] === list[k].superset![0] && !list[k + 1].superset!.endsWith('1') ? k + 1 : null
/** One step up or down (drag, arrow keys, Move up/down) past a superset you're not in jumps the whole superset, so it stays together. */
export function jumpTo(list: { superset?: string }[], from: number, to: number) {
  if (Math.abs(to - from) !== 1 || !list[to]?.superset) return to
  const d = to - from, mine = list[from]?.superset
  if (mine && (d > 0 ? groupNext(list, from) === to : groupNext(list, to) === from)) return to // moving within its own superset
  while (d > 0 ? groupNext(list, to) !== null : list[to].superset && !list[to].superset!.endsWith('1')) to += d
  return to
}
/** The builder's link between rows i and i+1: make them a superset (joining the group either is in), or split it there. */
export function linkRows<T extends { superset?: string }>(rows: T[], i: number): T[] {
  const c = rows.map(r => ({ ...r }))
  if (!c[i + 1]) return c
  if (groupNext(c, i) === i + 1) c[i + 1].superset = `${c[i + 1].superset![0]}1` // split: the rest start their own
  else {
    const g = c[i].superset?.[0] ?? c[i + 1].superset?.[0] ?? 'Z'
    if (!c[i].superset) c[i].superset = `${g}1`
    for (let k = i + 1; k < c.length && (k === i + 1 || groupNext(rows, k - 1) === k); k++) c[k].superset = `${g}2` // the next row and its group join
  }
  return tidyGroups(c)
}

export function parsePlan(text: string): ParsedRoutine[] {
  // Asked for a code block (planFormat), a chat reply's intro and tips sit outside it: read only what's inside.
  const fenced = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1])
  const lines = (fenced.length ? fenced.join('\n\n') : text).split(/\r?\n/)
  const out: ParsedRoutine[] = []
  const current = () => out.at(-1) ?? (out.push({ name: 'Workout', items: [], unparsed: [] }), out[0])
  const nextLine = (i: number) => lines.slice(i + 1).find(l => clean(l))
  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i])
    if (!line) continue
    const item = parseLine(lines[i])
    if (item) {
      current().items.push(item)
      continue
    }
    // A heading ends with ':' or is markdown, or is a first/after-a-blank line followed by an exercise.
    // Anything else is a stray line, kept so the preview can show it.
    const next = nextLine(i)
    const marked = /:\s*$/.test(lines[i]) || /^\s*(#|\*\*)/.test(lines[i])
    const titleish = !out.length || !clean(lines[i - 1] ?? '')
    if (!sentence(line) && (marked || (next && parseLine(next) && titleish))) out.push({ name: line.replace(/:\s*$/, ''), items: [], unparsed: [] })
    else current().unparsed.push(line)
  }
  return out.filter(r => r.items.length).map(r => ({ ...r, items: tidyGroups(r.items) }))
}

export const formatLine = (p: PlanItem) =>
  `${p.superset ? `${p.superset}. ` : ''}${p.name} – ${p.sets}x${p.repsMin}${p.repsMax > p.repsMin ? `-${p.repsMax}` : ''}${p.timed ? 's' : ''}${p.weight !== null ? ` @ ${p.weight}kg` : ''}${p.restS ? `, rest ${p.restS}s` : ''}${p.note ? `; ${p.note}` : ''}`

// ---------- the routine builder (src/components/RoutineBuilder.tsx) ----------
/** One exercise card in the builder, its boxes as typed: sets, reps ("8", "8-12", "45s"), kg ('' or 0 = bodyweight). */
export type BuilderRow = { name: string; sets: string; reps: string; weight: string; restS: number | null; note: string | null; superset?: string }

/** A routine's lines as builder cards. */
export const toRows = (body: string): BuilderRow[] => parsePlan(body).flatMap(d => d.items).map(p => ({
  name: p.name, sets: String(p.sets), reps: `${p.repsMin}${p.repsMax > p.repsMin ? `-${p.repsMax}` : ''}${p.timed ? 's' : ''}`,
  weight: p.weight === null ? '' : String(p.weight), restS: p.restS, note: p.note, ...(p.superset && { superset: p.superset }),
}))

/**
 * Builder cards as a routine's body, the same plan text Import saves. Or what's wrong, in plain words: reps that aren't
 * "8", "8-12" or "45s", a weight that isn't a number, or a name the plan text would read back differently (a ";", a
 * bracket, a number that looks like sets), since a routine naming the wrong exercise is worse than asking.
 */
export const nameError = (name: string) => `"${name}" can't go in a routine as it is: brackets, ; # * _ or a number at either end get read as part of the plan. Rename the exercise first (Exercises → it → Edit).`

export function fromRows(rows: BuilderRow[]): { body: string } | { error: string } {
  if (!rows.length) return { error: 'Add at least one exercise.' }
  rows = tidyGroups(rows.map(r => ({ ...r }))) // labels as saved: A1, A2…
  const lines: string[] = []
  for (const r of rows) {
    const name = r.name.trim()
    const sets = Math.round(+r.sets)
    if (!(sets >= 1 && sets <= 50)) return { error: `${name}: sets should be a number from 1 to 50.` }
    const m = r.reps.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?\s*(s|secs?|seconds)?$/i)
    if (!m || +m[1] < 1) return { error: `${name}: reps should look like 8, 8-12 or 45s.` }
    const lo = Math.min(+m[1], +(m[2] ?? m[1])), hi = Math.max(+m[1], +(m[2] ?? m[1])) // "12-8" means 8-12
    const kg = r.weight.trim() === '' ? 0 : +r.weight
    if (!(kg >= 0 && kg < 1000)) return { error: `${name}: the weight should be a number of kg.` }
    const weight = kg || null // 0 is bodyweight
    const item: PlanItem = { name, sets, repsMin: lo, repsMax: hi, weight, restS: r.restS, note: r.note, ...(m[3] && { timed: true }), ...(r.superset && { superset: r.superset }) }
    const line = formatLine(item)
    if (parseLine(line)?.name !== name) return { error: nameError(name) }
    lines.push(line)
  }
  return { body: lines.join('\n') }
}

/**
 * Rough session length: ~40 s per set plus its rest, and a minute per exercise to set up.
 * Rest falls back to 90 s when the plan doesn't say.
 */
export const estimateS = (items: Pick<PlanItem, 'sets' | 'restS' | 'superset'>[]) =>
  items.reduce((t, p, k) => t + p.sets * (40 + (groupNext(items, k) !== null ? 0 : p.restS ?? 90)) + 60, 0) // a superset rests once, after its last

/** 2700 -> "45 min", 4500 -> "1 hr 15 min", rounded to 5 minutes. */
export function roughTime(s: number) {
  const m = Math.max(5, Math.round(s / 300) * 5)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`
}

export const targetText = (p: Pick<PlanItem, 'sets' | 'repsMin' | 'repsMax' | 'timed'>) => `${p.sets} × ${p.repsMin}${p.repsMax > p.repsMin ? `–${p.repsMax}` : ''}${p.timed ? 's' : ''}`

/**
 * Double progression: hit the top of the rep range on every set at your working weight and the
 * weight goes up (+2.5 kg, or +1 kg under 20 kg); otherwise same weight, one more rep. Rated 9-10 for effort last
 * time (hard or all-out): the weight holds even at the top of the range, and `held` says why.
 */
export function suggest(p: Pick<PlanItem, 'repsMin' | 'repsMax' | 'weight' | 'timed'>, last: { weight_kg: number | null; reps: number | null; seconds?: number | null; rpe?: number | null }[], lb = false): { weight: number | null; reps: number; held?: true } {
  // Timed (a plank): 5 seconds longer than your best hold last time, or the plan's shortest the first time.
  if (p.timed) {
    const best = Math.max(0, ...last.map(s => s.seconds ?? 0))
    return { weight: p.weight, reps: best ? best + 5 : p.repsMin }
  }
  const done = last.filter(s => s.reps)
  if (!done.length) return { weight: p.weight, reps: p.repsMin }
  const top = Math.max(...done.map(s => s.weight_kg ?? 0))
  const atTop = done.filter(s => (s.weight_kg ?? 0) === top)
  const best = Math.max(...atTop.map(s => s.reps!))
  if (!top) return { weight: null, reps: best + 1 } // bodyweight: just beat last time
  if (atTop.every(s => s.reps! >= p.repsMax)) {
    if (done.some(s => (s.rpe ?? 0) >= 9)) return { weight: top, reps: p.repsMax, held: true }
    return { weight: stepUp(top, lb), reps: p.repsMin }
  }
  return { weight: top, reps: Math.min(best + 1, p.repsMax) }
}

/**
 * The ChatGPT prompt (Planner and onboarding): who they are and what they're after, then ask ChatGPT to quiz them
 * before writing a plan in the format the importer reads. Unknown details are just left out.
 */
type Me = { goals?: GoalId[]; weight_kg?: number | null; age?: number | null; sex?: Profile['sex'] | null }
const aboutMe = (me: Me) => {
  const goals = (me.goals ?? []).map(g => GOALS.find(x => x.id === g)!.label.toLowerCase())
  const about = [goals.length && `I want to ${goals.join(' and ')}`, me.age && `I'm ${me.age}`, me.weight_kg && `I weigh ${me.weight_kg} kg`, me.sex && `I'm ${me.sex === 'female' ? 'a woman' : 'a man'}`].filter(Boolean)
  return about.length ? `About me: ${about.join(', ')}.\n` : ''
}
// The format parsePlan reads, so the reply pastes straight into Import a plan.
const planFormat = (names: string[]) => `Start each workout day with its name on its own line, ending with a colon.
Then one line per exercise, exactly like this:
Bicep Curl – 3x8-10 @ 12kg, rest 60s; optional coaching note
For exercises you hold, give the seconds with an s, like: Plank – 3x45s, rest 45s
For a superset (two exercises back to back, resting after both), start their lines with A1. and A2. (B1. and B2. for the next one).
Use kg. Leave out the "@ ...kg" part for bodyweight exercises, and when you don't know my weight: never write a placeholder like "@ choose a weight".
Put it all inside one code block, with nothing but the workout lines in it, so I can copy it in one tap.${names.length ? `\nWhere they fit, use these exact exercise names: ${names.join(', ')}.` : ''}`

export function planPrompt(names: string[], me: Me = {}) {
  return `Help me plan my gym training. I log it in an app called RepRun, which imports the plan you write.
${aboutMe(me)}Before you write anything, ask me a few short questions, one at a time: how many days a week I can train, how long a session can be, what equipment I have, any injuries, and how experienced I am.
Then write my gym plan as plain text, no tables.
${planFormat(names)}`
}

/** What "Ask ChatGPT for one workout" offers, in tie-break order (legs first: the most skipped). */
export const FOCUSES = [{ id: 'legs', label: 'Legs' }, { id: 'back', label: 'Back' }, { id: 'chest', label: 'Chest' }, { id: 'shoulders', label: 'Shoulders' }, { id: 'arms', label: 'Arms' }] as const
export type Focus = (typeof FOCUSES)[number]

/** The three muscle groups with the fewest sets in `sets` (one muscle per set logged this week), least trained first. */
export function focusChoices(sets: string[]) {
  const n = (id: string) => sets.filter(m => m === id).length
  return FOCUSES.map(f => ({ ...f, sets: n(f.id) })).sort((a, b) => a.sets - b.sets).slice(0, 3) // stable sort keeps FOCUSES order on ties
}

/** One workout for today, written around recent training (`recent`: workoutText blocks, newest first, each with its date). */
export function workoutPrompt(focus: string, today: string, recent: string[], names: string[], me: Me = {}, runs: string[] = []) {
  return `Write me one gym workout for today, training ${focus.toLowerCase()}. I log it in an app called RepRun, which imports the workout you write.
${aboutMe(me)}Today is ${today}. ${recent.length ? `Here are my most recent workouts, newest first. Plan around them (don't hammer anything that's still recovering) and base the weights on what I lifted:\n\n${recent.join('\n\n')}\n\n` : `I haven't logged any workouts yet.\n`}${runs.length ? `My runs and other training in the last 7 days, newest first. Count them too (no heavy legs the day after a long or hard run):\n${runs.join('\n')}\n\n` : ''}Don't ask me questions, just write it. Reply with only the code block: no intro, warm-up, tips or follow-up questions.
${planFormat(names)}`
}
