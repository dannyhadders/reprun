import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { targetText } from '../../shared/plan'
import { Outbox } from '../components/Layout'
import { Planner } from '../components/Planner'
import { BackupNudge } from '../components/PhoneOnly'
import { LOCAL } from '../lib/local'
import type { ImportWorkout, Muscle, WorkoutSet } from '../../shared/types'
import { useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { ago, clock, duration, num, plural, setText, workoutText } from '../lib/format'
import { CopyButton } from '../components/ui'
import { beep, loadActive, newExercise, queue, rememberRest, saveActive, toImport, totals, unlockAudio, useNow, type Active } from '../lib/session'
import { lastSets, MUSCLES } from '../lib/stats'

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]

export default function Log() {
  const { sync } = useData()
  const [active, setActiveRaw] = useState(loadActive)
  const [finished, setFinished] = useState<ImportWorkout | null>(null)
  const setActive = (a: Active | null) => (saveActive(a), setActiveRaw(a))

  const finish = (a: Active) => {
    if (!totals(a).sets) return confirm('No sets ticked off. Discard this workout?') && setActive(null)
    const w = toImport(a)
    queue(w)
    setActive(null)
    setFinished(w)
    void sync()
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-40 pt-[max(1rem,env(safe-area-inset-top))]">
      {finished ? <Summary w={finished} done={() => setFinished(null)} />
        : active ? <Workout a={active} set={setActive} finish={() => finish(active)} />
        : <Planner begin={setActive}><Outbox /></Planner>}
    </div>
  )
}

