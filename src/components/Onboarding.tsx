import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GOALS, type GoalId } from '../../shared/rules'
import type { Profile } from '../../shared/types'
import { Tap } from '../lib/haptic'
import { browserName, useInstallPrompt } from '../lib/intro'
import { CopyButton, Icon } from './ui'

export type Answers = { goals: GoalId[]; weight_kg: number | null; age: number | null; sex: Profile['sex'] | null }

type Props = {
  /** self: your own copy; local: phone-only (page 1 picks fresh or sample data); demo: the public demo. */
  mode: 'self' | 'local' | 'demo'
  stravaConfigured?: boolean
  /** Open in a phone's browser rather than from the home screen: show how to add it. null once installed, or on a computer. */
  install?: 'ios' | 'android' | null
  /** Phone-only, page 1: set up the phone's copy with or without sample data. */
  onData?: (sample: boolean) => Promise<void>
  /** The ChatGPT prompt for these answers (Planner's, with the goals in). */
  prompt: (a: Answers) => string
  onStarters: (a: Answers) => Promise<void>
  onStravaFile: (f: File) => Promise<string> // says what came in
  /** Done (answers to save) or skipped (null); `then` is where to go next. */
  onFinish: (a: Answers | null, then?: 'paste-plan') => void
}

const I = {
  lift: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11',
  run: 'M13 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 21l3-6 3 2v5M10 15l1-5 4 2 3-1M11 10 8 9l-3 3',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15l3 3 3-3',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7', // iOS's share glyph
  add: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 8v8M8 12h8',
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  dots: 'M12 5h.01M12 12h.01M12 19h.01',
}

