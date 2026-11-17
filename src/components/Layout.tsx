import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, useData } from '../lib/data'
import { isSample, LOCAL, startLocal } from '../lib/local'
import { clock, plural, workoutText } from '../lib/format'
import { beep, loadActive, outbox, saveActive, totals, useNow } from '../lib/session'
import { ask, CopyButton, Icon } from './ui'
import { Tap } from '../lib/haptic'
import { AddWorkout } from './AddWorkout'

const I = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  workouts: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11',
  exercises: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  runs: 'M13 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 21l3-6 3 2v5M10 15l1-5 4 2 3-1M11 10 8 9l-3 3',
  year: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4M8 14h2M14 14h2M8 17h2',
  more: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
}
// Phone: four tabs around a big Start button; the rest live under More.
const TABS = ['/', '/workouts', '/runs']
const NAV = [
  { to: '/', label: 'Home', icon: I.home },
  { to: '/workouts', label: 'Workouts', icon: I.workouts },
  { to: '/exercises', label: 'Exercises', icon: I.exercises },
  { to: '/runs', label: 'Runs', icon: I.runs },
  { to: '/year', label: 'Year', icon: I.year },
  { to: '/settings', label: 'Settings', icon: I.settings },
]

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  // Drag the More sheet down to close it, like an iOS sheet. Styles set directly: no re-render per touchmove.
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const sheet = {
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void (drag.current = { y: e.touches[0].clientY, dy: 0 }),
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => {
      if (!drag.current) return
      drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y)
      e.currentTarget.style.transition = 'none'
      e.currentTarget.style.transform = `translateY(${drag.current.dy}px)`
    },
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      if ((drag.current?.dy ?? 0) > 80) setMore(false)
      else {
        el.style.transition = 'transform 0.2s ease-out'
        el.style.transform = ''
      }
      drag.current = null
    },
  }
  const { data, reload } = useData()
  const on = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  // Like Link: tapping where you already are doesn't stack another back-swipe.
  const go = (to: string) => navigate(to, { replace: pathname === to })
  const inMore = NAV.some(n => !TABS.includes(n.to) && on(n.to))
  const tab = (n: (typeof NAV)[number]) => (
    <button key={n.to} onClick={() => go(n.to)} aria-current={on(n.to) ? 'page' : undefined} className={`press relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${on(n.to) ? 'text-accent' : 'text-muted'}`}>
      <Tap />
      <Icon d={n.icon} />
      {n.label}
    </button>
  )
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-6 md:flex">
        <NavLink to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-tight">Rep<span className="grad-text">Run</span></span>
        </NavLink>
        <nav className="flex flex-col gap-1">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
            >
              {({ isActive }) => (<><Icon d={n.icon} className={`h-5 w-5 ${isActive ? 'text-accent' : ''}`} />{n.label}</>)}
            </NavLink>
          ))}
        </nav>
        <Link to="/log" className="btn mt-6 w-full">Start workout</Link>
        <AddWorkout className="btn-ghost mt-2 w-full" />
        <p className="mt-auto px-2 text-xs text-muted">Lift. Run. Repeat.</p>
      </aside>

      <main className={`mx-auto w-full max-w-6xl px-4 ${loadActive() ? 'pb-48' : 'pb-28'} pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-10`}>
        {data.demo && (
          <p className="mb-5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
            <b>Demo</b> with made-up data: click around, log a workout, break things. It all resets every night.{' '}
            <a className="font-semibold text-accent underline" href="https://reprun.danielhadaway.dev">Use it for real on your phone →</a>{' '}
            <a className="text-muted underline" href="https://github.com/dannyhadders/reprun">or host your own</a>
          </p>
        )}
        {LOCAL && isSample() && (
          <p className="mb-5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
            <b>Sample data</b> on this phone, made up so you can look around.{' '}
            <button className="font-semibold text-accent underline" onClick={async () => {
              if (!await ask('Clear the sample data, and anything you\'ve logged while trying it, and start with an empty RepRun?', 'Start fresh', true)) return
              await startLocal(false)
              await reload()
            }}>Start fresh →</button>
          </p>
        )}
        <Outbox className="mb-5" />
        {/* Keyed by path so each page fades in. ponytail: CSS, not view transitions: those need the data router, and this app uses <BrowserRouter>. */}
        <div key={pathname} className="animate-page-in"><Outlet /></div>
      </main>
      <Running />
      <PullToRefresh off={more} />
      <Uploaded />

      {more && (
        <div className="fixed inset-0 z-30 animate-fade-in bg-black/55 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 animate-sheet-in rounded-t-2xl border-t border-line bg-surface px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2.5" onClick={e => e.stopPropagation()} {...sheet}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            {NAV.filter(n => !TABS.includes(n.to)).map(n => (
              <button key={n.to} onClick={() => (go(n.to), setMore(false))} className="row-press relative flex w-full items-center gap-3 border-b border-line px-1 py-3.5 text-left text-[15px]">
                <Tap />
                <Icon d={n.icon} className="h-5 w-5 text-muted" />{n.label === 'Year' ? 'Year in review' : n.label}
              </button>
            ))}
            <AddWorkout className="row-press flex w-full items-center gap-3 px-1 py-3.5 text-left text-[15px] text-muted" />
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tab(NAV[0])}
        {tab(NAV[1])}
        <button onClick={() => go('/log')} aria-label="Start workout" className="press relative -mt-5 grid h-14 w-14 place-self-center place-items-center rounded-full border-4 border-bg text-white shadow-lg shadow-accent/40 grad-bg">
          <Tap />
          <Icon d={I.plus} className="h-6 w-6" />
        </button>
        {tab(NAV[3])}
        <button onClick={() => setMore(!more)} aria-expanded={more} className={`press relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${more || inMore ? 'text-accent' : 'text-muted'}`}>
          <Tap />
          <Icon d={I.more} />
          More
        </button>
      </nav>
    </div>
  )
}

