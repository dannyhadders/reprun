import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tap } from '../lib/haptic'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

// "Updated ✓" once per new version, however it arrived (the Update button, or the app restarting by itself after ✕).
// Pages load network-first, so the open that finds an update already runs the new code while the old service worker is
// still in charge. The update has only finished once the worker in charge is this build's (its address carries the sha),
// so that's when the build counts as seen. No worker yet (first install) counts too, without a toast.
const SEEN = 'reprun.build'
const updated = (() => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return false
  const ctl = navigator.serviceWorker.controller
  if (ctl && new URL(ctl.scriptURL).searchParams.get('v') !== __BUILD__.sha) return false // switch still to come
  try {
    const before = localStorage.getItem(SEEN)
    localStorage.setItem(SEEN, __BUILD__.sha)
    return !!before && before !== __BUILD__.sha
  } catch { return false } // storage blocked: skip the toast rather than show it every open
})()

/**
 * Registers the service worker and, when a new version has downloaded, offers to switch to it.
 * Update: the waiting worker takes over and the page reloads once. A workout in progress is in localStorage, so it survives.
 * ✕: the new version still starts by itself the next time the app is fully closed and reopened.
 * Either way the first open on the new version says "Updated ✓".
 */
export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    // Reload only when one version takes over from another. The very first install also "changes controller", but the
    // page already is that version, and reloading threw away a tap on the welcome screen (back to slide 1). Only that
    // first takeover is skipped: a later Update in the same session still reloads, once.
    let controlled = !!sw.controller, reloaded = false
    sw.addEventListener('controllerchange', () => {
      if (!controlled) return void (controlled = true)
      if (reloaded) return
      reloaded = true
      location.reload()
    })
    // The build's sha in the address makes every deploy a new service worker, even when sw.js itself didn't change.
    void sw.register(`/sw.js?v=${__BUILD__.sha}`).then(reg => {
      // Only an update waits: with no controller this is the first install, which takes over by itself.
      const check = () => reg.waiting && sw.controller && setWaiting(reg.waiting)
      check()
      reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', check))
      // A home-screen app can stay open for days: look for a new version each time it comes back to the front.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}))
    })
  }, [])
  if (!waiting || hidden) return <Updated />
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto flex max-w-md animate-toast-in items-center gap-3 rounded-2xl border border-accent/50 bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-lg" role="status">
      <span className="flex-1 text-sm">
        <span className="block font-semibold">New version ready</span>
        <span className="block text-muted">Updating restarts RepRun. Your data is safe, even a workout in progress.</span>
      </span>
      <button className="relative btn min-h-11" onClick={() => waiting.postMessage('update')}><Tap />Update</button>
      <button className="icon-btn" onClick={() => setHidden(true)} aria-label="Later">✕</button>
    </div>
  )
}

/** "Updated ✓" for a few seconds after a new version takes over, with a way to see what changed. */
function Updated() {
  const [show, setShow] = useState(updated)
  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 6000)
    return () => clearTimeout(t)
  }, [show])
  if (!show) return null
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto flex max-w-md animate-toast-in items-center gap-3 rounded-2xl border border-good/40 bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-lg" role="status">
      <span className="flex-1 text-sm"><span className="font-semibold text-good">Updated ✓</span> You're on the latest RepRun.</span>
      <Link to="/settings?about" className="btn-ghost min-h-11" onClick={() => setShow(false)}>What's new</Link>
      <button className="icon-btn" onClick={() => setShow(false)} aria-label="Close">✕</button>
    </div>
  )
}
