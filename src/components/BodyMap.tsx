import type { ReactNode } from 'react'
import type { Muscle } from '../../shared/types'
import { MUSCLES } from '../lib/stats'

type Group = Exclude<Muscle, 'other'>
type Counts = Record<Group, number>

// Left half of each view (x < 50); everything is mirrored to draw the right half.
const base = (
  <>
    <rect x="46" y="21" width="8" height="8" rx="2" />
    <rect x="35" y="29" width="15" height="62" rx="6" />
    <rect x="22" y="33" width="11" height="34" rx="5" />
    <rect x="19" y="66" width="10" height="30" rx="5" />
    <circle cx="23.5" cy="101" r="4.5" />
    <rect x="36" y="88" width="13.5" height="50" rx="6" />
    <rect x="37" y="137" width="11" height="45" rx="5" />
    <ellipse cx="42" cy="186" rx="6" ry="3.5" />
  </>
)

const FRONT: Partial<Record<Group, ReactNode>> = {
  shoulders: <ellipse cx="30.5" cy="36" rx="6" ry="6.5" />,
  chest: <path d="M49.5,33 L38,34 Q35,42 38,49 Q44,52 49.5,50 Z" />,
  arms: <><ellipse cx="27.5" cy="53" rx="4.3" ry="9" /><ellipse cx="24" cy="79" rx="3.8" ry="10" /></>,
  core: <><rect x="43" y="54" width="6.5" height="32" rx="3" /><path d="M41.5,56 Q38.5,70 41.5,86 L42,86 L42,56 Z" /></>,
  legs: <><ellipse cx="42.5" cy="112" rx="5.5" ry="19" /><ellipse cx="42" cy="155" rx="4" ry="13" /></>,
}

const BACK: Partial<Record<Group, ReactNode>> = {
  shoulders: <ellipse cx="30.5" cy="37" rx="6" ry="6.5" />,
  back: <><path d="M50,23 L42,28.5 L38.5,33 L50,45 Z" /><path d="M49.5,44 L37,38 Q36,55 42,70 L49.5,72 Z" /><rect x="44" y="73" width="5.5" height="13" rx="2.5" /></>,
  arms: <><ellipse cx="27.5" cy="53" rx="4.3" ry="9" /><ellipse cx="24" cy="79" rx="3.8" ry="10" /></>,
  legs: <><ellipse cx="43" cy="97" rx="6.5" ry="8" /><ellipse cx="42.5" cy="121" rx="5.5" ry="14" /><ellipse cx="42" cy="152" rx="5" ry="13" /></>,
}

const label = (g: string) => g[0].toUpperCase() + g.slice(1)
// Solid mixes (not opacity) so the mirrored halves overlapping at the centre line don't double up.
const shade = (n: number, max: number) =>
  n ? `color-mix(in srgb, var(--color-accent-2) ${Math.round(25 + 75 * (n / max))}%, var(--color-surface-2))` : 'var(--color-surface-2)'

function Figure({ x, muscles, now, max }: { x: number; muscles: Partial<Record<Group, ReactNode>>; now: Counts; max: number }) {
  const half = (
    <>
      <g fill="var(--color-bg)">{base}</g>
      {(Object.entries(muscles) as [Group, ReactNode][]).map(([g, shape]) => (
        <g key={g} fill={shade(now[g], max)}><title>{`${label(g)}: ${now[g]} sets`}</title>{shape}</g>
      ))}
    </>
  )
  return (
    <g transform={`translate(${x} 0)`}>
      <circle cx="50" cy="12" r="9" fill="var(--color-bg)" />
      {half}
      <g transform="matrix(-1 0 0 1 100 0)">{half}</g>
    </g>
  )
}

export function BodyMap({ now, before }: { now: Counts; before: Counts }) {
  const max = Math.max(1, ...MUSCLES.map(m => now[m]))
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="w-full max-w-[260px]">
        <svg viewBox="0 0 210 192" role="img" aria-label="Sets per muscle group, front and back" className="w-full">
          <Figure x={0} muscles={FRONT} now={now} max={max} />
          <Figure x={110} muscles={BACK} now={now} max={max} />
        </svg>
        <div className="mt-1 grid grid-cols-2 text-center text-[11px] uppercase tracking-wider text-muted"><span>Front</span><span>Back</span></div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1">
        {MUSCLES.map(m => {
          const d = now[m] - before[m]
          return (
            <li key={m} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-line" style={{ background: shade(now[m], max) }} />
              <span className="flex-1">{label(m)}</span>
              <span className="tabular-nums font-semibold">{now[m]}</span>
              <span className={`w-8 text-right text-xs tabular-nums ${d > 0 ? 'text-good' : d < 0 ? 'text-bad' : 'text-muted'}`}>{d > 0 ? `+${d}` : d || '–'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