/** A moment of "it's safe now" when waiting workouts reach the server, instead of the banner just vanishing. */
function Uploaded() {
  const { pending, upload } = useData()
  const prev = useRef(pending)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!LOCAL && prev.current > 0 && pending === 0 && !upload.error) setN(prev.current) // phone-only: nothing goes anywhere
    prev.current = pending
  }, [pending, upload.error])
  useEffect(() => {
    if (!n) return
    const t = setTimeout(() => setN(0), 3000)
    return () => clearTimeout(t)
  }, [n])
  if (!n) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4" role="status">
      <p className="flex animate-toast-in items-center gap-2 rounded-full border border-good/40 bg-surface px-4 py-2 text-sm font-medium shadow-lg">
        <Icon d="M5 12.5 10 17.5 19 7" className="h-4 w-4 text-good" />{plural(n, 'workout')} uploaded
      </p>
    </div>
  )
}

/**
 * Pull down at the top of a page to refresh: send anything waiting, sync Strava if it's connected, reload.
 * Window-level touch listeners, so pages need nothing; the native bounce is off (index.css) so the two don't fight.
 */
function PullToRefresh({ off }: { off: boolean }) {
  const { data, reload, sync } = useData()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const strava = data.strava.connected
  useEffect(() => {
    if (off || busy) return
    let y0: number | null = null, x0 = 0, d = 0
    // A list scrolled down inside the page (Settings' update log) is scrolling back up, not pulling.
    const inScrolled = (el: EventTarget | null) => {
      for (let n = el instanceof Element ? el : null; n; n = n.parentElement) if (n.scrollTop > 0) return true
      return false
    }
    const start = (e: TouchEvent) => {
      // Not over a dialog or the intro (its own screens swipe sideways and scroll).
      const overlay = !!document.querySelector('dialog[open]') || (e.target instanceof Element && !!e.target.closest('[role="dialog"]'))
      y0 = window.scrollY <= 0 && !overlay && !inScrolled(e.target) ? e.touches[0].clientY : null
      x0 = e.touches[0].clientX
      d = 0
    }
    const move = (e: TouchEvent) => {
      if (y0 === null) return
      const dy = e.touches[0].clientY - y0
      d = dy > 0 && dy > Math.abs(e.touches[0].clientX - x0) ? Math.min(dy * 0.5, 90) : 0 // sideways swipes aren't pulls
      setPull(d)
    }
    const end = async () => {
      if (y0 === null) return
      y0 = null
      if (d < 60) return setPull(0)
      setBusy(true)
      setPull(56)
      try {
        await Promise.allSettled([sync(), strava ? api('POST', 'strava/sync') : null])
        await reload()
      } finally {
        setBusy(false)
        setPull(0)
      }
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    // iOS cancels the touch when the system takes it (pulling down into Notification Centre): drop the arrow.
    const cancel = () => {
      y0 = null
      setPull(0)
    }
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', cancel)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
  }, [off, busy, strava, sync, reload])
  if (!pull && !busy) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 flex justify-center" style={{ transform: `translateY(${pull - 36}px)`, opacity: Math.min(1, pull / 50) }} role="status" aria-label={busy ? 'Refreshing' : undefined}>
      <div className="grid size-9 place-items-center rounded-full border border-line bg-surface shadow-lg">
        {busy ? <span className="size-4 animate-spin rounded-full border-2 border-accent border-r-transparent" />
          : <span className={`transition-transform ${pull >= 60 ? 'rotate-180' : ''}`}><Icon d="M12 5v14M6 13l6 6 6-6" className="h-4 w-4 text-accent" /></span>}
      </div>
    </div>
  )
}

