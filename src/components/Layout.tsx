import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../lib/data'
import { plural } from '../lib/format'
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

export const Icon = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
)

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  const { data } = useData()
  const on = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  // Like Link: tapping where you already are doesn't stack another back-swipe.
  const go = (to: string) => navigate(to, { replace: pathname === to })
  const inMore = NAV.some(n => !TABS.includes(n.to) && on(n.to))
  const tab = (n: (typeof NAV)[number]) => (
    <button key={n.to} onClick={() => go(n.to)} aria-current={on(n.to) ? 'page' : undefined} className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${on(n.to) ? 'text-accent' : 'text-muted'}`}>
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

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
        {data.demo && (
          <p className="mb-5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
            <b>Demo</b> with made-up data: click around, log a workout, break things. It all resets every night.{' '}
            <a className="font-semibold text-accent underline" href="https://github.com/dannyhadders/reprun">Host your own →</a>
          </p>
        )}
        <Outbox className="mb-5" />
        <Outlet />
      </main>

      {more && (
        <div className="fixed inset-0 z-30 bg-black/55 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2.5" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            {NAV.filter(n => !TABS.includes(n.to)).map(n => (
              <button key={n.to} onClick={() => (go(n.to), setMore(false))} className="relative flex w-full items-center gap-3 border-b border-line px-1 py-3.5 text-left text-[15px]">
                <Tap />
                <Icon d={n.icon} className="h-5 w-5 text-muted" />{n.label === 'Year' ? 'Year in review' : n.label}
              </button>
            ))}
            <AddWorkout className="flex w-full items-center gap-3 px-1 py-3.5 text-left text-[15px] text-muted" />
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tab(NAV[0])}
        {tab(NAV[1])}
        <button onClick={() => go('/log')} aria-label="Start workout" className="relative -mt-5 grid h-14 w-14 place-self-center place-items-center rounded-full border-4 border-bg text-white shadow-lg shadow-accent/40 grad-bg">
          <Tap />
          <Icon d={I.plus} className="h-6 w-6" />
        </button>
        {tab(NAV[3])}
        <button onClick={() => setMore(!more)} aria-expanded={more} className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${more || inMore ? 'text-accent' : 'text-muted'}`}>
          <Tap />
          <Icon d={I.more} />
          More
        </button>
      </nav>
    </div>
  )
}

/** Finished workouts that haven't reached the server yet. Shown on every page until they're up. */
export function Outbox({ className = '' }: { className?: string }) {
  const { pending, upload, sync } = useData()
  if (!pending) return null
  const sending = upload?.state === 'sending'
  return (
    <div className={`rounded-2xl border border-pb/40 bg-pb/10 p-4 text-sm ${className}`}>
      <p>{plural(pending, 'workout')} saved on this phone, not uploaded yet. It's safe here until it goes up.</p>
      {upload?.error && <p className="mt-1 text-muted">Last try: {upload.error}.</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" disabled={sending} onClick={() => void sync()}>{sending ? 'Uploading…' : 'Try again'}</button>
        {/* A full page load goes through Cloudflare Access, which renews an expired session and comes back here. */}
        <a className="btn-ghost" href={location.pathname}>Sign in again</a>
      </div>
    </div>
  )
}
