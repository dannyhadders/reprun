import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CHANGELOG, shortNote } from '../lib/changelog'
import { Tap } from '../lib/haptic'
import { loadActive } from '../lib/session'
import { CHECK, Icon } from './ui'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

const SEEN = 'reprun.build' // the last build this phone finished updating to
const NOTES = 'reprun.notes' // how many changelog lines it had then, so What's new lists only the lines since
const BUSY = 'reprun.updating' // sessionStorage: an update started, so the pop-up carries on across the restart
const MS = 2500 // Done taps itself after this, like the intro's Next (Onboarding READ_MS)
const LINES = CHANGELOG.flatMap(c => c.changes)
const live = import.meta.env.PROD && 'serviceWorker' in navigator

// The first open where this build's service worker is in charge: the update has finished, so say what's new.
// Pages load network-first, so an open can already run the new code while the old worker is in charge; that isn't it yet.
// No worker yet (first install) counts as seen, without the pop-up. null = no update to show.
const fresh = (() => {
  if (!live) return null
  const ctl = navigator.serviceWorker.controller
  if (ctl && new URL(ctl.scriptURL).searchParams.get('v') !== __BUILD__.sha) return null // switch still to come
  try {
    const before = localStorage.getItem(SEEN), seen = Number(localStorage.getItem(NOTES) ?? LINES.length)
    localStorage.setItem(SEEN, __BUILD__.sha)
    localStorage.setItem(NOTES, String(LINES.length))
    sessionStorage.removeItem(BUSY)
    if (!before || before === __BUILD__.sha) return null
    const n = Math.max(0, LINES.length - seen)
    return { notes: LINES.slice(0, Math.min(n, 3)).map(shortNote), more: Math.max(0, n - 3) }
  } catch { return null } // storage blocked: skip the pop-up rather than show it every open
})()
const resuming = (() => { try { return !fresh && !!sessionStorage.getItem(BUSY) } catch { return false } })()

// Not now: mid-workout (it waits for the finish), typing, or a sheet, dialog or the intro open (unsaved changes).
const inTheWay = () => !!loadActive() || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
  || !!document.querySelector('dialog[open], [role="dialog"]')

type Found = 'new' | 'later' | 'latest' | 'offline'
let check: (now?: boolean) => Promise<Found> = async () => 'latest' // set once the service worker is registered
/** Settings → Check for updates: look right now. 'new' means the pop-up follows once it's downloaded; 'later' that it
 * waits for the workout to finish. */
export const checkForUpdate = () => check(true)

/**
 * Keeps everyone on the latest build, with no banner to miss. It looks for a new version when the app comes back to the
 * front, every 15 minutes while open and on every tab change: index.html carries the build's sha (vite.config.ts), and a
 * different one means a new deploy. Its service worker installs in the background; once ready (and nothing's in the way)
 * a pop-up says "Update in progress", the new worker takes over, the app restarts behind the pop-up, and the restarted app
 * shows a tick, "Update complete" and the first few changelog lines since this phone last updated. Done taps itself
 * after 2.5 s; a tap on the card holds it open to read.
 */
