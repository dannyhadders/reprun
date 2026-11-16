import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { targetText } from '../../shared/plan'
import { Planner } from '../components/Planner'
import type { ImportWorkout, Muscle } from '../../shared/types'
import { useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { clock, duration, num, plural } from '../lib/format'
import { beep, flush, loadActive, newExercise, outbox, queue, rememberRest, saveActive, toImport, totals, unlockAudio, type Active } from '../lib/session'
import { MUSCLES } from '../lib/stats'

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]
type Upload = { state: 'sending' | 'sent' | 'queued'; error?: string }

export default function Log() {
  const { reload } = useData()
  const [active, setActiveRaw] = useState(loadActive)
  const [finished, setFinished] = useState<ImportWorkout | null>(null)
  const [upload, setUpload] = useState<Upload | null>(null)
  const [pending, setPending] = useState(() => outbox().length)
  const setActive = (a: Active | null) => (saveActive(a), setActiveRaw(a))

  const send = async () => {
    setUpload({ state: 'sending' })
    const r = await flush()
    setPending(outbox().length)
    setUpload(r.error ? { state: 'queued', error: r.error } : { state: 'sent' })
    if (r.sent) await reload()
  }

  // Anything finished offline goes up as soon as there's signal.
  useEffect(() => {
    const retry = async () => {
      if (!outbox().length) return
      const r = await flush()
      setPending(outbox().length)
      if (r.sent) await reload()
    }
    void retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [reload])

  const finish = (a: Active) => {
    if (!totals(a).sets) return confirm('No sets ticked off. Discard this workout?') && setActive(null)
    const w = toImport(a)
    queue(w)
    setActive(null)
    setFinished(w)
    void send()
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-40 pt-[max(1rem,env(safe-area-inset-top))]">
      {finished ? <Summary w={finished} upload={upload} retry={send} done={() => (setFinished(null), setUpload(null))} />
        : active ? <Workout a={active} set={setActive} finish={() => finish(active)} />
        : <Planner begin={setActive}>{pending > 0 && <Outbox n={pending} upload={upload} retry={send} />}</Planner>}
    </div>
  )
}

function Outbox({ n, upload, retry }: { n: number; upload: Upload | null; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-pb/40 bg-pb/10 p-4 text-sm">
      <p>{plural(n, 'workout')} saved on this phone, not uploaded yet.</p>
      {upload?.error && <p className="mt-1 text-muted">Last try: {upload.error}. No signal, or your sign-in expired.</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" disabled={upload?.state === 'sending'} onClick={retry}>{upload?.state === 'sending' ? 'Uploading…' : 'Try again'}</button>
        {/* A full page load goes through Cloudflare Access, which is how an expired session gets renewed. */}
        <a className="btn-ghost" href="/">Sign in again</a>
      </div>
    </div>
  )
}

function Workout({ a, set, finish }: { a: Active; set: (a: Active | null) => void; finish: () => void }) {
  const { data, model } = useData()
  const [now, setNow] = useState(Date.now)
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<Muscle>('other')
  const update = (f: (x: Active) => void) => {
    const next = structuredClone(a)
    f(next)
    set(next)
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Keep the screen on for the whole workout, so the rest timer stays visible and audible.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const grab = () => void (document.visibilityState === 'visible' && navigator.wakeLock?.request('screen').then(l => (lock = l)).catch(() => {}))
    grab()
    document.addEventListener('visibilitychange', grab)
    return () => (document.removeEventListener('visibilitychange', grab), void lock?.release())
  }, [])

  // Rest over: beep and clear. A negative delay (app reopened after the rest ended) fires straight away.
  useEffect(() => {
    if (!a.restEndsAt) return
    const t = setTimeout(() => (beep(), update(x => (x.restEndsAt = null))), a.restEndsAt - Date.now())
    return () => clearTimeout(t)
  })

  const known = data.exercises.find(e => e.name.toLowerCase() === name.trim().toLowerCase())
  const isNew = name.trim() && !known && newExercise(name).muscle === 'other'
  const previous = (exName: string) => {
    const id = data.exercises.find(e => e.name === exName)?.id
    return (id && model.exHistory.get(id)?.at(-1)?.sets) || []
  }
  const t = totals(a)

  return (
    <div className="space-y-4">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-lg font-bold outline-none placeholder:text-ink" placeholder="Workout" value={a.title} onChange={e => update(x => (x.title = e.target.value))} aria-label="Workout name" />
          <p className="text-sm tabular-nums text-muted">{clock((now - a.startedAt) / 1000)} · {plural(t.sets, 'set')} · {num(t.volume)} kg</p>
        </div>
        <button className="relative btn" onClick={finish}><Tap />Finish</button>
      </header>

      {a.exercises.map((ex, i) => {
        const prev = previous(ex.name)
        return (
          <section key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate font-semibold">{ex.name}</h2>
              <select className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted" aria-label="Rest between sets" value={ex.restS}
                onChange={e => (rememberRest(ex.name, +e.target.value), update(x => (x.exercises[i].restS = +e.target.value)))}>
                {[...new Set([...RESTS, ex.restS])].sort((x, y) => x - y).map(s => <option key={s} value={s}>Rest {clock(s)}</option>)}
              </select>
              <button className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={() => confirm(`Remove ${ex.name}?`) && update(x => void x.exercises.splice(i, 1))}>✕</button>
            </div>
            {ex.target && (
              <p className="-mt-2 mb-3 text-xs text-muted">
                Plan {targetText(ex.target)}{ex.suggest ? ` · today ${ex.suggest.weight ? `${ex.suggest.weight} kg` : 'BW'} × ${ex.suggest.reps}` : ''}{ex.target.note ? ` · ${ex.target.note}` : ''}
              </p>
            )}
            <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4.5rem_2.75rem] items-center gap-2 text-sm">
              <span className="text-xs text-muted">Set</span><span className="text-xs text-muted">Last time</span><span className="text-xs text-muted">kg</span><span className="text-xs text-muted">Reps</span><span />
              {ex.sets.map((s, j) => {
                const p = prev[j] ?? prev.at(-1)
                // What an empty set means when ticked: today's suggestion if this came from a routine, else last time.
                const hint = ex.suggest ?? { weight: p?.weight_kg?.toString() ?? '', reps: p?.reps?.toString() ?? '' }
                return [
                  <span key={`n${j}`} className="text-center text-muted">{j + 1}</span>,
                  <span key={`p${j}`} className="truncate text-muted">{p ? `${p.weight_kg ?? 'BW'} × ${p.reps ?? '–'}` : '–'}</span>,
                  <input key={`w${j}`} className="input px-2 text-center" type="number" min="0" step="0.5" inputMode="decimal" aria-label={`Set ${j + 1} kg`} placeholder={hint.weight || 'BW'} value={s.weight} onChange={e => update(x => (x.exercises[i].sets[j].weight = e.target.value))} />,
                  <input key={`r${j}`} className="input px-2 text-center" type="number" min="1" inputMode="numeric" aria-label={`Set ${j + 1} reps`} placeholder={hint.reps} value={s.reps} onChange={e => update(x => (x.exercises[i].sets[j].reps = e.target.value))} />,
                  <button key={`d${j}`} aria-label={`Set ${j + 1} done`} aria-pressed={s.done}
                    className={`relative h-10 rounded-xl text-lg font-bold transition ${s.done ? 'bg-good text-bg' : 'bg-surface-2 text-muted'}`}
                    onClick={() => {
                      unlockAudio()
                      update(x => {
                        const y = x.exercises[i].sets[j]
                        // Hevy-style: ticking an empty set takes the placeholder numbers.
                        if (!y.done && y.reps === '' && hint.reps) y.reps = hint.reps
                        if (!y.done && y.weight === '' && hint.weight) y.weight = hint.weight
                        y.done = !y.done
                        x.restEndsAt = y.done ? Date.now() + ex.restS * 1000 : x.restEndsAt
                      })
                    }}><Tap />✓</button>,
                ]
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => update(x => void x.exercises[i].sets.push({ ...ex.sets[ex.sets.length - 1], done: false }))}>+ Set</button>
              {ex.sets.length > 1 && <button className="btn-ghost" aria-label="Remove last set" onClick={() => update(x => void x.exercises[i].sets.pop())}>− Set</button>}
            </div>
          </section>
        )
      })}

      <form className="space-y-2 rounded-2xl border border-dashed border-line p-4" onSubmit={e => {
        e.preventDefault()
        if (!name.trim()) return
        update(x => void x.exercises.push(newExercise(known?.name ?? name, known?.muscle ?? (isNew ? muscle : undefined))))
        setName('')
      }}>
        <div className="flex gap-2">
          <input className="input" list="log-exercises" placeholder="Add exercise" value={name} onChange={e => setName(e.target.value)} aria-label="Exercise name" />
          <button className="btn" disabled={!name.trim()}>Add</button>
        </div>
        {isNew && (
          <label className="flex items-center gap-2 text-sm text-muted">New exercise, works
            <select className="input w-auto" value={muscle} onChange={e => setMuscle(e.target.value as Muscle)}>
              {[...MUSCLES, 'other' as const].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
        <datalist id="log-exercises">{data.exercises.map(e => <option key={e.id} value={e.name} />)}</datalist>
      </form>

      <button className="w-full py-3 text-sm text-bad" onClick={() => confirm('Discard this workout? Nothing will be saved.') && set(null)}>Discard workout</button>

      {a.restEndsAt && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <span className="flex-1 text-3xl font-bold tabular-nums">{clock(Math.max(0, (a.restEndsAt - now) / 1000))}</span>
            <button className="btn-ghost" onClick={() => update(x => (x.restEndsAt = x.restEndsAt! - 15_000))}>−15</button>
            <button className="btn-ghost" onClick={() => update(x => (x.restEndsAt = x.restEndsAt! + 15_000))}>+15</button>
            <button className="btn" onClick={() => update(x => (x.restEndsAt = null))}>Skip</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Summary({ w, upload, retry, done }: { w: ImportWorkout; upload: Upload | null; retry: () => void; done: () => void }) {
  const { model } = useData()
  const nav = useNavigate()
  const pbs = model.sessions.find(s => s.workout?.client_id === w.client_id)?.pbs ?? 0
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  return (
    <div className="space-y-5 pt-10 text-center">
      <p className="text-5xl">💪</p>
      <h1 className="text-3xl font-bold tracking-tight">{w.title || 'Workout'} done</h1>
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-line bg-surface p-4">
        <div><div className="text-xl font-bold">{duration(w.duration_s)}</div><div className="text-xs text-muted">Time</div></div>
        <div><div className="text-xl font-bold">{w.sets.length}</div><div className="text-xs text-muted">Sets</div></div>
        <div><div className="text-xl font-bold">{num(volume)} kg</div><div className="text-xs text-muted">Volume</div></div>
      </div>
      {pbs > 0 && <p className="font-semibold text-pb">🏆 {plural(pbs, 'PB')}</p>}
      {upload?.state === 'queued' ? <Outbox n={outbox().length} upload={upload} retry={retry} /> : <p className="text-sm text-muted">{upload?.state === 'sent' ? 'Uploaded.' : 'Uploading…'}</p>}
      <button className="btn w-full" onClick={() => (done(), nav('/workouts'))}>Done</button>
    </div>
  )
}
