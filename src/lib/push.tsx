// Rest alerts: a buzz on the lock screen (and Watch) when rest is over, even with the app closed. The push Worker
// (push/, push.reprun.co.uk) gets only this phone's push address and when rest ends, never workout data; it sends an
// empty push and public/sw.js shows "Rest over". Every copy of RepRun uses the same one, opt-in.
import { useEffect, useState } from 'react'

// The public half of the push Worker's key (push/keys.mjs). Fine in a public repo; the private half is a Cloudflare secret.
const VAPID = 'BEQmHZq39t9DCdIgd2u6-V5HjcQ82q-3OM_LH2kkkGP_qS7mbMo5hGMxwVDMeqfpd0WBgCNc2YLVYb3GGmBMero'
// Testing locally: VITE_PUSH_URL=http://localhost:8788 npm run build, then npm run preview (docs/SETUP.md).
const PUSH_URL = import.meta.env.VITE_PUSH_URL ?? 'https://push.reprun.co.uk'

/** Push needs the service worker, which only runs in a built app; iPhone also needs it added to the home screen. */
export const pushSupported = () => import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const subscription = async () => pushSupported() ? (await navigator.serviceWorker.ready).pushManager.getSubscription() : null

let sent: number | null = null // what the Worker was last told, so a re-render doesn't resend it
/** Rest ends at `at` (ms): ask for an alert then. null cancels. Quietly does nothing when off or offline: the in-app beep still works. */
export function scheduleRest(at: number | null) {
  if (at === sent) return
  sent = at
  void subscription().then(sub => sub && fetch(PUSH_URL, { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, at }), keepalive: true })).catch(() => {})
}

/** "Send a test": an alert in 10 seconds, time to lock the phone. Says what went wrong if it can't even ask for one. */
async function testAlert(): Promise<string> {
  try {
    const sub = await subscription()
    if (!sub) return 'Rest alerts are off on this phone. Turn them off and on again.'
    const res = await fetch(PUSH_URL, { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, at: Date.now() + 10_000 }) })
    return res.ok ? 'Lock your phone now: it should buzz in 10 seconds.' : `The alert server said no (${res.status}).`
  } catch {
    return "Couldn't reach the alert server. Check your signal."
  }
}

type State = 'off' | 'busy' | 'on' | 'denied' | 'failed'
export function useRestAlerts() {
  const [state, setState] = useState<State>('off')
  useEffect(() => {
    void subscription().then(s => setState(s ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off')).catch(() => {})
  }, [])
  const on = async () => {
    setState('busy')
    try {
      // Asked inside the tap (iPhone insists), then subscribe with our key.
      if (await Notification.requestPermission() !== 'granted') return setState('denied')
      const reg = await navigator.serviceWorker.ready
      const key = Uint8Array.from(atob(VAPID.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      setState('on')
    } catch {
      setState('failed')
    }
  }
  const off = async () => {
    await (await subscription())?.unsubscribe()
    setState('off')
  }
  return { state, on, off }
}

/** The button and its status line, for the intro and Settings. */
export function RestAlertsButton({ state, on, off, className = '' }: ReturnType<typeof useRestAlerts> & { className?: string }) {
  if (state === 'denied') return <p className={`text-sm text-muted ${className}`}>Notifications are blocked. Turn them on in the phone's Settings → Notifications → RepRun.</p>
  if (state === 'on') return <RestAlertsOn off={off} className={className} />
  return (
    <div className={className}>
      <button className={`btn w-full py-3 text-base ${state === 'busy' ? 'busy' : ''}`} disabled={state === 'busy'} onClick={() => void on()}>Turn on rest alerts</button>
      {state === 'failed' && <p className="mt-2 text-sm text-bad">Couldn't turn them on. Check your signal and try again.</p>}
    </div>
  )
}

function RestAlertsOn({ off, className }: { off: () => Promise<void>; className: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className={className}>
      <p className="text-sm text-good">On. You'll get a buzz when rest is over.</p>
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => void testAlert().then(setMsg)}>Send a test</button>
        <button className="btn-ghost flex-1" onClick={() => void off()}>Turn off</button>
      </div>
      {msg && <p className="mt-2 text-sm text-muted" role="status">{msg}</p>}
    </div>
  )
}

/** "* Only 'rest over' is sent" and what that means, said plainly. */
export function WhatsSent() {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-left text-xs leading-relaxed text-muted">
      <p>* Only "rest over" is sent, never your workouts.{' '}
        <button className="font-medium text-accent underline" aria-expanded={open} onClick={() => setOpen(!open)}>What's sent?</button>
      </p>
      {open && <p className="mt-2">To buzz your phone later, RepRun's server holds your phone's notification address (a random code from Apple or Google, not your name or email) and the time your rest ends. That's all it ever sees: no exercises, weights or history. It's deleted as soon as the alert is sent or you carry on. Turn it off any time in Settings.</p>}
    </div>
  )
}
