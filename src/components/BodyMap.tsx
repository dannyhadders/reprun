import { useId } from 'react'
import type { Muscle } from '../../shared/types'
import { MUSCLES } from '../lib/stats'
import { BACK_SHAPES, FRONT_SHAPES } from './bodyShapes'

type Group = Exclude<Muscle, 'other'>
type Counts = Record<Group, number>

// Each muscle in the drawing → our six groups. Head, neck and knees aren't in here: they stay grey.
const GROUP: Record<string, Group> = {
  chest: 'chest', abs: 'core', obliques: 'core', front_deltoids: 'shoulders', back_deltoids: 'shoulders',
  biceps: 'arms', triceps: 'arms', forearm: 'arms', trapezius: 'back', upper_back: 'back', lower_back: 'back',
  quadriceps: 'legs', abductors: 'legs', abductor: 'legs', hamstring: 'legs', gluteal: 'legs', calves: 'legs', left_soleus: 'legs', right_soleus: 'legs',
}

const label = (g: string) => g[0].toUpperCase() + g.slice(1)
// Indigo for a few sets through to cyan for the most; untrained muscles stay surface-2.
const heat = (n: number, max: number) => (n ? `color-mix(in srgb, var(--color-accent-2) ${Math.round((100 * n) / max)}%, var(--color-accent))` : 'var(--color-surface-2)')

function Figure({ shapes, side, now, max }: { shapes: [string, string[]][]; side: string; now: Counts; max: number }) {
  const glow = useId()
  return (
    <figure className="flex w-full flex-col items-center gap-1">
      <svg viewBox="0 0 100 200" role="img" aria-label={`${side}: muscles shaded by sets`} className="w-full max-w-[150px]">
        <defs>
          <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {shapes.map(([m, polys]) => {
          const g = GROUP[m]
          if (!g) return polys.map(p => <polygon key={p} points={p} fill="var(--color-line)" />)
          return (
            <g key={m} fill={heat(now[g], max)} stroke="var(--color-surface)" strokeWidth="0.8" strokeLinejoin="round" filter={now[g] / max > 0.6 ? `url(#${glow})` : undefined}>
              <title>{`${label(g)}: ${now[g]} sets`}</title>
              {polys.map(p => <polygon key={p} points={p} />)}
            </g>
          )
        })}
      </svg>
      <figcaption className="text-[11px] uppercase tracking-wider text-muted">{side}</figcaption>
    </figure>
  )
}

export function BodyMap({ now, before }: { now: Counts; before: Counts }) {
  const max = Math.max(1, ...MUSCLES.map(m => now[m]))
  return (
    // Stacked at every width: on a laptop the card is a narrow column.
    <div className="flex flex-col items-center gap-5">
      <div className="grid w-full max-w-[320px] grid-cols-2 gap-2">
        <Figure shapes={FRONT_SHAPES} side="Front" now={now} max={max} />
        <Figure shapes={BACK_SHAPES} side="Back" now={now} max={max} />
      </div>
      {/* Most-trained first; the bar is this period's sets, the number after it the change on the period before. */}
      <ul className="flex w-full flex-col gap-2.5 text-sm">
        {[...MUSCLES].sort((a, b) => now[b] - now[a]).map(m => {
          const d = now[m] - before[m]
          return (
            <li key={m} className="grid grid-cols-[5.5rem_1fr_1.75rem_2rem] items-center gap-2.5">
              <span>{label(m)}</span>
              <span className="h-2 overflow-hidden rounded bg-surface-2">
                <span className="block h-full rounded bg-linear-to-r from-accent to-accent-2" style={{ width: `${Math.round((100 * now[m]) / max)}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{now[m]}</span>
              <span className={`text-right text-xs tabular-nums ${d > 0 ? 'text-good' : d < 0 ? 'text-bad' : 'text-muted'}`}>{d > 0 ? `+${d}` : d || '–'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
