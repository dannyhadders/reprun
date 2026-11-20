import type { WorkoutSet } from '../../shared/types.ts'
import { fromKg, num, setText, unitOf } from './format.ts'
import { livePbHit, PB_METRIC, type ExerciseSession, type PbKind } from './stats.ts'

/** What the PB moment (components/PbMoment.tsx) shows, and which of its four looks plays. Kept apart so scripts/check-plan.ts can test it. */
export type PbShow = { name: string; set: string; kind: PbKind; was: string; up: string; from: number; to: number; unit: 'kg' | 'lb' | 'reps'; series: number[] }
export type PbStyle = 'A' | 'B' | 'C' | 'D'

export const LABEL: Record<PbKind, string> = { weight: 'Weight PB', e1rm: '1RM PB', reps: 'Rep PB' }
const amount = (v: number, unit: PbShow['unit']) => (unit === 'reps' ? `${num(v)} rep${v === 1 ? '' : 's'}` : `${num(v, 1)} ${unit}`)

/** One exercise's PB in this workout against what came before, or null. `history` must not include this workout yet. */
export function pbShow(name: string, history: ExerciseSession[], sets: Pick<WorkoutSet, 'weight_kg' | 'reps'>[]): PbShow | null {
  const hit = livePbHit(history, sets.map(s => ({ ...s, done: true })))
  if (!hit) return null
  const unit = hit.kind === 'reps' ? 'reps' : unitOf(name)
  const f = (s: WorkoutSet) => (unit === 'reps' ? PB_METRIC[hit.kind](s) : fromKg(PB_METRIC[hit.kind](s), unit)) // shown in lb for an exercise in lb
  const round = (v: number) => Math.round(v * 2) / 2 // e1rm comes out as 81.66…; half kilos read fine
  const [from, to] = [round(unit === 'reps' ? hit.before : fromKg(hit.before, unit)), round(unit === 'reps' ? hit.now : fromKg(hit.now, unit))]
  return {
    name, set: setText({ ...sets[hit.at], seconds: null }, name), kind: hit.kind, from, to, unit,
    was: hit.kind === 'e1rm' ? `Best estimated 1RM was ${amount(from, unit)}` : `Best was ${amount(from, unit)}`,
    up: `+${amount(Math.max(0.5, round(to - from)), unit)}`,
    series: [...history.map(h => Math.max(0, ...h.sets.map(f))).filter(v => v > 0), to].slice(-10),
  }
}

/** Which look plays: any but the last one, and not the roll-up for 3+ PBs (about 3 s each). */
export function pickStyle(n: number, last: string | null, r = Math.random()): PbStyle {
  const all: PbStyle[] = n <= 2 ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'D']
  const pool = all.filter(s => s !== last)
  return pool[Math.floor(r * pool.length)] ?? 'A'
}
