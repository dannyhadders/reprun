import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tap } from '../lib/haptic'
import { cardFile, shareFile, type CardWorkout } from '../lib/share'

export const Icon = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
)
export const COPY = 'M9 3h6v3H9zM9 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H15'
export const CHECK = 'M5 12.5 10 17.5 19 7'

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

export function Tabs<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: readonly T[] | { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
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

const SHARE = 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'
/**
 * Shares a workout as a picture. The picture is drawn when the button appears (and again if its inputs change), because
 * iOS only lets navigator.share run straight off a tap, not after the awaits that drawing takes. Spinner until it's ready.
 */
export function ShareButton({ w, pbs, line, label = 'Share', className = 'btn-ghost' }: { w: CardWorkout; pbs: string[]; line?: string; label?: string; className?: string }) {
  // The file to share, and a URL of it for the preview, revoked when a newer picture replaces it or the button goes.
  const [made, setMade] = useState<{ card: File; url: string } | null>(null)
  useEffect(() => {
    let live = true // a slower, older render (before the PBs arrived) mustn't win
    let url = ''
    void cardFile(w, pbs, line).then(f => live && setMade({ card: f, url: (url = URL.createObjectURL(f)) }), () => live && setMade(null))
    return () => void ((live = false), url && URL.revokeObjectURL(url))
  }, [w, pbs, line])
  const card = made?.card ?? null, url = made?.url
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const share = () => card && shareFile(card, `${w.title || 'Workout'} · RepRun`).catch(e => alert(e instanceof Error ? e.message : String(e)))
  const canShare = !!card && !!navigator.canShare?.({ files: [card] })
  return (
    <>
      <button type="button" className={`${className} ${card ? '' : 'busy'}`} disabled={!card} aria-busy={!card} onClick={() => setOpen(true)}>
        <Icon d={SHARE} className="h-4 w-4" />{label}
      </button>
      {/* Like Strava: see the picture first, then share it. The file is already made, so Share still runs straight off the tap (iOS). */}
      {open && url && (
        <Sheet close={close} label="Share picture">
          <img src={url} alt={`${w.title || 'Workout'} as a picture`} className="mx-auto max-h-[60dvh] w-auto rounded-xl border border-line" />
          <p className="mt-3 text-center text-xs text-muted">{canShare ? 'Press and hold the picture to save it to Photos.' : 'Saves as a PNG file.'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={close}>Close</button>
            <button type="button" className="btn relative min-h-11" onClick={() => void share()}>
              <Tap /><Icon d={SHARE} className="h-4 w-4" />{canShare ? 'Share' : 'Download'}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

/**
 * iOS-style sheet from the bottom: dimmed backdrop, tap outside or drag the handle area down past 80px to close.
 * Styles set directly while dragging, so no re-render per touchmove. Only a drag that starts at the top of the
 * sheet's scroll closes it, so scrolling a long sheet back up doesn't.
 */
export function Sheet({ close, children, className = '', label }: { close: () => void; children: ReactNode; className?: string; label?: string }) {
  const drag = useRef<{ y: number; dy: number } | null>(null)
  // Opened by a press and hold, the finger is still down: iOS's click on release would land on the backdrop and shut it.
  const [opened] = useState(Date.now)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [close])
  return (
    <div className="fixed inset-0 z-50 animate-fade-in bg-black/55" onClick={() => Date.now() - opened > 400 && close()}>
      <div role="dialog" aria-modal aria-label={label}
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl animate-sheet-in overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 ${className}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => void (drag.current = e.currentTarget.scrollTop > 0 ? null : { y: e.touches[0].clientY, dy: 0 })}
        onTouchMove={e => {
          if (!drag.current) return
          drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y)
          e.currentTarget.style.transition = 'none'
          e.currentTarget.style.transform = `translateY(${drag.current.dy}px)`
        }}
        onTouchEnd={e => {
          const el = e.currentTarget
          if ((drag.current?.dy ?? 0) > 80) close()
          else {
            el.style.transition = 'transform 0.2s ease-out'
            el.style.transform = ''
          }
          drag.current = null
        }}>
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        {children}
      </div>
    </div>
  )
}

/**
 * A styled stand-in for confirm(). Native <dialog>, so Escape, focus and the dimmed backdrop come
 * free; built with plain DOM so any handler can await it without a provider. Cancel is focused first.
 */
export function ask(message: string, ok = 'OK', danger = false, cancel = 'Cancel'): Promise<boolean> {
  const d = document.createElement('dialog')
  d.className = 'm-auto w-[min(24rem,calc(100vw-2rem))] animate-toast-in rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/60'
  const p = document.createElement('p')
  p.className = 'whitespace-pre-line text-[15px] leading-relaxed'
  p.textContent = message
  const row = document.createElement('div')
  row.className = 'mt-5 grid grid-cols-2 gap-2'
  for (const [label, cls, value] of [[cancel, 'btn-ghost', ''], [ok, danger ? 'btn-danger' : 'btn', 'ok']]) {
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
