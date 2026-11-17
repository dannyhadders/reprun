// When the first-run intro (components/Onboarding.tsx) shows, and what it knows about the phone it's on.
// ponytail: a flag in localStorage, per device. A second phone sees the intro once too, which is harmless.
const DONE = 'reprun.onboarded'
const AGAIN = 'reprun.introAgain' // Settings → "Show the intro again"

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode: the intro may show again */ } }

export const introDone = () => get(DONE) === '1'
export const introAgain = () => get(AGAIN) === '1'
export const markIntroDone = () => (put(DONE, '1'), put(AGAIN, null))
export const showIntroAgain = () => (put(DONE, null), put(AGAIN, '1'))

/** Open in a phone's browser rather than from the home screen: which how-to to show. null once installed, or on a computer. */
export function installHint(): 'ios' | 'android' | null {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (standalone) return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios' // iPadOS says it's a Mac
  return /Android/.test(ua) ? 'android' : null
}

// Android Chrome offers its own install prompt once; keep it so the intro's Install button can use it.
type InstallPrompt = Event & { prompt: () => Promise<void> }
let deferred: InstallPrompt | null = null
addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferred = e as InstallPrompt
})
export const installPrompt = () => (deferred ? () => void deferred?.prompt() : undefined)
