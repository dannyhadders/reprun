import type { Lift, Profile } from '../../shared/types.ts'

// ponytail: rough strength standards, not a dataset. Estimated 1RM as a multiple of body weight
// that men at roughly your body weight hit at the 5th / 20th / 50th / 80th / 95th percentile of
// people who lift (the Beginner -> Elite bands popularised by lifter-population sites).
// Not UK-specific and not age-adjusted (33 is close to peak anyway). Upgrade path: swap in a
// proper per-bodyweight, per-age table if this ever needs to be more than motivational.
const MALE: Record<Lift, number[]> = {
  bench: [0.55, 0.8, 1.15, 1.55, 2.0],
  squat: [0.75, 1.1, 1.5, 2.0, 2.55],
  deadlift: [0.9, 1.3, 1.75, 2.3, 2.9],
  ohp: [0.35, 0.5, 0.7, 0.95, 1.2],
}
// Women's bands are roughly 60-65% of men's for these lifts.
const FEMALE_FACTOR = 0.62
const PCTS = [5, 20, 50, 80, 95]
const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']

export const LIFT_NAMES: Record<Lift, string> = { bench: 'bench', squat: 'squat', deadlift: 'deadlift', ohp: 'overhead press' }

export type Standing = { pct: number; level: string; ratio: number; next: { level: string; kg: number } | null }

/** Estimated-1RM kg for each level (Beginner -> Elite) at this body weight, or null without one. */
export const levelKgs = (lift: Lift, profile: Pick<Profile, 'sex' | 'weight_kg'>) =>
  profile.weight_kg ? MALE[lift].map((r, i) => ({ level: LEVELS[i], kg: r * (profile.sex === 'female' ? FEMALE_FACTOR : 1) * profile.weight_kg! })) : null

export function standing(lift: Lift, oneRepMax: number, profile: Profile): Standing | null {
  if (!profile.weight_kg) return null
  const bands = MALE[lift].map(r => r * (profile.sex === 'female' ? FEMALE_FACTOR : 1))
  const ratio = oneRepMax / profile.weight_kg
  const pts: [number, number][] = [[0, 0], ...bands.map((r, i) => [r, PCTS[i]] as [number, number]), [bands[4] * 1.2, 99]]
  let pct = 99
  for (let i = 1; i < pts.length; i++) {
    if (ratio <= pts[i][0]) {
      const [r0, p0] = pts[i - 1]
      const [r1, p1] = pts[i]
      pct = p0 + ((ratio - r0) / (r1 - r0)) * (p1 - p0)
      break
    }
  }
  const reached = bands.filter(r => ratio >= r).length
  return {
    pct: Math.max(1, Math.min(99, Math.round(pct))),
    level: reached ? LEVELS[reached - 1] : 'Getting started',
    ratio,
    next: reached < 5 ? { level: LEVELS[reached], kg: Math.round(bands[reached] * profile.weight_kg) } : null,
  }
}
