// When the first-run intro (components/Onboarding.tsx) shows, and what it knows about the phone it's on.
import { useEffect, useState } from 'react'
// ponytail: a flag in localStorage, per device. A second phone sees the intro once too, which is harmless.
const DONE = 'reprun.onboarded'
const AGAIN = 'reprun.introAgain' // Settings → "Show the intro again"

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode: the intro may show again */ } }

export const introDone = () => get(DONE) === '1'
export const introAgain = () => get(AGAIN) === '1'
export const markIntroDone = () => (put(DONE, '1'), put(AGAIN, null))
export const showIntroAgain = () => (put(DONE, null), put(AGAIN, '1'))

/** Open in a browser rather than from the home screen: which how-to to show. null once installed. 'other' is a computer or an unknown device. */
export function installHint(): 'ios' | 'android' | 'other' | null {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (standalone) return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios' // iPadOS says it's a Mac
  return /Android/.test(ua) ? 'android' : 'other'
}

// Android Chrome offers its install prompt when it decides to, often after the intro is already up. Keep the latest
// one and tell whoever's listening. No preventDefault: Chrome's own banner still shows where there's no intro.
type InstallPrompt = Event & { prompt: () => Promise<void> }
let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach(f => f())
addEventListener('beforeinstallprompt', e => ((deferred = e as InstallPrompt), changed()))
addEventListener('appinstalled', () => ((deferred = null), changed()))

/** The install button's action once Chrome has offered one, else undefined. Each prompt can only be used once. */
export function useInstallPrompt() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const f = () => rerender(n => n + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  return deferred ? () => {
    const d = deferred!
    deferred = null
    changed()
    void d.prompt()
  } : undefined
}

/** "Safari", "Chrome"… for the install how-to, or "your browser" when the user agent doesn't say. */
export function browserName() {
  const ua = navigator.userAgent
  const known: [RegExp, string][] = [
    [/EdgiOS|EdgA|Edg\//, 'Edge'], [/FxiOS|Firefox/, 'Firefox'], [/OPiOS|OPT\/|OPR\//, 'Opera'], [/SamsungBrowser/, 'Samsung Internet'],
    [/DuckDuckGo/, 'DuckDuckGo'], [/GSA\//, 'the Google app'], [/CriOS|Chrome\//, 'Chrome'], [/Version\/[\d.]+.*Safari\//, 'Safari'],
  ]
  return known.find(([re]) => re.test(ua))?.[1] ?? 'your browser'
}
