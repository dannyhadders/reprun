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

export type PlanItem = { name: string; sets: number; repsMin: number; repsMax: number; weight: number | null; restS: number | null; note: string | null }
export type ParsedRoutine = { name: string; items: PlanItem[]; unparsed: string[] }

const SETS = /(\d+)\s*(?:x|×|\*|sets?\s*(?:of|x)?)\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i
const WEIGHT = /@?\s*(\d+(?:\.\d+)?)\s*kgs?\b/i
const REST = /rest\s*:?\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|s|sec|secs|seconds)?\b|(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|s|sec|secs|seconds)\s*rest/i

// Bullets, numbering and markdown that chat apps add.
const clean = (l: string) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').replace(/[#*_`]/g, '').trim()

export function parseLine(raw: string): PlanItem | null {
  let line = clean(raw)
  let note: string | null = null
  const n = line.match(/;\s*(.+)$|\(([^)]+)\)/)
  if (n) {
    note = (n[1] ?? n[2]).trim()
    line = line.replace(n[0], ' ').trim()
  }
  const s = line.match(SETS)
  if (!s) return null
  const rest = line.match(REST)
  const restVal = rest ? Number(rest[1] ?? rest[3]) : null
  const restUnit = rest ? (rest[2] ?? rest[4] ?? '') : ''
  const before = line.slice(0, s.index).replace(/[\s–\-:,]+$/, '')
  const after = line.slice(s.index! + s[0].length).replace(REST, '').replace(WEIGHT, '').replace(/^[\s,–\-:]+|[\s,–\-:]+$/g, '')
  const name = (before || after.split(',')[0]).replace(/\s+/g, ' ').trim()
  if (!name) return null
  const w = line.slice(s.index! + s[0].length).match(WEIGHT) ?? before.match(WEIGHT)
  const repsMin = Number(s[2])
  return {
    name: before ? name.replace(WEIGHT, '').trim() : name,
    sets: Number(s[1]),
    repsMin,
    repsMax: s[3] ? Math.max(repsMin, Number(s[3])) : repsMin,
    weight: w ? Number(w[1]) : null,
    // "rest 2" with no unit means minutes; "rest 90" means seconds.
    restS: restVal === null ? null : /^m/i.test(restUnit) || (!restUnit && restVal <= 5) ? Math.round(restVal * 60) : Math.round(restVal),
    note,
  }
}

export function parsePlan(text: string): ParsedRoutine[] {
  const lines = text.split(/\r?\n/)
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
    if (marked || (next && parseLine(next) && titleish)) out.push({ name: line.replace(/:\s*$/, ''), items: [], unparsed: [] })
    else current().unparsed.push(line)
  }
  return out.filter(r => r.items.length)
}

export const formatLine = (p: PlanItem) =>
  `${p.name} – ${p.sets}x${p.repsMin}${p.repsMax > p.repsMin ? `-${p.repsMax}` : ''}${p.weight !== null ? ` @ ${p.weight}kg` : ''}${p.restS ? `, rest ${p.restS}s` : ''}${p.note ? `; ${p.note}` : ''}`

/**
 * Rough session length: ~40 s per set plus its rest, and a minute per exercise to set up.
 * Rest falls back to 90 s when the plan doesn't say.
 */
export const estimateS = (items: Pick<PlanItem, 'sets' | 'restS'>[]) =>
  items.reduce((t, p) => t + p.sets * (40 + (p.restS ?? 90)) + 60, 0)

/** 2700 -> "45 min", 4500 -> "1 hr 15 min", rounded to 5 minutes. */
export function roughTime(s: number) {
  const m = Math.max(5, Math.round(s / 300) * 5)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`
}

export const targetText = (p: Pick<PlanItem, 'sets' | 'repsMin' | 'repsMax'>) => `${p.sets} × ${p.repsMin}${p.repsMax > p.repsMin ? `–${p.repsMax}` : ''}`

/**
 * Double progression: hit the top of the rep range on every set at your working weight and the
 * weight goes up (+2.5 kg, or +1 kg under 20 kg); otherwise same weight, one more rep. Rated 9-10 for effort last
 * time (hard or all-out): the weight holds even at the top of the range, and `held` says why.
 */
export function suggest(p: Pick<PlanItem, 'repsMin' | 'repsMax' | 'weight'>, last: { weight_kg: number | null; reps: number | null; rpe?: number | null }[]): { weight: number | null; reps: number; held?: true } {
  const done = last.filter(s => s.reps)
  if (!done.length) return { weight: p.weight, reps: p.repsMin }
  const top = Math.max(...done.map(s => s.weight_kg ?? 0))
  const atTop = done.filter(s => (s.weight_kg ?? 0) === top)
  const best = Math.max(...atTop.map(s => s.reps!))
  if (!top) return { weight: null, reps: best + 1 } // bodyweight: just beat last time
  if (atTop.every(s => s.reps! >= p.repsMax)) {
    if (done.some(s => (s.rpe ?? 0) >= 9)) return { weight: top, reps: p.repsMax, held: true }
    return { weight: top + (top >= 20 ? 2.5 : 1), reps: p.repsMin }
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
Use kg. Leave out "@ ...kg" for bodyweight exercises.${names.length ? `\nWhere they fit, use these exact exercise names: ${names.join(', ')}.` : ''}`

export function planPrompt(names: string[], me: Me = {}) {
  return `Help me plan my gym training. I log it in an app called RepRun, which imports the plan you write.
${aboutMe(me)}Before you write anything, ask me a few short questions, one at a time: how many days a week I can train, how long a session can be, what equipment I have, any injuries, and how experienced I am.
Then write my gym plan as plain text, no tables or markdown.
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
${aboutMe(me)}Today is ${today}. ${recent.length ? `Here are my most recent workouts, newest first. Plan around them (don't hammer anything that's still recovering) and base the weights on what I lifted:\n\n${recent.join('\n\n')}\n\n` : `I haven't logged any workouts yet.\n`}${runs.length ? `My runs and other training in the last 7 days, newest first. Count them too (no heavy legs the day after a long or hard run):\n${runs.join('\n')}\n\n` : ''}Don't ask me questions, just write it, as plain text with no tables or markdown and nothing else before or after.
${planFormat(names)}`
}
