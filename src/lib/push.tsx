// Rest alerts: a buzz on the lock screen (and Watch) when rest is over, even with the app closed. Plus, unless switched
// off, a streak nudge and a Sunday recap (lib/reminders.ts). The push Worker (push/, push.reprun.co.uk) gets only this
// phone's push address and when each is due, never workout data; it sends an empty push and public/sw.js shows
// "Rest over", or the reminder whose words this phone saved for that time. Every copy of RepRun uses it, opt-in.
import { useEffect, useState } from 'react'
import type { Note } from './reminders'

// The public half of the push Worker's key (push/keys.mjs). Fine in a public repo; the private half is a Cloudflare secret.
// Self-hosters running their own push Worker set VITE_PUSH_KEY and VITE_PUSH_URL as build variables (docs/SETUP.md).
const VAPID = import.meta.env?.VITE_PUSH_KEY ?? 'BEQmHZq39t9DCdIgd2u6-V5HjcQ82q-3OM_LH2kkkGP_qS7mbMo5hGMxwVDMeqfpd0WBgCNc2YLVYb3GGmBMero'
// Testing locally: VITE_PUSH_URL=http://localhost:8788 npm run build, then npm run preview (docs/SETUP.md).
const PUSH_URL = import.meta.env?.VITE_PUSH_URL ?? 'https://push.reprun.co.uk'

/** Push needs the service worker, which only runs in a built app; iPhone also needs it added to the home screen. */
export const pushSupported = () => import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const subscription = async () => pushSupported() ? (await navigator.serviceWorker.ready).pushManager.getSubscription() : null

type Kind = 'rest' | Note['kind']
const sent = new Map<Kind, number | null>() // what the Worker was last told, so a re-render doesn't resend it
/** Ask for a push of `kind` at `at` (ms); null cancels. Quietly does nothing when off or offline. */
function post(kind: Kind, at: number | null) {
  if (sent.has(kind) && sent.get(kind) === at) return
  sent.set(kind, at)
  void subscription().then(sub => sub && fetch(PUSH_URL, { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, at, kind }), keepalive: true })).catch(() => {})
}

/** Rest ends at `at` (ms): ask for an alert then. null cancels. The in-app beep still works without it. */
export function scheduleRest(at: number | null) {
  if (at !== null || sent.has('rest')) post('rest', at)
}

// ---------- streak nudge and Sunday recap ----------
const NOTES = 'reprun-notes' // read by public/sw.js, which keeps this cache through updates
const OFF = 'reprun.reminders.off'
export const remindersOn = () => { try { return localStorage.getItem(OFF) !== '1' } catch { return true } }
let last: Note[] = []

/** Save the words where the service worker can read them, then ask for each push at its time (or cancel it). */
export async function scheduleReminders(notes: Note[]) {
  last = notes
  if (!pushSupported()) return
  const keep = remindersOn() ? notes : []
  try { await (await caches.open(NOTES)).put('/notes', new Response(JSON.stringify(keep))) } catch { return }
  for (const kind of ['nudge', 'recap'] as const) post(kind, keep.find(n => n.kind === kind)?.at ?? null)
}
/** A workout's started: no "time for a session?" in the middle of it. Worked out again once it's saved. */
export const pauseReminders = () => void scheduleReminders([])
export function setRemindersOn(v: boolean) {
  try { if (v) localStorage.removeItem(OFF); else localStorage.setItem(OFF, '1') } catch { /* stays as it was */ }
  void scheduleReminders(last)
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
      sent.clear() // nothing was told to the Worker before there was an address: tell it now
      void scheduleReminders(last)
    } catch {
      setState('failed')
    }
  }
  const off = async () => {
    // Cancel what's waiting first, while there's still an address to cancel it for.
    const sub = await subscription()
    if (sub) await Promise.all((['rest', 'nudge', 'recap'] as const).map(kind => fetch(PUSH_URL, { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, at: null, kind }) }).catch(() => {})))
    sent.clear()
    await sub?.unsubscribe()
    setState('off')
  }
  return { state, on, off }
}

/** The button and its status line, for the intro and Settings. */
export function RestAlertsButton({ state, on, off, className = '' }: ReturnType<typeof useRestAlerts> & { className?: string }) {
  if (state === 'denied') return <p className={`text-sm text-muted ${className}`}>Notifications are blocked. Turn them on in the phone's Settings → Notifications → RepRun.</p>
  if (state === 'on') return (
    <p className={`flex items-center justify-between gap-3 text-sm text-good ${className}`}>
      On. You'll get a buzz when rest is over.
      <button className="btn-ghost shrink-0" onClick={() => void off()}>Turn off</button>
    </p>
  )
  return (
    <div className={className}>
      <button className={`btn w-full py-3 text-base ${state === 'busy' ? 'busy' : ''}`} disabled={state === 'busy'} onClick={() => void on()}>Turn on rest alerts</button>
      {state === 'failed' && <p className="mt-2 text-sm text-bad">Couldn't turn them on. Check your signal and try again.</p>}
    </div>
  )
}

/** "* Your workouts never leave your phone" and what that means, said plainly. */
export function WhatsSent() {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-left text-xs leading-relaxed text-muted">
      <p>* Your workouts never leave your phone, only the time of each alert.{' '}
        <button className="font-medium text-accent underline" aria-expanded={open} onClick={() => setOpen(!open)}>What's sent?</button>
      </p>
      {open && <p className="mt-2">To buzz your phone later, RepRun's server holds your phone's notification address (a random code from Apple or Google, not your name or email) and the time each alert is due: when your rest ends, and the times of your streak nudge and Sunday recap. That's all it ever sees: no exercises, weights or history. The words in a nudge or recap are worked out and kept on your phone. Everything is deleted as soon as the alert is sent or cancelled. Turn it off any time in Settings.</p>}
    </div>
  )
}

/** The switch for the nudge and recap, under rest alerts once they're on. */
export function RemindersSwitch() {
  const [on, setOn] = useState(remindersOn)
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium">Streak nudges and Sunday recap</p>
        <p className="mt-0.5 text-sm text-muted">A nudge when your streak needs a session, and your week in numbers on Sunday evening.</p>
      </div>
      <button className="btn-ghost shrink-0" aria-pressed={on} onClick={() => (setRemindersOn(!on), setOn(!on))}>{on ? 'Turn off' : 'Turn on'}</button>
    </div>
  )
}
