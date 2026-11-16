import { useState, type ReactNode } from 'react'

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
          className={`whitespace-nowrap rounded-lg font-medium transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${o.value === value ? 'bg-accent text-white shadow' : 'text-muted hover:text-ink'}`}
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
  return <button type="button" className={className} onClick={() => void copy()}>{state === 'done' ? 'Copied ✓' : state === 'failed' ? "Couldn't copy" : label}</button>
}
