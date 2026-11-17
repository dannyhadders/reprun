// Renaming and merging exercises: the rules both the Worker and the phone-only copy (src/lib/local.ts) apply.
// Old names live on as your own aliases (settings 'aliases': old name, lower case → current name), so routines,
// unsent uploads, a workout in progress and spreadsheet re-imports that still say the old name land on the right one.
import { resolveExercise } from './catalogue.ts'
import { parseLine } from './plan.ts'
import type { Exercise, Muscle } from './types.ts'

export type Aliases = Record<string, string>
export const MUSCLE_LIST: Muscle[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'other']
export const exerciseNameOk = (n: unknown): n is string => typeof n === 'string' && !!n.trim() && n.trim().length <= 100

/** The name to file an incoming exercise under: your alias if there is one, else as given. */
export const applyAlias = (aliases: Aliases | undefined, name: string) => aliases?.[name.trim().toLowerCase()] ?? name

/** Incoming names → the exercise to file them under: your alias first, then any existing exercise whose name
 *  differs only in case (so a case-only rename, or "bench press" vs "Bench Press", never splits history). */
export function nameFiler(aliases: Aliases | undefined, existing: string[]) {
  const byLower = new Map(existing.map(n => [n.toLowerCase(), n]))
  return (raw: string) => {
    const n = applyAlias(aliases, raw).trim()
    return byLower.get(n.toLowerCase()) ?? n
  }
}

/** A backup's aliases added to yours: never overriding yours, never swallowing an exercise you already have. */
export function mergeAliases(mine: Aliases, theirs: unknown, existing: string[]): Aliases {
  const have = new Set(existing.map(n => n.toLowerCase()))
  const out = { ...mine }
  if (theirs && typeof theirs === 'object') for (const [k, v] of Object.entries(theirs)) {
    if (typeof v === 'string' && !(k in out) && !have.has(k)) out[k] = v
  }
  return out
}

/** Which of your exercises a typed or planned name means: your aliases, then the catalogue, then aliases again. */
export const matchExercise = (raw: string, known: Exercise[], aliases: Aliases = {}) => {
  const name = applyAlias(aliases, raw) // a name you've since renamed or merged
  const key = applyAlias(aliases, resolveExercise(name, null).name).toLowerCase() // the catalogue's name may be renamed too
  return known.find(e => e.name.toLowerCase() === name.trim().toLowerCase() || e.name.toLowerCase() === key) ?? null
}

/** Remember that `from` is now `to`. Older aliases that pointed at `from` follow it; renaming back undoes the loop. */
export function addAlias(aliases: Aliases, from: string, to: string): Aliases {
  const out: Aliases = {}
  for (const [k, v] of Object.entries(aliases)) out[k] = v.toLowerCase() === from.toLowerCase() ? to : v
  if (from.toLowerCase() !== to.toLowerCase()) out[from.toLowerCase()] = to
  delete out[to.toLowerCase()] // the current name never aliases anything
  return out
}

/** A routine's text with lines for exercise `from` naming `to` instead. Only lines whose exercise is exactly `from`. */
export function rewriteRoutine(body: string, from: string, to: string): string {
  return body.split('\n').map(line => {
    const p = parseLine(line)
    if (!p || p.name.toLowerCase() !== from.toLowerCase()) return line
    const i = line.toLowerCase().indexOf(p.name.toLowerCase())
    return i < 0 ? line : line.slice(0, i) + to + line.slice(i + p.name.length)
  }).join('\n')
}
