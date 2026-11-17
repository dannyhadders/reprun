import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../../shared/types.ts'
import { useNavigate } from 'react-router-dom'
import { planPrompt } from '../../shared/plan.ts'
import { startersFor } from '../../shared/starter.ts'
import { Onboarding, Splash, type Answers } from '../components/Onboarding.tsx'
import { today } from './format.ts'
import { installHint, introAgain, introDone, markIntroDone } from './intro.ts'
import { local, LOCAL, startLocal, started } from './local.ts'
import { sessionLines } from './motivation.ts'
import { flush, outbox } from './session.ts'
import { buildModel, type Model } from './stats.ts'

type Upload = { sending: boolean; error?: string }
type Ctx = {
  data: Data; model: Model; lines: Map<string, string>; reload: () => Promise<void>
  pending: number; upload: Upload; sync: () => Promise<void> // finished workouts still on this phone
}
const DataCtx = createContext<Ctx | null>(null)
const CACHE = 'reprun.data'
declare const __BUILD__: { sha: string; date: string } // vite.config.ts
// The copy opened on at launch must come from this version of the app: one saved by an older version may lack a field
// the new screens read, and a crash before the first fetch would never get replaced. (The offline fallback takes any copy, as before.)
const CACHE_BUILD = 'reprun.data.build'

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  if (LOCAL) return local<T>(method, path, body)
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Cloudflare Access answers an expired session with a redirect to its login page. Followed, that's a
      // cross-origin fetch the browser blocks with a vague "Load failed"; caught here, it can say what happened.
      redirect: 'manual',
    })
  } catch {
    throw new Error('No signal')
  }
  if (res.type === 'opaqueredirect') throw new Error('Sign-in expired')
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `Request failed (${res.status})`)
  return out as T
}

/** Strava's activities.csv (from "Download your data") into RepRun. Returns what came in, for a message. Caller reloads. */
export async function importStravaFile(file: File) {
  const { fromStravaCsv, isStravaCsv, stravaSummary } = await import('../../shared/stravaCsv.ts')
  const text = await file.text()
  if (!isStravaCsv(text)) throw new Error("That isn't Strava's activities.csv. It's in the zip Strava emails you.")
  const activities = fromStravaCsv(text)
  if (!activities.length) throw new Error('No activities in that file.')
  await api('POST', 'import', { workouts: [], activities, records: [], goals: [] })
  return `Brought in ${stravaSummary(activities)}. Anything already here was updated, not doubled.`
}

