// The plate calculator in the logger: a quiet line under the set you're on ("25 + 15 each side · 20 kg bar") for
// barbell lifts, and a sheet with the bar drawn and a choice of bar when you tap it. Maths in shared/plates.ts.
import { useState } from 'react'
import { BARS, load, PLATES } from '../../shared/plates'
import type { Unit } from '../lib/format'
import { Tap } from '../lib/haptic'
import { barOf, rememberBar } from '../lib/session'
import { Sheet } from './ui'

const num = (n: number) => String(Math.round(n * 100) / 100)
const barIn = (name: string, u: Unit) => BARS[u].find(b => b.id === barOf(name)) ?? BARS[u][0]
// Plate colours and heights by size, heaviest first: brand tokens, roughly the gym's own (red 25, blue 20, yellow 15, green 10).
const LOOK = ['bg-bad', 'bg-accent', 'bg-pb', 'bg-good', 'bg-ink', 'bg-muted', 'bg-muted']
const look = (p: number, u: Unit) => { const i = PLATES[u].indexOf(p); return { cls: LOOK[i] ?? 'bg-muted', h: 100 - i * 12 } }

function words(total: number, name: string, u: Unit) {
  const bar = barIn(name, u), l = load(total, bar.weight, PLATES[u])
  if (!l) return { bar, l, text: total < bar.weight ? `Less than the ${bar.label} bar` : 'Too heavy to work out' }
  if (!l.exact) return { bar, l, text: `${num(total)} can't be loaded exactly: ${num(l.lower!)} or ${num(l.higher!)}` }
  return { bar, l, text: l.side.length ? `${l.side.map(num).join(' + ')} each side` : 'Just the bar' }
}

/** Under the set you're on: what to put on each side. Tap for the bar and a picture. Nothing without a weight. */
export function PlateLine({ total, name, u, open }: { total: number; name: string; u: Unit; open: () => void }) {
  if (!(total > 0)) return null
  const { bar, l, text } = words(total, name, u)
  return (
    <button type="button" className="press relative col-span-4 -mt-1 flex min-h-9 items-center gap-2 rounded-xl px-1 text-left text-xs text-muted active:bg-surface-2"
      aria-label={`Plates for ${num(total)} ${u}: ${text}, ${bar.label} bar. Change the bar`} onClick={open}>
      <Tap />
      <span className="flex items-center gap-0.5" aria-hidden>{l?.exact && l.side.map((p, k) => <i key={k} className={`w-1 rounded-sm ${look(p, u).cls}`} style={{ height: `${look(p, u).h / 6}px` }} />)}</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <span className="shrink-0">{bar.label} bar</span>
    </button>
  )
}

/** The bar drawn with its plates, and which bar it is (remembered for this exercise). */
export function PlateSheet({ total, name, u, close }: { total: number; name: string; u: Unit; close: () => void }) {
  const [, redraw] = useState(0)
  const { bar, l, text } = words(total, name, u)
  const side = l?.exact ? l.side : []
  const plates = (s: number[]) => s.map((p, k) => <i key={k} className={`grid w-5 place-items-center rounded-[3px] text-[9px] font-extrabold not-italic text-bg ${look(p, u).cls}`} style={{ height: `${look(p, u).h}px` }}>{num(p)}</i>)
  return (
    <Sheet close={close} label={`Plates for ${name}`}>
      <h2 className="text-2xl font-extrabold tabular-nums">{num(total)} {u}</h2>
      <p className="mb-4 text-sm text-muted">{name} · <b className="text-ink">{text}</b></p>
      <div role="img" aria-label={`${bar.label} bar${side.length ? ` with ${side.map(num).join(', ')} on each side` : ''}`} className="mb-5 flex h-28 items-center justify-center gap-0.5">
        <i className="h-2.5 w-4 rounded-sm bg-muted" />{plates([...side].reverse())}<i className="h-5 w-2 bg-muted" />
        <i className="h-2 w-28 bg-muted" />
        <i className="h-5 w-2 bg-muted" />{plates(side)}<i className="h-2.5 w-4 rounded-sm bg-muted" />
      </div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Bar</p>
      <div className="grid grid-cols-2 gap-2">
        {BARS[u].map(b => (
          <button key={b.id} type="button" aria-pressed={b.id === bar.id} onClick={() => (rememberBar(name, b.id), redraw(n => n + 1))}
            className={`press relative h-11 rounded-xl border text-sm font-semibold ${b.id === bar.id ? 'border-accent bg-accent-deep text-white' : 'border-line bg-surface-2'}`}>
            <Tap />{b.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Remembered for {name}. The weight you log includes the bar.</p>
    </Sheet>
  )
}
