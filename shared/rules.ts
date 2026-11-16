// Input checks that the Worker and the phone-only copy (src/lib/local.ts) both apply.
import type { Routine } from './types.ts'

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