export function DataProvider({ children }: { children: ReactNode }) {
  // Open on the last copy straight away and refresh behind it; the network only decides what shows on the very first open.
  const [data, setData] = useState<Data | null>(() => {
    try { return !LOCAL && localStorage.getItem(CACHE_BUILD) === __BUILD__.sha ? JSON.parse(localStorage.getItem(CACHE) ?? 'null') as Data | null : null } catch { return null }
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(() => outbox().length)
  const [upload, setUpload] = useState<Upload>({ sending: false })
  const [ready, setReady] = useState(() => !LOCAL || started()) // phone-only: picked fresh or sample yet?
  const reload = useCallback(async () => {
    try {
      const d = await api<Data>('GET', 'data')
      setData(d)
      setError(null)
      if (!LOCAL) try { localStorage.setItem(CACHE, JSON.stringify(d)); localStorage.setItem(CACHE_BUILD, __BUILD__.sha) } catch { /* full or blocked: just no offline copy */ }
    } catch (e) {
      // Offline at the gym (or Access session expired): carry on with the last copy so the logger still works.
      const cached = (() => { try { return localStorage.getItem(CACHE) } catch { return null } })()
      if (cached) setData(d => d ?? (JSON.parse(cached) as Data))
      else setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  // Finished workouts go up from any page: on open, when the app comes back to the front, and when signal returns.
  const sync = useCallback(async () => {
    setPending(outbox().length)
    if (!outbox().length) return
    setUpload({ sending: true })
    const r = await flush()
    setPending(outbox().length)
    setUpload({ sending: false, error: r.error ?? undefined })
    if (r.sent) await reload()
  }, [reload])
  // Workouts waiting to upload, as a number on the app icon. iOS shows it only once notifications are allowed (Settings).
  useEffect(() => {
    void (pending ? navigator.setAppBadge?.(pending) : navigator.clearAppBadge?.())?.catch(() => {})
  }, [pending])
  useEffect(() => {
    const front = () => document.visibilityState === 'visible' && void sync()
    void sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', front)
    return () => (window.removeEventListener('online', sync), document.removeEventListener('visibilitychange', front))
  }, [sync])

  const value = useMemo(() => {
    if (!data) return null
    const model = buildModel(data)
    return { data, model, lines: sessionLines(model), reload, pending, upload, sync }
  }, [data, reload, pending, upload, sync])

  // First-run intro, over the app. Phone-only: whenever the phone has no data yet (page 1 picks fresh or sample).
  // Elsewhere: someone with nothing logged, everyone on the demo, or Settings → "Show the intro again".
  const navigate = useNavigate()
  // A phone-only copy with no data always gets it: page 1 is where it starts, or the screen would stay empty.
  const [intro, setIntro] = useState(() => (LOCAL && !started()) || (!introDone() && (introAgain() || !LOCAL)))
  const [introMode] = useState<'local' | 'self' | null>(() => (LOCAL ? (started() ? 'self' : 'local') : null))
  const fresh = !!data && !data.workouts.length && !data.activities.some(a => !a.sample)
  const showIntro = intro && (LOCAL || introAgain() || data?.demo || fresh) && (LOCAL || !!data)
  // Finishing the intro plays the splash; the app behind remounts as it ends, so the dashboard builds in (html.reveal, index.css).
  const [splash, setSplash] = useState(false)
  const [mount, setMount] = useState(0)
  const endSplash = useCallback(() => setSplash(false), [])
  const reveal = useCallback(() => {
    setIntro(false) // only now: hidden any sooner, the dashboard would show before the splash covers it
    setMount(m => m + 1)
    document.documentElement.classList.add('reveal')
    setTimeout(() => document.documentElement.classList.remove('reveal'), 1200)
  }, [])
  const finishIntro = async (a: Answers | null, then?: 'paste-plan') => {
    if (!then) setSplash(true) // paste-plan heads straight to the logger
    try {
      if (LOCAL && !started()) await startLocal(false) // skipped before picking: an empty copy
      if (a && data && !data.demo) { // the demo is one shared database: one visitor's details would show to everyone
        const p = data.profile
        await api('PUT', 'profile', { ...p, goals: a.goals.length ? a.goals : p.goals, age: a.age ?? p.age, weight_kg: a.weight_kg ?? p.weight_kg, sex: a.sex ?? p.sex })
        if (a.weight_kg) await api('POST', 'body-weight', { date: today(), kg: a.weight_kg }).catch(() => {}) // starts the body weight chart
      }
    } catch { /* offline or signed out: don't trap them in the intro; Settings → Profile has it all */ }
    markIntroDone()
    if (then) setIntro(false) // otherwise the splash's reveal does it
    await reload()
    setReady(true)
    // ponytail: with a workout already running, /log shows that instead of the paste box. Only reachable via "Show the intro again".
    if (then === 'paste-plan') navigate('/log#import')
  }
  // Same place in the tree before and after the phone-only copy starts, so the intro keeps its page and answers.
  const introEl = showIntro ? (
    <Onboarding
      mode={introMode ?? (data?.demo ? 'demo' : 'self')}
      install={installHint()}
      stravaConfigured={data?.strava.configured}
      // Guarded so the phone-only code stays out of every other build (see CLAUDE.md).
      onData={LOCAL ? async sample => (await startLocal(sample), await reload(), setReady(true)) : undefined}
      prompt={a => planPrompt(data?.exercises.map(e => e.name) ?? [], a)}
      onStarters={async a => {
        const have = new Set(data?.routines.map(r => r.name.toLowerCase()))
        const add = startersFor(a.goals).filter(r => !have.has(r.name.toLowerCase()))
        if (add.length) await api('POST', 'routines', { routines: add })
        await reload()
      }}
      onStravaFile={async f => {
        const msg = await importStravaFile(f)
        await reload()
        return msg
      }}
      onFinish={(a, then) => void finishIntro(a, then)}
    />
  ) : null
  const splashEl = splash ? <Splash onReveal={reveal} onDone={endSplash} /> : null
  if (LOCAL && !ready) return <>{null}{introEl}{splashEl}</>

  // ponytail: matches the worker's "Almost there" message rather than adding an error code.
  if (error?.startsWith('Almost there') && !data) return <FinishSetup />
  if (error && !data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Couldn't load your data</p>
          <p className="mt-1 text-muted">{error}</p>
          <button className="btn mt-4" onClick={reload}>Try again</button>
        </div>
      </div>
    )
  }
  if (!value) return <Skeleton />
  // While the intro's up, the app behind it is inert: no focus, taps or screen reader can reach it.
  return <><div key={mount} className="contents" inert={!!introEl}><DataCtx.Provider value={value}>{children}</DataCtx.Provider></div>{introEl}{splashEl}</>
}

export const useData = () => {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData outside DataProvider')
  return c
}

/** First-ever open, before anything's cached: grey shapes where the dashboard will be, instead of "Loading…". */
function Skeleton() {
  const block = 'animate-pulse rounded-2xl bg-surface'
  return (
    <div aria-busy aria-label="Loading" className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pt-10">
      <div className="space-y-2"><div className="h-4 w-28 animate-pulse rounded bg-surface" /><div className="h-7 w-3/4 animate-pulse rounded bg-surface" /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className={`${block} h-24`} />)}</div>
      <div className={`${block} h-60`} />
      <div className={`${block} h-44`} />
    </div>
  )
}

/** Shown by a fresh copy until the login is in front of it (worker/index.ts refuses the API until then). */
function FinishSetup() {
  const step = 'flex gap-3 text-left'
  const n = 'grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent'
  const code = 'rounded bg-surface-2 px-1 py-0.5 text-[0.85em] text-ink'
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md">
        <img src="/favicon.svg" alt="" className="mx-auto size-14" />
        <h1 className="mt-4 text-center text-xl font-bold">RepRun is running 🎉</h1>
        <p className="mt-1 text-center text-muted">
          One last step: put a login in front of it, so only you can see your training.
        </p>
        <ol className="mt-6 space-y-4 text-sm text-muted">
          <li className={step}>
            <span className={n}>1</span>
            <span>
              In the <a className="text-accent underline" href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">Cloudflare dashboard</a>,
              open <b className="text-ink">Workers &amp; Pages → reprun → Access</b> → <b className="text-ink">Protect this Worker
              behind Access → All traffic</b>. Policy: <b className="text-ink">Cloudflare account</b>, session
              <b className="text-ink"> 7 days</b>, Apply. Then copy the <b className="text-ink">AUD</b> tag and
              the <b className="text-ink">JWKS</b> link from <b className="text-ink">Application values</b>.
            </span>
          </li>
          <li className={step}>
            <span className={n}>2</span>
            <span>
              Same Settings page → <b className="text-ink">Variables and Secrets</b>. Add three secrets, then Deploy:
              <span className="mt-1.5 block space-y-1">
                <span className="block"><span className={code}>ALLOWED_EMAIL</span> your Cloudflare login email</span>
                <span className="block"><span className={code}>ACCESS_AUD</span> the AUD tag</span>
                <span className="block"><span className={code}>ACCESS_TEAM</span> the JWKS link</span>
              </span>
            </span>
          </li>
        </ol>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button className="btn" onClick={() => location.reload()}>I've done it, reload</button>
          <a className="btn-ghost" href="https://github.com/dannyhadders/reprun/blob/main/docs/SETUP.md#2-put-a-login-in-front-of-it" target="_blank" rel="noreferrer">
            Full guide
          </a>
        </div>
      </div>
    </div>
  )
}