/** First-run intro: five swipeable pages (six with the home-screen how-to), every question optional, Skip on every page. */
export function Onboarding({ mode, stravaConfigured, install, onData, prompt, onStarters, onStravaFile, onFinish }: Props) {
  const PAGES = install ? 6 : 5
  const track = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const onInstall = useInstallPrompt() // Android: Chrome's own install prompt, once it offers one
  const browser = browserName()
  // A dialog over the app: focus starts inside it (the app behind is inert, see DataProvider).
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => root.current?.focus(), [])
  const [chosen, setChosen] = useState(false) // phone-only: picked fresh or sample on page 1
  const [a, setA] = useState<Answers>({ goals: [], weight_kg: null, age: null, sex: null })
  const [starting, setStarting] = useState<'fresh' | 'sample' | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const begin = async (sample: boolean) => {
    setStarting(sample ? 'sample' : 'fresh')
    setStartError(null)
    try {
      await onData?.(sample)
      setChosen(true)
      go(1)
    } catch (e) {
      setStartError(`Couldn't start: ${e instanceof Error ? e.message : e}. Check your signal and try again.`)
    } finally {
      setStarting(null)
    }
  }
  const go = (n: number) => track.current?.scrollTo({ left: n * track.current.clientWidth, behavior: 'smooth' })
  const next = () => (page < PAGES - 1 ? go(page + 1) : onFinish(a))
  // Page 1 on the phone-only copy has its own buttons (fresh or sample), so swiping waits for that choice. Not in the
  // phone's browser, though: a home-screen app on iPhone keeps its own storage, so data set up here would stay behind.
  // Once chosen, page 1 lets go: the buttons would wipe what's been added since (they start the copy afresh).
  const locked = mode === 'local' && !install && !chosen && page === 0

  return (
    <div ref={root} tabIndex={-1} className="fixed inset-0 z-50 flex flex-col bg-bg px-[max(0px,calc(50%-15rem))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] outline-none" role="dialog" aria-modal="true" aria-label="Welcome to RepRun">
      <div className="flex h-12 items-center justify-end px-2">
        {!locked && <button className="press min-h-11 rounded-xl px-4 text-sm font-medium text-muted" onClick={() => onFinish(null)}>Skip</button>}
      </div>

      {/* Native horizontal scroll-snap: the swipe, momentum and paging are the browser's own. */}
      <div className={`flex flex-1 snap-x snap-mandatory overflow-y-hidden [scrollbar-width:none] ${locked ? 'overflow-x-hidden' : 'overflow-x-auto'}`}
        onScroll={e => setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        ref={track}>
        <Page>
          <img src="/favicon.svg" alt="" className="size-16" />
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight">Rep<span className="grad-text">Run</span></h1>
          <p className="mt-2 text-lg text-muted">Lift. Run. Repeat.</p>
          <ul className="mt-8 space-y-4 text-left">
            <Feature icon={I.lift}>Log every set at the gym, with the weights to beat last time</Feature>
            <Feature icon={I.run}>Your runs and rides come in from Strava</Feature>
            <Feature icon={I.trophy}>Watch the PBs stack up, and share them</Feature>
          </ul>
          {mode === 'demo' && <p className="mt-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">This is the demo, filled with made-up training. Have a look around, nothing here is saved for long.</p>}
          {mode === 'local' && install && <p className="mt-8 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">Add RepRun to your home screen first (next page), then open it from there. Your training lives in the home-screen app.</p>}
          {mode === 'local' && !install && chosen && <p className="mt-8 flex items-center justify-center gap-2 text-sm text-good"><Icon d="M20 6 9 17l-5-5" className="h-4 w-4" />All set on this phone. Swipe on, or Skip.</p>}
          {mode === 'local' && !install && !chosen && (
            <div className="mt-8 w-full space-y-2">
              <button className={`btn relative w-full py-3 text-base ${starting === 'fresh' ? 'busy' : ''}`} disabled={!!starting} onClick={() => void begin(false)}><Tap />Start fresh</button>
              <button className={`btn-ghost relative w-full py-3 ${starting === 'sample' ? 'busy' : ''}`} disabled={!!starting} onClick={() => void begin(true)}><Tap />Try it with sample data first</button>
              {startError && <p className="text-sm text-bad">{startError}</p>}
              <p className="pt-1 text-xs leading-relaxed text-muted">No account: everything stays on this phone, and deleting the app deletes it, so save a backup now and then (Settings → Backup). Want it on a server instead? <a className="text-accent underline" href="https://github.com/dannyhadders/reprun/blob/main/docs/SETUP.md" target="_blank" rel="noreferrer">Host your own copy</a>.</p>
            </div>
          )}
        </Page>

        {install && (
          <Page>
            <h2 className="text-3xl font-bold tracking-tight">Put it on your home screen</h2>
            <p className="mt-2 text-muted">Then RepRun opens like an app: full screen, one tap away, and it still works when the gym has no signal.</p>
            <ol className="mt-7 w-full space-y-3 text-left">
              {(install === 'ios'
                ? [[I.share, <>Tap <b>Share</b> in {browser === 'your browser' ? 'your browser' : `${browser}'s`} toolbar (or <b>•••</b>, then Share)</>], [I.add, <>Scroll down and tap <b>Add to Home Screen</b></>], [I.home, <>Tap <b>Add</b>, then open RepRun from your home screen</>]]
                : [[I.dots, <>Tap <b>⋮</b> at the top right of Chrome</>], [I.add, <>Tap <b>Install app</b> (or <b>Add to home screen</b>)</>], [I.home, <>Open RepRun from your home screen</>]]
              ).map(([icon, text], i) => (
                <li key={i} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon d={icon as string} className="h-5 w-5" /></span>
                  <span className="text-[15px] leading-snug"><span className="mr-1 text-muted">{i + 1}.</span>{text}</span>
                </li>
              ))}
            </ol>
            {install === 'android' && onInstall && <button className="btn relative mt-4 w-full py-3 text-base" onClick={onInstall}><Tap />Install RepRun</button>}
            {mode === 'local' && <p className="mt-4 text-sm text-muted">Do this before adding anything: the home-screen app keeps its own copy, separate from {browser}.</p>}
          </Page>
        )}

        <Page>
          <h2 className="text-3xl font-bold tracking-tight">Built for the gym floor</h2>
          <p className="mt-2 text-muted">Tick a set and the rest timer starts. Beat your best and it tells you.</p>
          <Demo />
        </Page>

        <Page>
          <h2 className="text-3xl font-bold tracking-tight">What are you here for?</h2>
          <p className="mt-2 text-muted">Pick up to two. It shapes the routines RepRun suggests. Optional.</p>
          <div className="mt-7 grid w-full grid-cols-2 gap-3">
            {GOALS.map(g => {
              const on = a.goals.includes(g.id)
              return (
                <button key={g.id} aria-pressed={on} className={`press relative flex min-h-24 flex-col items-start justify-between rounded-2xl border p-4 text-left ${on ? 'border-accent bg-accent/15' : 'border-line bg-surface'}`}
                  onClick={() => setA(p => ({ ...p, goals: on ? p.goals.filter(x => x !== g.id) : [...p.goals, g.id].slice(-2) }))}>
                  <Tap />
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="font-semibold leading-tight">{g.label}</span>
                  {on && <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-accent text-white"><Icon d="M20 6 9 17l-5-5" className="h-4 w-4" /></span>}
                </button>
              )
            })}
          </div>
        </Page>

        <Page>
          <h2 className="text-3xl font-bold tracking-tight">A bit about you</h2>
          <p className="mt-2 text-muted">All optional. It lets RepRun compare your lifts with people like you, and plan around you.</p>
          <div className="mt-7 w-full space-y-4 text-left">
            <label className="block text-sm text-muted">Body weight (kg)
              <input className="input mt-1 h-12 text-base" type="number" inputMode="decimal" step="0.1" min="20" max="300" placeholder="e.g. 80" value={a.weight_kg ?? ''} onChange={e => setA(p => ({ ...p, weight_kg: e.target.value ? +e.target.value : null }))} />
            </label>
            <label className="block text-sm text-muted">Age
              <input className="input mt-1 h-12 text-base" type="number" inputMode="numeric" min="10" max="100" placeholder="e.g. 32" value={a.age ?? ''} onChange={e => setA(p => ({ ...p, age: e.target.value ? +e.target.value : null }))} />
            </label>
            <div className="text-sm text-muted">Compare my lifts with
              <div className="mt-1 grid grid-cols-3 gap-2">
                {([['female', 'Women'], ['male', 'Men'], [null, 'Rather not say']] as const).map(([v, label]) => (
                  <button key={label} aria-pressed={a.sex === v} onClick={() => setA(p => ({ ...p, sex: v }))}
                    className={`press min-h-12 rounded-xl border px-2 text-sm font-medium ${a.sex === v ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface text-muted'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </Page>

        <Page>
          <h2 className="text-3xl font-bold tracking-tight">Get your training in</h2>
          <p className="mt-2 text-muted">Any of these, or none. You can do them all later.</p>
          <div className="mt-6 w-full space-y-3 text-left">
            <Option icon={I.spark} title="Plan it with ChatGPT" sub="Copy this, paste it into ChatGPT, answer its questions, then paste the plan it writes back here.">
              <div className="mt-3 flex gap-2">
                <CopyButton className="btn-ghost flex-1" label="Copy prompt" text={() => prompt(a)} />
                <button className="btn flex-1" onClick={() => onFinish(a, 'paste-plan')}>Paste a plan</button>
              </div>
            </Option>
            {/* Not on the public demo: one shared database, so a visitor's routines or Strava history would show to everyone. */}
            {mode !== 'demo' && <Starters onAdd={() => onStarters(a)} />}
            {mode !== 'demo' && <StravaHistory configured={stravaConfigured} onFile={onStravaFile} />}
            {mode === 'demo' && <p className="px-1 text-sm text-muted">On your own copy you can also add starter routines for your goals, or bring in your whole Strava history.</p>}
          </div>
        </Page>
      </div>

      <div className="flex items-center justify-between gap-4 px-6 pt-3">
        <div className="flex gap-2" aria-hidden>
          {Array.from({ length: PAGES }, (_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === page ? 'w-6 bg-accent' : 'w-2 bg-line'}`} />)}
        </div>
        {!locked && <button className="btn relative min-h-12 px-6 text-base" onClick={next}><Tap />{page === PAGES - 1 ? "Let's go" : 'Next'}</button>}
      </div>
    </div>
  )
}

const Page = ({ children }: { children: ReactNode }) => (
  <section className="flex w-full shrink-0 snap-center snap-always flex-col items-center overflow-y-auto px-6 pb-4 pt-6 text-center">{children}</section>
)

const Feature = ({ icon, children }: { icon: string; children: ReactNode }) => (
  <li className="flex items-center gap-4">
    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon d={icon} className="h-5 w-5" /></span>
    <span className="text-[15px] leading-snug">{children}</span>
  </li>
)

const Option = ({ icon, title, sub, children }: { icon: string; title: string; sub: string; children?: ReactNode }) => (
  <div className="rounded-2xl border border-line bg-surface p-4">
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon d={icon} className="h-5 w-5" /></span>
      <div><p className="font-semibold">{title}</p><p className="mt-0.5 text-sm leading-snug text-muted">{sub}</p></div>
    </div>
    {children}
  </div>
)

function Starters({ onAdd }: { onAdd: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  return (
    <Option icon={I.list} title="Starter routines" sub="Ready-made days picked for your goals. Edit or delete them any time.">
      <button className={`btn-ghost mt-3 w-full ${state === 'busy' ? 'busy' : ''}`} disabled={state !== 'idle'}
        onClick={async () => { setState('busy'); try { await onAdd(); setState('done') } catch { setState('idle') } }}>
        {state === 'done' ? <><Icon d="M20 6 9 17l-5-5" className="h-4 w-4 text-good" />Added</> : 'Add starter routines'}
      </button>
    </Option>
  )
}

function StravaHistory({ configured, onFile }: { configured?: boolean; onFile: (f: File) => Promise<string> }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Option icon={I.file} title="Bring in your Strava history" sub="Every run, ride and gym session you've recorded. Strava keeps times and distances, not sets, so gym sessions come in as their time.">
      {configured && <a className="btn mt-3 w-full bg-strava" href="/api/strava/connect">Connect Strava</a>}
      <button className="mt-3 flex min-h-11 w-full items-center justify-between text-sm font-medium text-accent" aria-expanded={open} onClick={() => setOpen(!open)}>
        {configured ? 'Or import your Strava download' : 'How to get it'} <span className={`transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>On strava.com (a browser, not the app): Settings → My Account.</li>
          <li>Under Download or Delete Your Account, tap Get Started, then Request Your Archive.</li>
          <li>Strava emails a link, usually within a few hours. Download the zip.</li>
          <li>Open the zip (on iPhone, tap it in Files) and pick <b className="text-ink">activities.csv</b> below.</li>
        </ol>
      )}
      <label className={`btn-ghost mt-3 w-full cursor-pointer ${busy ? 'busy' : ''}`}>
        Choose activities.csv
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          try { setMsg({ ok: true, text: await onFile(f) }) } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }) } finally { setBusy(false) }
        }} />
      </label>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
    </Option>
  )
}

/** A looping, made-up logger: three sets tick, the last one's a PB, and a chart climbs. Hidden motion under reduced motion. */
function Demo() {
  const rows = [['60 kg', '8'], ['62.5 kg', '8'], ['65 kg', '6']]
  return (
    <div className="mt-8 w-full rounded-2xl border border-line bg-surface p-4 text-left">
      <div className="flex items-center justify-between"><p className="font-semibold">Bench Press</p><p className="text-xs text-muted">Rest 1:30</p></div>
      <div className="mt-3 space-y-2">
        {rows.map(([kg, reps], i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_2.75rem] items-center gap-2 text-sm">
            <span className="text-center text-muted">{i + 1}</span>
            <span className="rounded-xl bg-surface-2 py-2.5 text-center">{kg}</span>
            <span className="rounded-xl bg-surface-2 py-2.5 text-center">{reps}</span>
            <span className="relative grid h-10 place-items-center rounded-xl bg-surface-2 font-bold text-muted demo-tick" style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              ✓{i === 2 && <span className="demo-pb absolute -right-1 -top-2 text-sm">🏆</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-20 items-end gap-2" aria-hidden>
        {[30, 38, 35, 48, 55, 70].map((h, i) => (
          <span key={i} className="demo-bar flex-1 origin-bottom rounded-t-md bg-linear-to-t from-accent to-accent-2" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  )
}
