// Input checks that the Worker and the phone-only copy (src/lib/local.ts) both apply.
import type { Profile, Routine } from './types.ts'

/** Empty → null, a number → that number, anything else → NaN (so callers can refuse it). */
export const num = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : NaN)
export const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const routineOk = (r: Partial<Routine>) =>
  typeof r.name === 'string' && !!r.name.trim() && r.name.length <= 100 && typeof r.body === 'string' && !!r.body.trim() && r.body.length <= 10_000
/** A set edit's numbers, or an error message. */
export function setNumbers(b: { weight_kg?: unknown; reps?: unknown; seconds?: unknown }): [number | null, number | null, number | null] | string {
  const v = [num(b.weight_kg), num(b.reps), num(b.seconds)]
  return v.some(x => Number.isNaN(x) || (x !== null && x < 0)) ? 'Weight, reps and seconds must be positive numbers' : (v as [number | null, number | null, number | null])
}

/** An effort rating from outside (upload, backup): a whole number 1-10, anything else none. */
export const rpe = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10 ? (v as number) : null)

/** What someone's training for, asked in onboarding (pick up to two) and kept on the profile for plans and prompts. */
export const GOALS = [
  { id: 'strength', label: 'Get stronger', emoji: '💪' },
  { id: 'muscle', label: 'Build muscle', emoji: '🏋️' },
  { id: 'lose', label: 'Lose weight', emoji: '⚖️' },
  { id: 'fitness', label: 'Get fitter', emoji: '❤️' },
  { id: 'running', label: 'Run further or faster', emoji: '🏃' },
  { id: 'consistent', label: 'Just stay consistent', emoji: '📅' },
] as const
export type GoalId = (typeof GOALS)[number]['id']
/** Known ids only, no repeats, at most two. */
export const cleanGoals = (v: unknown): GoalId[] =>
  Array.isArray(v) ? [...new Set(v.filter((g): g is GoalId => GOALS.some(x => x.id === g)))].slice(0, 2) : []
/** A profile from a request body, as both the Worker and the phone-only copy store it. */
export const cleanProfile = (b: Partial<Profile>): Profile =>
  ({ age: num(b.age), sex: b.sex === 'female' ? 'female' : 'male', weight_kg: num(b.weight_kg), goals: cleanGoals(b.goals), ...(Number.isInteger(b.weekly) && b.weekly! >= 1 && b.weekly! <= 7 ? { weekly: b.weekly } : {}),
    ...(b.unit === 'lb' && { unit: 'lb' as const }), ...cleanUnits(b.units), ...cleanSetup(b.setup), ...cleanFeatures(b.features) })
/**
 * A change to single keys of the profile's per-exercise maps (null removes one), made on top of what's stored. Unit
 * switches and setup notes only ever change this way, and a whole-profile PUT keeps what's stored for both (keepMaps),
 * so a screen holding an older copy of the profile can't undo a note or a switch saved meanwhile.
 */
export type ProfilePatch = { units?: Record<string, 'kg' | 'lb' | null>; setup?: Record<string, string | null>; features?: Record<string, boolean | null> }
export function patchProfile(p: Profile, b: ProfilePatch): Profile {
  const apply = <V>(m: Record<string, V> | undefined, ch: Record<string, V | null> | undefined) => {
    const out = { ...m }
    for (const [k, v] of Object.entries(ch && typeof ch === 'object' ? ch : {})) if (v === null) delete out[k]; else out[k] = v
    return out
  }
  return cleanProfile({ ...p, units: apply(p.units, b.units), setup: apply(p.setup, b.setup), features: apply(p.features, b.features) })
}
/** A whole-profile PUT: everything from the body except the per-exercise maps, which stay as stored. */
export const keepMaps = (b: Partial<Profile>, stored: Profile) => cleanProfile({ ...b, units: stored.units, setup: stored.setup, features: stored.features })
/** An exercise renamed or merged: its unit and setup note follow it to the new name (a merge keeps the target's own). */
export function renameInProfile(p: Profile, from: string, to: string): Profile {
  const f = from.toLowerCase(), t = to.toLowerCase()
  const move = <V>(m?: Record<string, V>) => {
    if (!m || f === t || !Object.hasOwn(m, f)) return m
    const out = { ...m }
    if (!Object.hasOwn(out, t)) out[t] = out[f]
    delete out[f]
    return out
  }
  return cleanProfile({ ...p, units: move(p.units), setup: move(p.setup) })
}
/** Setup notes ("seat 4, grip on the rings"): trimmed text, kept only when well formed, 300 characters and 300 exercises at most. */
const cleanSetup = (v: unknown): Pick<Profile, 'setup'> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const setup = Object.fromEntries(Object.entries(v).flatMap(([k, t]) => (k.length <= 100 && typeof t === 'string' && t.trim() ? [[k, t.trim().slice(0, 300)]] : [])).slice(0, 300))
  return Object.keys(setup).length ? { setup } : {}
}
// Feature switches: short ids, true or false. Unknown ids are kept, so an older app can't drop a newer one's switch.
const cleanFeatures = (v: unknown): Pick<Profile, 'features'> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const features = Object.fromEntries(Object.entries(v).filter(([k, on]) => /^[a-z][a-z0-9-]{0,39}$/.test(k) && typeof on === 'boolean').slice(0, 50))
  return Object.keys(features).length ? { features } : {}
}
/** Exercises switched to kg or lb (lower-case name → unit): kept only when well formed, at most 300. */
const cleanUnits = (v: unknown): Pick<Profile, 'units'> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const units = Object.fromEntries(Object.entries(v).filter(([k, u]) => k.length <= 100 && (u === 'kg' || u === 'lb')).slice(0, 300)) as Record<string, 'kg' | 'lb'>
  return Object.keys(units).length ? { units } : {}
}

/** A set's superset label as saved: "A1"…"H9", else nothing (an import can say anything). */
export const superset = (v: unknown) => (typeof v === 'string' && /^[A-H][1-9]$/.test(v) ? v : null)
