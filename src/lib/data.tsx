import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../../shared/types.ts'
import { Welcome } from '../components/PhoneOnly.tsx'
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

  // ponytail: matches the worker's "Almost there" message rather than adding an error code.
  if (LOCAL && !ready) return <Welcome onStart={async sample => (await startLocal(sample), await reload(), setReady(true))} />
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
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
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
