import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { num } from '../lib/format'
import { LABEL, pickStyle, type PbShow } from '../lib/pbMoment'

/**
 * The PB moment: a full-screen celebration over the finish screen when a workout set PBs. Four looks take turns at
 * random (never the same twice running) so it stays a treat: A trophy spotlight, B a card per PB, C the number rolls
 * up, D a sheet from the bottom. Mockups: brand book, Motion.
 */
const KEY = 'reprun-pb-style'
const lastStyle = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const ease = 'cubic-bezier(0.2,0.9,0.3,1)'
const anim = (name: string, s: number, delay = 0): CSSProperties => ({ animation: `${name} ${s}s ${ease} ${delay}s both` })

export function PbMoment({ pbs, close }: { pbs: PbShow[]; close: () => void }) {
  const [style] = useState(() => {
    const s = pickStyle(pbs.length, lastStyle())
    try { localStorage.setItem(KEY, s) } catch { /* private mode: it just might repeat */ }
    return s
  })
  const [i, setI] = useState(0) // B and C: which PB is showing
  const box = useRef<HTMLDivElement>(null)
  const n = pbs.length
  const title = `${n} new PB${n === 1 ? '' : 's'}`
  // Tap moves on: B and C step through the PBs, then everything closes.
  const next = () => ((style === 'B' || style === 'C') && i < n - 1 ? setI(i + 1) : close())

  useEffect(() => {
    box.current?.focus()
    navigator.vibrate?.([20, 60, 20, 60, 40])
  }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [close])
  // Plays itself through: A after 5 s, B a card every 3 s, C a PB every 3.2 s. D waits for "Nice".
  // Not keyed on `next`: the finish screen behind re-renders every frame while its numbers count up, which would restart it.
  useEffect(() => {
    if (style === 'D') return
    const t = setTimeout(() => ((style === 'B' || style === 'C') && i < n - 1 ? setI(i + 1) : close()), style === 'A' ? 5000 : style === 'B' ? 3000 : 3200)
    return () => clearTimeout(t)
  }, [i, style, n, close])

  return (
    <div ref={box} tabIndex={-1} role="dialog" aria-modal aria-label={title} onClick={next}
      className={`fixed inset-0 z-[60] cursor-pointer text-left outline-none ${style === 'D' ? 'bg-black/55' : 'bg-bg'} animate-fade-in`}>
      <Confetti mode={style === 'A' ? 'burst' : style === 'C' ? 'cannons' : 'rain'} key={style === 'C' ? i : 0} />
      {style === 'A' && (
        <div className="mx-auto grid h-full max-w-md content-center justify-items-center gap-4 px-6 text-center" style={{ background: 'radial-gradient(80% 50% at 50% 38%, rgb(251 191 36 / 0.24), transparent 70%)' }}>
          <div className="text-[110px] leading-none [filter:drop-shadow(0_10px_40px_rgb(251_191_36/0.55))]" style={anim('pbm-cup', 0.9)}>🏆</div>
          <h2 className="text-4xl font-extrabold tracking-tight text-pb" style={anim('pbm-rise', 0.5, 0.35)}>{title}</h2>
          <ul className="grid w-full gap-2">{pbs.map((p, k) => <Row key={p.name} p={p} style={anim('pbm-rise', 0.5, 0.5 + k * 0.12)} />)}</ul>
          <p className="text-sm text-muted">Tap to carry on</p>
        </div>
      )}
      {style === 'B' && (
        <div className="mx-auto grid h-full max-w-md content-center justify-items-center gap-5 px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-pb">PB {i + 1} of {n}</p>
          <Card key={i} p={pbs[i]} />
          {n > 1 && <div className="flex gap-1.5">{pbs.map((_, k) => <i key={k} className={`size-2 rounded-full ${k === i ? 'bg-pb' : 'bg-line'}`} />)}</div>}
          <p className="text-sm text-muted">{i < n - 1 ? 'Tap for the next one' : 'Tap to carry on'}</p>
        </div>
      )}
      {style === 'C' && <Roll key={i} p={pbs[i]} />}
      {style === 'D' && (
        <div className="absolute inset-x-0 bottom-0 mx-auto grid max-w-xl animate-sheet-in gap-3 rounded-t-3xl border-t border-pb/50 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-30px_60px_-20px_rgb(251_191_36/0.25)]" onClick={e => e.stopPropagation()}>
          <span className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-line" />
          <div className="flex items-center gap-3">
            <span className="text-4xl" style={anim('pbm-cup', 0.8, 0.2)}>🏆</span>
            <div><h2 className="text-xl font-bold">{title}</h2><p className="text-xs text-muted">Your best ever on {n === 1 ? 'this' : 'these'}:</p></div>
          </div>
          <ul className="grid gap-2">{pbs.map((p, k) => <Row key={p.name} p={p} style={anim('pbm-rise', 0.45, 0.35 + k * 0.12)} />)}</ul>
          <button className="btn mt-1 w-full py-3" onClick={close}>Nice</button>
        </div>
      )}
    </div>
  )
}

function Row({ p, style }: { p: PbShow; style: CSSProperties }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-pb/35 bg-surface px-4 py-2.5 text-left" style={style}>
      <span className="min-w-0 flex-1"><b className="block truncate">{p.name} {p.set}</b><span className="block truncate text-xs text-muted">{p.was}</span></span>
      <span className="shrink-0 text-sm font-bold text-good">{p.up}</span>
    </li>
  )
}