function Workout({ a, set, finish }: { a: Active; set: (a: Active | null) => void; finish: () => void }) {
  const { data, model } = useData()
  const now = useNow()
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<Muscle>('other')
  const update = (f: (x: Active) => void) => {
    const next = structuredClone(a)
    f(next)
    set(next)
  }


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
  const t = totals(a)
  const add = (n: string, m?: Muscle) => (update(x => void x.exercises.push(newExercise(n, m))), setName(''))
  // Search as you type: what you've logged, most recently done first.
  const q = name.trim().toLowerCase()
  const matches = q ? data.exercises.filter(e => e.name.toLowerCase().includes(q))
    .map(e => ({ e, hist: model.exHistory.get(e.id) ?? [] }))
    .sort((x, y) => (y.hist.at(-1)?.date ?? '').localeCompare(x.hist.at(-1)?.date ?? ''))
    .slice(0, 6) : []

  return (
    <div className="space-y-4">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        {/* The workout stays saved on the phone; a bar on every page brings you back. */}
        <Link to="/" className="icon-btn -ml-2 text-xl" aria-label="Back to the menu, workout keeps running">‹</Link>
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-lg font-bold outline-none placeholder:text-ink" placeholder="Workout" value={a.title} onChange={e => update(x => (x.title = e.target.value))} aria-label="Workout name" />
          <p className="text-sm tabular-nums text-muted">{clock((now - a.startedAt) / 1000)} · {plural(t.sets, 'set')} · {num(t.volume)} kg</p>
        </div>
        <button className="relative btn" onClick={finish}><Tap />Finish</button>
      </header>

      {a.exercises.map((ex, i) => {
        const prev = lastSets(model, ex.name)
        const done = ex.sets.filter(s => s.done).length
        return (
          <section key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className={`flex items-center gap-2 ${ex.collapsed ? '' : 'mb-3'}`}>
              <button className="relative flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={!ex.collapsed} onClick={() => update(x => void (x.exercises[i].collapsed = !ex.collapsed))}>
                <Tap />
                <span className={`text-muted transition ${ex.collapsed ? '-rotate-90' : ''}`}>▾</span>
                <h2 className="min-w-0 truncate font-semibold">{ex.name}</h2>
                <span className={`shrink-0 text-xs tabular-nums ${done === ex.sets.length ? 'text-good' : 'text-muted'}`}>{done}/{ex.sets.length}{done === ex.sets.length ? ' ✓' : ''}</span>
              </button>
              <select className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted" aria-label="Rest between sets" value={ex.restS}
                onChange={e => (rememberRest(ex.name, +e.target.value), update(x => (x.exercises[i].restS = +e.target.value)))}>
                {[...new Set([...RESTS, ex.restS])].sort((x, y) => x - y).map(s => <option key={s} value={s}>Rest {clock(s)}</option>)}
              </select>
              <button className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={() => confirm(`Remove ${ex.name}?`) && update(x => void x.exercises.splice(i, 1))}>✕</button>
            </div>
            {!ex.collapsed && <>
            {ex.target && (
              <p className="-mt-2 mb-3 text-xs text-muted">
                Plan {targetText(ex.target)}{ex.suggest ? ex.suggest.fresh ? ' · first time: enter a weight, or leave it blank for bodyweight' : ` · today ${ex.suggest.weight ? `${ex.suggest.weight} kg` : 'BW'} × ${ex.suggest.reps}` : ''}{ex.target.note ? ` · ${ex.target.note}` : ''}
              </p>
            )}
            <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4.5rem_2.75rem] items-center gap-2 text-sm">
              <span className="text-xs text-muted">Set</span><span className="text-xs text-muted">Last time</span><span className="text-xs text-muted">kg</span><span className="text-xs text-muted">Reps</span><span />
              {ex.sets.map((s, j) => {
                const p = prev[j] ?? prev.at(-1)
                // What an empty set means when ticked: today's suggestion if this came from a routine, else last time.
                const hint = ex.suggest ?? { weight: p?.weight_kg?.toString() ?? '', reps: p?.reps?.toString() ?? '' }
                return [
                  // Tap the set number for a note on that set.
                  <button key={`n${j}`} className="relative text-center text-muted" aria-label={`Note for set ${j + 1}`}
                    onClick={() => update(x => void (x.exercises[i].sets[j].note = s.note === undefined ? '' : s.note ? s.note : undefined))}>
                    {j + 1}{s.note ? <span className="absolute -right-0.5 top-0 size-1.5 rounded-full bg-accent" /> : null}
                  </button>,
                  <span key={`p${j}`} className="truncate text-muted">{p ? setText(p) : '–'}</span>,
                  <input key={`w${j}`} className="input px-2 text-center" type="number" min="0" step="0.5" inputMode="decimal" aria-label={`Set ${j + 1} kg`} placeholder={hint.weight || (ex.suggest?.fresh ? 'kg' : 'BW')} value={s.weight} onChange={e => update(x => (x.exercises[i].sets[j].weight = e.target.value))} />,
                  <input key={`r${j}`} className="input px-2 text-center" type="number" min="1" inputMode="numeric" aria-label={`Set ${j + 1} reps`} placeholder={hint.reps} value={s.reps} onChange={e => update(x => (x.exercises[i].sets[j].reps = e.target.value))} />,
                  <button key={`d${j}`} aria-label={`Set ${j + 1} done`} aria-pressed={s.done}
                    className={`relative h-10 rounded-xl text-lg font-bold transition ${s.done ? 'bg-good text-bg' : 'bg-surface-2 text-muted'}`}
                    onClick={() => {
                      unlockAudio()
                      // First time with no weight in the plan: a blank weight would save as bodyweight, so ask once.
                      if (!s.done && s.weight === '' && ex.suggest?.fresh && !confirm(`No weight entered for ${ex.name}. Log it as bodyweight?`)) return
                      update(x => {
                        if (x.exercises[i].suggest) x.exercises[i].suggest.fresh = false // asked once is enough
                        const y = x.exercises[i].sets[j]
                        // Hevy-style: ticking an empty set takes the placeholder numbers.
                        if (!y.done && y.reps === '' && hint.reps) y.reps = hint.reps
                        if (!y.done && y.weight === '' && hint.weight) y.weight = hint.weight
                        y.done = !y.done
                        x.restEndsAt = y.done ? Date.now() + ex.restS * 1000 : x.restEndsAt
                      })
                    }}><Tap />✓</button>,
                  s.note !== undefined && (
                    <input key={`t${j}`} className="input col-span-5 py-1.5" placeholder={`Note for set ${j + 1}, e.g. felt easy, left shoulder`} aria-label={`Set ${j + 1} note`}
                      autoFocus={!s.note} value={s.note} onChange={e => update(x => void (x.exercises[i].sets[j].note = e.target.value))} />
                  ),
                ]
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => update(x => void x.exercises[i].sets.push({ ...ex.sets[ex.sets.length - 1], done: false, note: undefined }))}>+ Set</button>
              {ex.sets.length > 1 && <button className="btn-ghost" aria-label="Remove last set" onClick={() => {
                const last = ex.sets[ex.sets.length - 1]
                if ((last.done || last.reps || last.weight || last.note) && !confirm(`Remove set ${ex.sets.length} of ${ex.name}? It has data in it.`)) return
                update(x => void x.exercises[i].sets.pop())
              }}>− Set</button>}
            </div>
            </>}
          </section>
        )
      })}

      <form className="space-y-2 rounded-2xl border border-dashed border-line p-4" onSubmit={e => {
        e.preventDefault()
        if (name.trim()) add(known?.name ?? name, known?.muscle ?? (isNew ? muscle : undefined))
      }}>
        <div className="flex gap-2">
          <input className="input" placeholder="Add exercise" value={name} onChange={e => setName(e.target.value)} aria-label="Exercise name" autoComplete="off" />
          <button className="btn" disabled={!name.trim()}>Add</button>
        </div>
        {matches.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2" aria-label="Matching exercises">
            {matches.map(({ e, hist }) => {
              const last = hist.at(-1)
              const best = heaviest(hist.flatMap(h => h.sets))
              return (
                <li key={e.id}>
                  <button type="button" className="relative w-full px-3 py-2.5 text-left" onClick={() => add(e.name, e.muscle)}>
                    <Tap />
                    <span className="block font-medium">{e.name}</span>
                    <span className="block text-xs text-muted">
                      {last ? <>Last {ago(last.date).toLowerCase()}: {setText(heaviest(last.sets)!)}</> : 'Not done yet'}
                      {best && <> · Best {setText(best)}</>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {isNew && (
          <label className="flex items-center gap-2 text-sm text-muted">New exercise, works
            <select className="input w-auto" value={muscle} onChange={e => setMuscle(e.target.value as Muscle)}>
              {[...MUSCLES, 'other' as const].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </form>

      <textarea className="input min-h-20" placeholder="Workout notes: how it felt, sleep, anything for next time" aria-label="Workout notes"
        value={a.notes ?? ''} onChange={e => update(x => void (x.notes = e.target.value))} />

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

function Summary({ w, done }: { w: ImportWorkout; done: () => void }) {
  const { model, pending } = useData()
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
      {pending ? <Outbox /> : LOCAL ? <BackupNudge /> : <p className="text-sm text-muted">Uploaded.</p>}
      <CopyButton className="btn-ghost w-full" label="Copy workout as text" text={() => workoutText(w)} />
      <button className="btn w-full" onClick={() => (done(), nav('/workouts'))}>Done</button>
    </div>
  )
}

const heaviest = (sets: WorkoutSet[]) => sets.reduce<WorkoutSet | null>((b, s) => (!b || (s.weight_kg ?? 0) > (b.weight_kg ?? 0) || ((s.weight_kg ?? 0) === (b.weight_kg ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b), null)