/** Finished workouts that haven't reached the server yet. Shown on every page until they're up. */
export function Outbox({ className = '' }: { className?: string }) {
  const { pending, upload, sync } = useData()
  if (!pending) return null
  const { sending } = upload
  return (
    <div className={`rounded-2xl border border-pb/40 bg-pb/10 p-4 text-sm ${className}`}>
      <p>{plural(pending, 'workout')} saved on this phone, not uploaded yet. It's safe here until it goes up.</p>
      {upload.error && <p className="mt-1 text-muted">Last try: {upload.error}.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={`btn-ghost ${sending ? 'busy' : ''}`} disabled={sending} aria-busy={sending} onClick={() => void sync()}>Try again</button>
        {/* A full page load goes through Cloudflare Access, which renews an expired session and comes back here. */}
        <a className="btn-ghost" href={location.pathname}>Sign in again</a>
        {/* Belt and braces: the workout can always leave the phone by hand. */}
        <CopyButton text={() => outbox().map(workoutText).join('\n\n')} />
      </div>
    </div>
  )
}

/** A workout left running: a bar above the tabs with its clock and rest timer. Tap to go back to it. */
function Running() {
  const now = useNow()
  const a = loadActive() // re-read each tick: the logger saves every change
  const rest = a?.restEndsAt ? (a.restEndsAt - now) / 1000 : null
  // The logger isn't mounted to beep, so the bar does it.
  useEffect(() => {
    const x = loadActive()
    if (!x?.restEndsAt || x.restEndsAt > now) return
    beep()
    saveActive({ ...x, restEndsAt: null })
  }, [now])
  if (!a) return null
  return (
    <Link to="/log" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl border border-accent/50 bg-surface/95 transition-colors active:bg-surface-2 px-4 py-3 shadow-lg backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-80">
      <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-good" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{a.title || 'Workout'} in progress</span>
        <span className="block text-xs tabular-nums text-muted">{clock((now - a.startedAt) / 1000)} · {plural(totals(a).sets, 'set')}</span>
      </span>
      {rest !== null && rest > 0 && <span className="text-2xl font-bold tabular-nums text-accent">{clock(rest)}</span>}
      <span className="text-muted">›</span>
    </Link>
  )
}