export function UpdateBanner() {
  const [phase, setPhase] = useState<'busy' | 'done' | 'leaving' | null>(fresh || resuming ? 'busy' : null)
  const [held, setHeld] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => void check(), [pathname])

  useEffect(() => {
    if (!live) return
    const sw = navigator.serviceWorker
    // Reload only when one version takes over from another. The very first install also "changes controller", but the
    // page already is that version, and reloading threw away a tap on the welcome screen (back to slide 1).
    let controlled = !!sw.controller, reloaded = false
    sw.addEventListener('controllerchange', () => {
      if (!controlled) return void (controlled = true)
      if (reloaded) return
      reloaded = true
      location.reload()
    })
    let reg: ServiceWorkerRegistration | undefined, last = 0
    // Always the live reg.waiting: the very first install passes through it on its way to taking over by itself.
    const apply = () => {
      const waiting = reg?.waiting
      if (!waiting || !sw.controller || document.visibilityState !== 'visible' || inTheWay()) return
      try { sessionStorage.setItem(BUSY, '1') } catch { /* the restarted app just won't show the spinner first */ }
      setPhase('busy')
      waiting.postMessage('update') // sw.js skips waiting; controllerchange above reloads
    }
    void sw.register(`/sw.js?v=${__BUILD__.sha}`).then(r => {
      reg = r
      apply()
      r.addEventListener('updatefound', () => r.installing?.addEventListener('statechange', apply))
      const found = (): Found => (apply(), inTheWay() ? 'later' : 'new')
      check = async (now = false) => {
        if (r.waiting) return found()
        if (!now && Date.now() - last < 30_000) return 'latest'
        last = Date.now()
        // A new sha means a new worker: registering its address installs it, and `apply` runs when it's done.
        try {
          const res = await fetch('/', { cache: 'no-store' })
          if (!res.ok || res.redirected) return 'offline' // or Access wants a sign-in: try again later
          const sha = /name="reprun-build" content="(\w+)"/.exec(await res.text())?.[1]
          if (!sha || sha === __BUILD__.sha) return 'latest'
          await sw.register(`/sw.js?v=${sha}`)
          return found()
        } catch { return 'offline' }
      }
      void check()
    })
    const front = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', front)
    // ponytail: the 15-minute look also retries an update that was waiting for a workout or a sheet to close
    const every = setInterval(front, 15 * 60_000)
    const retry = setInterval(apply, 5000)
    return () => (document.removeEventListener('visibilitychange', front), clearInterval(every), clearInterval(retry))
  }, [])

  // Spinner, then the tick once the new version is in. A restart that never comes back (the update failed) gives up.
  useEffect(() => {
    if (phase !== 'busy') return
    const t = fresh ? setTimeout(() => setPhase('done'), 700) : setTimeout(() => {
      try { sessionStorage.removeItem(BUSY) } catch { /* nothing to undo */ }
      setPhase(null)
    }, 20_000)
    return () => clearTimeout(t)
  }, [phase])
  useEffect(() => {
    if (phase !== 'done' || held) return
    const t = setTimeout(() => setPhase('leaving'), MS)
    return () => clearTimeout(t)
  }, [phase, held])
  useEffect(() => {
    if (phase !== 'leaving') return
    const t = setTimeout(() => setPhase(null), 250)
    return () => clearTimeout(t)
  }, [phase])
  // The page behind stays put while it's up.
  useEffect(() => {
    if (!phase) return
    const root = document.documentElement, was = root.style.overflow
    root.style.overflow = 'hidden'
    return () => void (root.style.overflow = was)
  }, [phase])

  if (!phase) return null
  const done = phase !== 'busy'
  return (
    <div className={`fixed inset-0 z-[60] grid touch-none place-items-center bg-bg/70 p-5 backdrop-blur-md transition-opacity duration-250 ${phase === 'leaving' ? 'opacity-0' : 'animate-fade-in'}`}>
      <div role="alertdialog" aria-modal aria-label={done ? 'Update complete' : 'Update in progress'} onClick={() => done && setHeld(true)}
        className="w-full max-w-xs animate-toast-in rounded-3xl border border-line bg-surface-2 px-5 pb-4 pt-6 text-center shadow-2xl shadow-black/50">
        <div className="relative mx-auto mb-4 grid size-16 place-items-center">
          {done ? <>
            <span className="absolute inset-0 animate-ping rounded-full bg-good/25" aria-hidden />
            <span className="absolute inset-0 animate-tick-in rounded-full bg-good" aria-hidden />
            <Icon d={CHECK} className="draw-tick relative size-8 text-bg [stroke-width:3]" />
          </> : <span className="size-12 animate-spin rounded-full border-[3px] border-line border-t-accent" aria-hidden />}
        </div>
        {done ? <>
          <p className="text-lg font-bold">Update complete</p>
          {fresh?.notes.length ? (
            <ul className="mt-3 space-y-1.5 text-left text-sm leading-snug">
              {fresh.notes.map(n => <li key={n} className="flex gap-2 animate-page-in"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />{n}</li>)}
              {fresh.more > 0 && <li className="pl-3.5 text-muted">+ {fresh.more} more in Settings → About</li>}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">You're on the latest RepRun.</p>}
          <button className="btn relative mt-4 min-h-12 w-full overflow-hidden text-base" onClick={() => setPhase('leaving')}>
            <span aria-hidden className="absolute inset-0 origin-left bg-white/20" style={{ animation: `intro-fill ${MS}ms linear both`, animationPlayState: held ? 'paused' : 'running' }} />
            <Tap /><span className="relative">Done</span>
          </button>
        </> : <>
          <p className="text-lg font-bold">Update in progress…</p>
          <p className="mt-1 pb-2 text-sm text-muted">Your data is safe.</p>
        </>}
      </div>
    </div>
  )
}