/** B: a gold card, the new number big and a line of that lift over time. */
function Card({ p }: { p: PbShow }) {
  const lo = Math.min(...p.series), hi = Math.max(...p.series)
  const pts = p.series.map((v, k) => [p.series.length > 1 ? (k / (p.series.length - 1)) * 256 : 128, 62 - ((v - lo) / (hi - lo || 1)) * 54])
  return (
    <div className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-pb/50 bg-[linear-gradient(160deg,#2b2410,#151208_60%)] p-5 shadow-[0_30px_70px_-20px_rgb(251_191_36/0.35)]" style={anim('pbm-card', 0.7)}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.18)_45%,transparent_60%)]" style={{ animation: 'pbm-shine 1.4s ease-in-out 0.6s both' }} />
      <div className="flex items-center justify-between"><span className="rounded-full bg-pb/15 px-2 py-0.5 text-[11px] font-bold text-pb">🏆 {LABEL[p.kind]}</span><span className="font-bold text-good">{p.up}</span></div>
      <p className="mt-3 text-2xl font-extrabold tracking-tight">{p.name}</p>
      <p className="text-xs text-muted">{p.was}</p>
      <p className="bg-[linear-gradient(135deg,#fde68a,#fbbf24_45%,#d97706)] bg-clip-text text-5xl font-extrabold leading-tight tracking-tighter text-transparent">{p.set}</p>
      {p.series.length > 1 && (
        <svg viewBox="0 0 256 70" className="mt-3 h-16 w-full" aria-hidden>
          <polyline points={pts.map(q => q.join(',')).join(' ')} fill="none" stroke="var(--color-pb)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={6} fill="var(--color-pb)" />
        </svg>
      )}
    </div>
  )
}

/** C: the old best counts up to the new one, then a gold stamp lands. */
function Roll({ p }: { p: PbShow }) {
  const [v, setV] = useState(p.from)
  const [done, setDone] = useState(false)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + 450
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 1100)), e = 1 - (1 - k) ** 3
      setV(p.from + (p.to - p.from) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else setDone(true)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [p])
  const shown = p.unit === 'kg' ? num(Math.round(v * 2) / 2, 1) : num(Math.round(v))
  return (
    <div className="grid h-full content-center justify-items-center gap-3 px-6 text-center" style={{ background: 'radial-gradient(70% 45% at 50% 45%, rgb(129 140 248 / 0.25), transparent 70%)' }}>
      <p className="text-xl font-bold" style={anim('pbm-rise', 0.4)}>{p.name}</p>
      <p className={`flex items-end text-[84px] font-extrabold leading-none tracking-tighter tabular-nums transition-[color,text-shadow] duration-300 ${done ? 'text-pb [text-shadow:0_0_40px_rgb(251_191_36/0.5)]' : ''}`}>
        {shown}<span className="mb-2 ml-1.5 text-3xl tracking-tight text-muted">{p.unit}</span>
      </p>
      <span className={`rounded-lg bg-[linear-gradient(135deg,#fde68a,#fbbf24_45%,#d97706)] px-3.5 py-1.5 text-sm font-extrabold tracking-[0.2em] text-bg ${done ? '' : 'opacity-0'}`} style={done ? { animation: `pbm-stamp 0.45s ${ease} both` } : undefined}>{LABEL[p.kind].toUpperCase()}</span>
      <p className="text-sm text-muted">{p.was} · <b className="text-good">{p.up}</b></p>
      <p className="mt-6 text-sm text-muted">Tap to {done ? 'carry on' : 'skip'}</p>
    </div>
  )
}

/** Confetti on a canvas the size of the screen: a burst from the middle, rain from the top, or cannons from the bottom corners. */
function Confetti({ mode }: { mode: 'burst' | 'rain' | 'cannons' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, x = c.getContext('2d')
    if (!x) return
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight
    c.width = W * dpr; c.height = H * dpr; x.scale(dpr, dpr)
    const cols = ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#e8eaf0']
    const base = () => ({ r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, s: 4 + Math.random() * 5, c: cols[Math.floor(Math.random() * 5)] })
    const ps = mode === 'rain' ? Array.from({ length: 120 }, () => ({ ...base(), x: Math.random() * W, y: -Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 3, g: 0.03 }))
      : mode === 'cannons' ? Array.from({ length: 160 }, (_, k) => ({ ...base(), x: k % 2 ? W : 0, y: H, vx: (k % 2 ? -1 : 1) * (4 + Math.random() * 7), vy: -(H / 60 + Math.random() * 10), g: 0.36 }))
      : Array.from({ length: 140 }, () => ({ ...base(), x: W / 2, y: H * 0.32, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 4, g: 0.38 }))
    let f = 0, raf = 0
    const frame = () => {
      x.clearRect(0, 0, W, H)
      for (const p of ps) {
        p.vy += p.g; p.vx *= 0.99; p.x += p.vx + (mode === 'rain' ? Math.sin((f + p.r * 40) / 18) * 0.6 : 0); p.y += p.vy; p.r += p.vr
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore()
      }
      if (++f < (mode === 'rain' ? 320 : 220)) raf = requestAnimationFrame(frame)
      else x.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mode])
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-10 h-full w-full" />
}
