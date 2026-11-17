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
  ({ age: num(b.age), sex: b.sex === 'female' ? 'female' : 'male', weight_kg: num(b.weight_kg), goals: cleanGoals(b.goals) })
