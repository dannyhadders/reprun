import { useEffect, useState } from 'react'
import { Tap } from '../lib/haptic'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

/**
 * Registers the service worker and, when a new version has downloaded, offers to switch to it.
 * Update: the waiting worker takes over and the page reloads once. A workout in progress is in localStorage, so it survives.
 * ✕: the new version still starts by itself the next time the app is fully closed and reopened.
 */
export function UpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    let reloaded = false
    sw.addEventListener('controllerchange', () => reloaded || ((reloaded = true), location.reload()))
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
  if (!waiting || hidden) return null
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto flex max-w-md animate-toast-in items-center gap-3 rounded-2xl border border-accent/50 bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-lg" role="status">
      <span className="flex-1 text-sm">New version ready.</span>
      <button className="relative btn min-h-11" onClick={() => waiting.postMessage('update')}><Tap />Update</button>
      <button className="icon-btn" onClick={() => setHidden(true)} aria-label="Later">✕</button>
    </div>
  )
}
