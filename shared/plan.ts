// Workout plans as plain text, e.g. pasted from a PT or ChatGPT:
//
//   Arm day
//   EZ-bar Curl – 3x10-12 @ 19kg, rest 75s; squeeze at the top
//   3 sets of 8 hammer curls
//
// A routine is stored as its text, so the parser can get smarter without migrating data.
// Self-check: npx tsx scripts/check-plan.ts

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
 * weight goes up (+2.5 kg, or +1 kg under 20 kg); otherwise same weight, one more rep.
 */
export function suggest(p: Pick<PlanItem, 'repsMin' | 'repsMax' | 'weight'>, last: { weight_kg: number | null; reps: number | null }[]) {
  const done = last.filter(s => s.reps)
  if (!done.length) return { weight: p.weight, reps: p.repsMin }
  const top = Math.max(...done.map(s => s.weight_kg ?? 0))
  const atTop = done.filter(s => (s.weight_kg ?? 0) === top)
  const best = Math.max(...atTop.map(s => s.reps!))
  if (!top) return { weight: null, reps: best + 1 } // bodyweight: just beat last time
  if (atTop.every(s => s.reps! >= p.repsMax)) return { weight: top + (top >= 20 ? 2.5 : 1), reps: p.repsMin }
  return { weight: top, reps: Math.min(best + 1, p.repsMax) }
}
