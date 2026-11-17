import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

export const Icon = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
)
const COPY = 'M9 3h6v3H9zM9 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H15'
const CHECK = 'M5 12.5 10 17.5 19 7'

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ value, label, sub, accent }: { value: ReactNode; label: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`truncate text-2xl font-bold tracking-tight tabular-nums ${accent ? 'grad-text' : ''}`}>{value}</div>
      <div className="text-sm text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted/80">{sub}</div>}
    </div>
  )
}

const SOURCES: Record<string, { label: string; cls: string; title: string }> = {
  strava: { label: 'Strava', cls: 'bg-strava/15 text-strava', title: 'Synced from Strava' },
  sample: { label: 'Strava · sample', cls: 'bg-strava/10 text-strava/80 border border-dashed border-strava/40', title: 'Generated sample data shaped like a Strava import. Remove it in Settings.' },
  sheet: { label: 'Spreadsheet', cls: 'bg-good/15 text-good', title: 'Imported from a training spreadsheet' },
  manual: { label: 'Manual', cls: 'bg-accent/15 text-accent', title: 'Added in RepRun' },
  app: { label: 'App', cls: 'bg-accent-2/15 text-accent-2', title: 'Logged in the RepRun app' },
  demo: { label: 'Demo', cls: 'bg-line text-muted', title: 'Made-up demo data' },
  estimate: { label: 'est.', cls: 'bg-line text-muted', title: 'Estimated from the number of sets' },
}

export function SourceBadge({ source, sample }: { source: string; sample?: number | boolean }) {
  const s = SOURCES[sample ? 'sample' : source] ?? { label: source, cls: 'bg-line text-muted', title: source }
  return <span title={s.title} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
}

export function PbBadge({ kinds }: { kinds?: string[] }) {
  if (!kinds?.length) return null
  const label = kinds.includes('weight') ? 'PB' : kinds.includes('reps') ? 'Rep PB' : '1RM PB'
  return <span className="rounded-full bg-pb/15 px-1.5 py-0.5 text-[10px] font-bold text-pb">🏆 {label}</span>
}

export function Tabs<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-surface-2 p-1">
      {opts.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`press whitespace-nowrap rounded-lg font-medium ${size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-3.5 text-sm'} ${o.value === value ? 'bg-accent text-white shadow' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Line({ children }: { children: ReactNode }) {
  return <p className="flex gap-2 text-sm leading-snug text-ink/90"><span aria-hidden>✨</span><span>{children}</span></p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>
}

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

/** Copies text to the clipboard and says so for a moment. */
export function CopyButton({ text, label = 'Copy', className = 'btn-ghost' }: { text: () => string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = () => navigator.clipboard.writeText(text()).then(() => 'done' as const, () => 'failed' as const).then(r => {
    setState(r)
    setTimeout(() => setState('idle'), 2000)
  })
  return (
    <button type="button" className={className} onClick={() => void copy()}>
      <Icon d={state === 'done' ? CHECK : COPY} className={`h-4 w-4 ${state === 'done' ? 'animate-pop text-good' : ''}`} />
      {state === 'done' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
    </button>
  )
}

/**
 * A styled stand-in for confirm(). Native <dialog>, so Escape, focus and the dimmed backdrop come
 * free; built with plain DOM so any handler can await it without a provider. Cancel is focused first.
 */
export function ask(message: string, ok = 'OK', danger = false): Promise<boolean> {
  const d = document.createElement('dialog')
  d.className = 'm-auto w-[min(24rem,calc(100vw-2rem))] animate-toast-in rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/60'
  const p = document.createElement('p')
  p.className = 'whitespace-pre-line text-[15px] leading-relaxed'
  p.textContent = message
  const row = document.createElement('div')
  row.className = 'mt-5 grid grid-cols-2 gap-2'
  for (const [label, cls, value] of [['Cancel', 'btn-ghost', ''], [ok, danger ? 'btn-danger' : 'btn', 'ok']]) {
    const b = document.createElement('button')
    b.className = `${cls} min-h-11`
    b.textContent = label
    b.onclick = () => d.close(value)
    row.append(b)
  }
  d.append(p, row)
  document.body.append(d)
  d.showModal()
  return new Promise(resolve => d.addEventListener('close', () => (resolve(d.returnValue === 'ok'), d.remove()), { once: true }))
}

const COLOURS = ['var(--color-accent)', 'var(--color-accent-2)', 'var(--color-pb)', 'var(--color-good)']
/** Confetti-ish burst from the middle of the nearest `relative` parent. Plays once on mount; hidden under reduced motion. */
export function Burst({ n = 14, r = 56 }: { n?: number; r?: number }) {
  const [parts] = useState(() => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI + Math.random() * 0.4
    const dist = r * (0.6 + Math.random() * 0.5)
    return { '--dx': `${Math.cos(a) * dist}px`, '--dy': `${Math.sin(a) * dist}px`, background: COLOURS[i % COLOURS.length] } as CSSProperties
  }))
  return (
    <span aria-hidden className="burst pointer-events-none absolute left-1/2 top-1/2">
      {parts.map((style, i) => <span key={i} className="absolute -ml-[3px] -mt-[3px] size-1.5 rounded-full [animation:burst_0.7s_ease-out_forwards]" style={style} />)}
    </span>
  )
}

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** Counts up from 0 to `to` (ease-out), for totals on a finish screen. Straight to the number under reduced motion. */
export function useCountUp(to: number, ms = 700) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(to * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return still ? to : v
}
