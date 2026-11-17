import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { targetText } from '../../shared/plan'
import { Outbox } from '../components/Layout'
import { Planner } from '../components/Planner'
import { BackupNudge } from '../components/PhoneOnly'
import { LOCAL } from '../lib/local'
import type { ImportWorkout, Muscle, WorkoutSet } from '../../shared/types'
import { useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { ago, clock, duration, EFFORT, effort, kg, num, plural, setText, workoutText } from '../lib/format'
import { ask, Burst, CopyButton, Empty, Icon, PbBadge, ShareButton, Sheet, useCountUp } from '../components/ui'
import { Chart, sparkConfig } from '../components/Chart'
import { workoutLine } from '../lib/motivation'
import { beep, loadActive, matchExercise, newExercise, queue, rememberRest, saveActive, toImport, totals, unlockAudio, useNow, type Active } from '../lib/session'
import { e1rm, lastSets, livePb, MUSCLES, type ExerciseSession } from '../lib/stats'

let foldTimer = 0 // ponytail: module-level, there's only ever one logger
const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]

export default function Log() {
  const { sync } = useData()
  const [active, setActiveRaw] = useState(loadActive)
  const [finished, setFinished] = useState<ImportWorkout | null>(null)
  const setActive = (a: Active | null) => (saveActive(a), setActiveRaw(a))

  const finish = (a: Active) => {
    if (!totals(a).sets) return void ask('No sets ticked off. Discard this workout?', 'Discard', true).then(ok => ok && setActive(null))
    const w = toImport(a)
    queue(w)
    setActive(null)
    setFinished(w)
    void sync()
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl animate-fade-in px-4 pb-40 pt-[max(1rem,env(safe-area-inset-top))]">
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
    // From storage, not the render's `a`: after an awaited "Are you sure?" the rest timer may have changed it meanwhile.
    // Nothing there (finished or discarded meanwhile) or a different workout: leave it, never bring an old one back.
    const cur = loadActive()
    if (cur?.clientId !== a.clientId) return
    const next = structuredClone(cur)
    f(next)
    set(next)
  }
  // After a confirmed remove, Undo stays up for a few seconds in case it was the wrong one.
  const [undo, setUndo] = useState<{ msg: string; put: (x: Active) => void } | null>(null)
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 5000)
    return () => clearTimeout(t)
  }, [undo])
  // The set just ticked (it pops) and whether that finished the exercise (it bursts). Set by the tap, so reopening the logger doesn't replay it.
  const [fx, setFx] = useState<{ i: number; j: number; all: boolean; t: number } | null>(null)
  useEffect(() => () => clearTimeout(foldTimer), []) // logger closed first: don't fold or scroll anything
  const [peek, setPeek] = useState<string | null>(null) // exercise whose history sheet is open
  const closePeek = useCallback(() => setPeek(null), [])


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

  const known = name.trim() ? matchExercise(name, data.exercises, data.aliases) : null // follows renames, merges and the catalogue
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
          <p className="text-sm tabular-nums text-muted">{clock((now - a.startedAt) / 1000)} · <span key={t.sets} className="inline-block animate-bump">{plural(t.sets, 'set')}</span> · {num(t.volume)} kg</p>
        </div>
        <button className="relative btn" onClick={finish}><Tap />Finish</button>
      </header>

      {a.exercises.map((ex, i) => {
        const prev = lastSets(model, ex.name)
        const history = model.exHistory.get(matchExercise(ex.name, data.exercises, data.aliases)?.id ?? -1) ?? []
        // Any set, from − Set (the last) or a swipe (any). Asks first when it has data in it; Undo after.
        const removeSet = async (j: number) => {
          const s = ex.sets[j]
          if ((s.done || s.reps || s.weight || s.note) && !await ask(`Remove set ${j + 1} of ${ex.name}? It has data in it.`, 'Remove', true)) return
          update(x => void x.exercises[i].sets.splice(j, 1))
          setFx(null)
          // ponytail: put back by name, so removing an exercise above it first can't land it on the wrong one. Same name twice: first wins.
          setUndo({ msg: `Removed set ${j + 1} of ${ex.name}`, put: x => void x.exercises.find(e => e.name === ex.name)?.sets.splice(j, 0, s) })
        }
        const pbAt = livePb(history, ex.sets.map(s => ({ weight_kg: s.weight === '' ? null : +s.weight, reps: s.reps === '' ? null : +s.reps, done: s.done })))
        const done = ex.sets.filter(s => s.done).length
        const toggle = () => update(x => void (x.exercises[i].collapsed = !ex.collapsed))
        return (
          // Folded, the whole card opens it; open, the whole header row folds it. The rest picker and ✕ keep their own taps.
          <section key={i} className={`rounded-2xl border border-line bg-surface p-4 ${ex.collapsed ? 'row-press cursor-pointer' : ''}`} onClick={ex.collapsed ? toggle : undefined}>
            {/* Press and hold the name for this exercise's history; a plain tap folds it. */}
            <div className="flex cursor-pointer items-center gap-2" onClick={e => {
              e.stopPropagation() // the card's own handler would undo it
              toggle()
            }}>
              {/* Only the name holds: holding ✕ or the rest picker mustn't open history too. */}
              <button className="relative flex min-w-0 flex-1 select-none items-center gap-2 text-left [-webkit-touch-callout:none]" aria-expanded={!ex.collapsed} {...hold(() => setPeek(ex.name))}>
                <Tap />
                <span className={`text-muted transition duration-300 ${ex.collapsed ? '-rotate-90' : ''}`}>▾</span>
                <h2 className="min-w-0 truncate font-semibold">{ex.name}</h2>
                <span key={done} className={`relative inline-block shrink-0 animate-bump text-xs tabular-nums ${done === ex.sets.length ? 'text-good' : 'text-muted'}`}>
                  {done}/{ex.sets.length}
                  {fx?.all && fx.i === i && <Burst key={fx.t} />}
                </span>
              </button>
              {/* Finished: no rest picker and no ✕, just a green tick on the right so it reads as done at a glance. */}
              {done < ex.sets.length && <select onClick={e => e.stopPropagation()} className="min-h-11 rounded-lg bg-surface-2 px-2 text-xs text-muted" aria-label="Rest between sets" value={ex.restS}
                onChange={e => (rememberRest(ex.name, +e.target.value), update(x => (x.exercises[i].restS = +e.target.value)))}>
                {[...new Set([...RESTS, ex.restS])].sort((x, y) => x - y).map(s => <option key={s} value={s}>Rest {clock(s)}</option>)}
              </select>}
              {done < ex.sets.length ? <button className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={async e => {
                e.stopPropagation()
                if (!await ask(`Remove ${ex.name} from this workout?${done ? ` Its ${plural(done, 'ticked set')} go too.` : ''}`, 'Remove', true)) return
                update(x => void x.exercises.splice(i, 1))
                setFx(null) // indices shift: don't let the pop land on another exercise
                setUndo({ msg: `Removed ${ex.name}`, put: x => void x.exercises.splice(Math.min(i, x.exercises.length), 0, ex) })
              }}>✕</button> : (
                <span className="grid size-11 shrink-0 animate-pop place-items-center rounded-full text-good" role="img" aria-label={`${ex.name} done`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              )}
            </div>
            {ex.sets.length > 0 && done === ex.sets.length && (
              // Rated once it's done, and still there folded. Holds next time's weight when it was hard (shared/plan.ts).
              <div className="mt-2 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <span className="mr-0.5 shrink-0 text-xs text-muted">Effort</span>
                {EFFORT.map(f => {
                  const on = ex.rpe === f.rpe
                  return (
                    <button key={f.rpe} type="button" aria-pressed={on} onClick={() => update(x => void (x.exercises[i].rpe = on ? undefined : f.rpe))}
                      className={`press relative min-h-9 min-w-0 flex-1 whitespace-nowrap rounded-full border px-1 text-xs font-medium ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted'}`}>
                      <Tap />{f.emoji} {f.label}
                    </button>
                  )
                })}
              </div>
            )}
            {/* Folds by animating the row from 1fr to 0fr, so it slides shut instead of snapping. The sets stay mounted
                (inert while folded); the side padding gives the ✓ pop room inside the clip. */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${ex.collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`} inert={ex.collapsed}>
            {/* No vertical padding on the clipping box: padding can't shrink to 0fr, and a strip of the first row showed. */}
            <div className="-mx-2 min-h-0 overflow-hidden px-2">
            <div className="pt-3">
            {ex.target && (
              <p className="-mt-2 mb-3 text-xs text-muted">
                Plan {targetText(ex.target)}{ex.suggest ? ex.suggest.fresh ? ' · first time: enter a weight, or leave it blank for bodyweight' : ` · today ${ex.suggest.weight ? `${ex.suggest.weight} kg` : 'BW'} × ${ex.suggest.reps}${ex.suggest.held ? ', same weight: last time felt hard' : ''}` : ''}{ex.target.note ? ` · ${ex.target.note}` : ''}
              </p>
            )}
            <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4.5rem_2.75rem] items-center gap-2 text-sm">
              <span className="text-xs text-muted">Set</span><button type="button" className="-my-2 py-2 text-left text-xs text-muted underline decoration-dotted underline-offset-4" onClick={() => setPeek(ex.name)}>Last time</button><span className="text-xs text-muted">kg</span><span className="text-xs text-muted">Reps</span><span />
              {ex.sets.map((s, j) => {
                const p = prev[j] ?? prev.at(-1)
                // What an empty set means when ticked: today's suggestion if this came from a routine, else last time.
                const hint = ex.suggest ?? { weight: p?.weight_kg?.toString() ?? '', reps: p?.reps?.toString() ?? '' }
                return [
                  <SwipeRow key={`row${j}`} onDelete={ex.sets.length > 1 ? () => void removeSet(j) : undefined}>
                  {/* Tap the set number for a note on that set. */}
                  <button className="relative min-h-11 text-center text-muted" aria-label={`Note for set ${j + 1}`}
                    onClick={() => update(x => void (x.exercises[i].sets[j].note = s.note === undefined ? '' : s.note ? s.note : undefined))}>
                    {j + 1}{s.note ? <span className="absolute -right-0.5 top-0 size-1.5 rounded-full bg-accent" /> : null}
                  </button>
                  <span className="truncate text-muted">{p ? setText(p) : '–'}</span>
                  <input className={`input h-11 px-2 text-center ${s.done ? 'border-good/30 text-muted' : ''}`} type="number" min="0" step="0.5" inputMode="decimal" aria-label={`Set ${j + 1} kg`} placeholder={hint.weight || (ex.suggest?.fresh ? 'kg' : 'BW')} value={s.weight} onChange={e => update(x => (x.exercises[i].sets[j].weight = e.target.value))} />
                  <input className={`input h-11 px-2 text-center ${s.done ? 'border-good/30 text-muted' : ''}`} type="number" min="1" inputMode="numeric" aria-label={`Set ${j + 1} reps`} placeholder={hint.reps} value={s.reps} onChange={e => update(x => (x.exercises[i].sets[j].reps = e.target.value))} />
                  <button aria-label={`Set ${j + 1} done`} aria-pressed={s.done}
                    className={`press relative h-11 rounded-xl text-lg font-bold ${s.done ? 'bg-good text-bg' : 'bg-surface-2 text-muted'} ${s.done && fx?.i === i && fx.j === j ? 'animate-pop' : ''}`}
                    onClick={async () => {
                      unlockAudio()
                      // First time with no weight in the plan: a blank weight would save as bodyweight, so ask once.
                      if (!s.done && s.weight === '' && ex.suggest?.fresh && !await ask(`No weight entered for ${ex.name}. Log it as bodyweight?`, 'Bodyweight')) return
                      const all = !s.done && done + 1 === ex.sets.length
                      setFx(s.done ? null : { i, j, all, t: Date.now() })
                      if (all) {
                        navigator.vibrate?.([15, 60, 15])
                        // Let the burst play, then fold this one away. No scrolling: the page stays where you are.
                        clearTimeout(foldTimer)
                        foldTimer = window.setTimeout(() => {
                          update(x => void (x.exercises[i]?.sets.every(z => z.done) && (x.exercises[i].collapsed = true))) // unticked meanwhile: leave it open
                        }, 700)
                      }
                      update(x => {
                        if (x.exercises[i].suggest) x.exercises[i].suggest.fresh = false // asked once is enough
                        const y = x.exercises[i].sets[j]
                        // Hevy-style: ticking an empty set takes the placeholder numbers.
                        if (!y.done && y.reps === '' && hint.reps) y.reps = hint.reps
                        if (!y.done && y.weight === '' && hint.weight) y.weight = hint.weight
                        y.done = !y.done
                        // Last set of the whole workout: nothing left to rest for.
                        const finished = x.exercises.every(e => e.sets.every(z => z.done))
                        x.restEndsAt = finished ? null : y.done ? Date.now() + ex.restS * 1000 : x.restEndsAt
                        if (y.done) x.restFrom = Date.now()
                      })
                    }}><Tap />✓{j === pbAt && <span className="absolute right-0.5 top-0 animate-pop text-xs" role="img" aria-label="PB">🏆</span>}</button>
                  </SwipeRow>,
                  s.note !== undefined && (
                    <input key={`t${j}`} className="input col-span-5 py-2" placeholder={`Note for set ${j + 1}, e.g. felt easy, left shoulder`} aria-label={`Set ${j + 1} note`}
                      autoFocus={!s.note} value={s.note} onChange={e => update(x => void (x.exercises[i].sets[j].note = e.target.value))} />
                  ),
                ]
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => update(x => void x.exercises[i].sets.push({ ...ex.sets[ex.sets.length - 1], done: false, note: undefined }))}>+ Set</button>
              {ex.sets.length > 1 && <button className="btn-ghost" aria-label="Remove last set" onClick={() => void removeSet(ex.sets.length - 1)}>− Set</button>}
            </div>
            </div>
            </div>
            </div>
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

      <button className="w-full py-3 text-sm text-bad" onClick={() => void ask('Discard this workout? Nothing will be saved.', 'Discard', true).then(ok => ok && set(null))}>Discard workout</button>

      {peek && <History name={peek} close={closePeek} />}

      {/* One dock at the bottom: Undo stacks on top of the rest timer, so neither can cover the other. */}
      <div className="fixed inset-x-0 bottom-0 z-20">
      {undo && (
        <div className={`mx-4 mb-3 flex animate-toast-in items-center gap-3 rounded-2xl border border-line bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-lg sm:mx-auto sm:max-w-md ${a.restEndsAt ? '' : 'mb-[max(1rem,env(safe-area-inset-bottom))]'}`} role="status">
          <span className="min-w-0 flex-1 truncate text-sm">{undo.msg}</span>
          <button className="press relative min-h-11 rounded-xl px-4 text-sm font-semibold text-accent" onClick={() => (update(undo.put), setUndo(null), setFx(null))}><Tap />Undo</button>
        </div>
      )}

      {a.restEndsAt && (
        <div className="relative border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {/* Drains from full to empty over the rest; ±15 stretches or shrinks what's left. */}
          <div className="absolute inset-x-0 top-0 h-1 bg-line">
            <div className="h-full bg-linear-to-r from-accent to-accent-2 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(0, Math.min(1, (a.restEndsAt - now) / Math.max(1, a.restEndsAt - (a.restFrom ?? now)))) * 100}%` }} />
          </div>
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <span className={`flex-1 text-3xl font-bold tabular-nums transition-colors ${a.restEndsAt - now <= 10_000 ? 'text-good' : ''}`}>{clock(Math.max(0, (a.restEndsAt - now) / 1000))}</span>
            <button className="btn-ghost min-h-11" onClick={() => update(x => (x.restEndsAt = x.restEndsAt! - 15_000))}>−15</button>
            <button className="btn-ghost min-h-11" onClick={() => update(x => (x.restEndsAt = x.restEndsAt! + 15_000))}>+15</button>
            <button className="btn min-h-11" onClick={() => update(x => (x.restEndsAt = null))}>Skip</button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

const BIN_W = 72 // px the row slides to show the bin; also the bin's width
const BIN = 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6' // Lucide trash-2

/**
 * One set's row. Two steps, like deleting an email on iPhone: swipe left and it stops open on a red bin; only tapping
 * the bin deletes, so a stray swipe can't. Swiping back, tapping the row, scrolling or touching anywhere else closes it.
 * Spans the set grid via subgrid so the columns still line up. No onDelete (an exercise's only set): a plain row.
 */
function SwipeRow({ onDelete, children }: { onDelete?: () => void; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const t = useRef<{ x: number; y: number; dx: number; base: number; lock?: 'x' | 'y' } | null>(null)
  // Styles set directly while dragging, so no re-render per touchmove.
  const slide = (x: number, ease: boolean) => {
    const el = row.current
    if (!el) return
    el.style.transition = ease ? 'transform 0.2s ease-out' : 'none'
    el.style.transform = x ? `translateX(${x}px)` : ''
  }
  useEffect(() => slide(open ? -BIN_W : 0, true), [open])
  useEffect(() => {
    if (!open) return
    const away = (e: TouchEvent) => void (!wrap.current?.contains(e.target as Node) && setOpen(false))
    document.addEventListener('touchstart', away, { passive: true })
    return () => document.removeEventListener('touchstart', away)
  }, [open])
  const cells = 'col-span-5 grid grid-cols-subgrid items-center'
  if (!onDelete) return <div className={cells}>{children}</div>
  return (
    // Clipped on the left only (where the row slides out), so the ✓'s pop and 🏆 aren't cut off.
    <div ref={wrap} className={`relative [clip-path:inset(-8px_-8px_-8px_0)] ${cells}`}>
      <button type="button" aria-label="Delete set" tabIndex={open ? 0 : -1} aria-hidden={!open}
        className="press absolute inset-y-0 right-0 grid place-items-center rounded-xl bg-bad text-white" style={{ width: BIN_W }}
        onClick={() => {
          setOpen(false)
          onDelete()
        }}>
        <Icon d={BIN} className="h-5 w-5" />
      </button>
      <div ref={row} className={`relative bg-surface ${cells} touch-pan-y`}
        onTouchStart={e => void (t.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, base: open ? -BIN_W : 0 })}
        onTouchMove={e => {
          const c = t.current
          if (!c) return
          const dx = e.touches[0].clientX - c.x, dy = e.touches[0].clientY - c.y
          c.lock ??= Math.abs(dx) > 8 ? 'x' : Math.abs(dy) > 8 ? 'y' : undefined // decide once: a scroll never turns into a swipe
          if (c.lock !== 'x') return
          c.dx = dx
          slide(Math.max(-BIN_W - 24, Math.min(0, c.base + dx)), false) // a little give past the bin, none to the right
        }}
        onTouchEnd={e => {
          const c = t.current
          t.current = null
          if (!c) return
          if (c.lock !== 'x') {
            // Open and tapped (or scrolled): just close. preventDefault stops that tap also ticking a set or focusing an input.
            if (open) {
              if (!c.lock) e.preventDefault()
              setOpen(false)
            }
            return
          }
          const next = c.base + c.dx < -BIN_W / 2
          if (next === open) slide(open ? -BIN_W : 0, true)
          else setOpen(next)
        }}>
        {children}
      </div>
    </div>
  )
}

function Summary({ w, done }: { w: ImportWorkout; done: () => void }) {
  const { data, model, lines, pending } = useData()
  const nav = useNavigate()
  const session = model.sessions.find(s => s.workout?.client_id === w.client_id) // once it's uploaded
  const pbs = session?.pbs ?? 0
  // Exercises with a PB, for the picture: from the saved PBs once uploaded, until then the same check the logger's 🏆 uses.
  // Memoised so the picture isn't redrawn on every frame of the count-up.
  const saved = session?.workout
  const pbNames = useMemo(() => saved
    ? [...new Set(saved.sets.filter(x => model.pbs.has(x.id)).map(x => model.exById.get(x.exercise_id)?.name ?? '?'))]
    : [...new Set(w.sets.map(s => s.exercise))].filter(n => livePb(model.exHistory.get(matchExercise(n, data.exercises, data.aliases)?.id ?? -1) ?? [], w.sets.filter(s => s.exercise === n).map(s => ({ ...s, done: true }))) >= 0),
  [w, saved, model, data])
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  // The same one-liner the Workouts list will show; until it's uploaded, one from the weight lifted.
  const line = (session && lines.get(session.key)) || workoutLine(volume, w.sets.length)
  const [secs, sets, kg] = [useCountUp(w.duration_s ?? 0), useCountUp(w.sets.length), useCountUp(volume)]
  return (
    <div className="space-y-5 pt-10 text-center">
      <p className="animate-pop text-5xl">💪</p>
      <h1 className="text-3xl font-bold tracking-tight">{w.title || 'Workout'} done</h1>
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-line bg-surface p-4">
        <div><div className="text-xl font-bold tabular-nums">{duration(Math.round(secs))}</div><div className="text-xs text-muted">Time</div></div>
        <div><div className="text-xl font-bold tabular-nums">{Math.round(sets)}</div><div className="text-xs text-muted">Sets</div></div>
        <div><div className="text-xl font-bold tabular-nums">{num(Math.round(kg))} kg</div><div className="text-xs text-muted">Volume</div></div>
      </div>
      {pbs > 0 && <p className="relative mx-auto w-fit animate-pop font-semibold text-pb">🏆 {plural(pbs, 'PB')}<Burst n={24} r={90} /></p>}
      {pending ? <Outbox /> : LOCAL ? <BackupNudge /> : <p className="text-sm text-muted">Uploaded.</p>}
      <ShareButton className="btn-ghost w-full" label="Share as a picture" w={w} pbs={pbNames} line={line} />
      <CopyButton className="btn-ghost w-full" label="Copy workout as text" text={() => workoutText(w)} />
      <button className="btn w-full" onClick={() => (done(), nav('/workouts'))}>Done</button>
    </div>
  )
}

const heaviest = (sets: WorkoutSet[]) => sets.reduce<WorkoutSet | null>((b, s) => (!b || (s.weight_kg ?? 0) > (b.weight_kg ?? 0) || ((s.weight_kg ?? 0) === (b.weight_kg ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b), null)

/**
 * Press and hold. `hold(onHold)` gives one element's handlers: holding 450ms runs onHold, and the click that still follows
 * the release is swallowed; a plain click bubbles as usual. Moving more than 10px cancels: it's a scroll.
 * ponytail: module-level, like foldTimer: one finger, one logger.
 */
const press = { timer: 0, x: 0, y: 0, fired: false }
const stopPress = () => clearTimeout(press.timer)
const hold = (onHold: () => void) => ({
  onPointerDown: (e: React.PointerEvent) => {
    stopPress()
    Object.assign(press, { x: e.clientX, y: e.clientY, fired: false, timer: window.setTimeout(() => ((press.fired = true), navigator.vibrate?.(15), onHold()), 450) })
  },
  onPointerMove: (e: React.PointerEvent) => void (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10 && stopPress()),
  onPointerUp: stopPress,
  onPointerCancel: stopPress,
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // Android's long-press menu
  onClick: (e: React.MouseEvent) => void (press.fired && ((press.fired = false), e.stopPropagation())), // a plain tap bubbles on to fold
})

/** An exercise's last few sessions and its estimated-1RM trend, without leaving the workout. */
function History({ name, close }: { name: string; close: () => void }) {
  const { data, model } = useData()
  const ex = matchExercise(name, data.exercises, data.aliases)
  const hist: ExerciseSession[] = (ex && model.exHistory.get(ex.id)) || []
  const trend = hist.map(h => Math.max(0, ...h.sets.map(s => e1rm(s) ?? 0))).filter(Boolean)
  return (
    <Sheet close={close} label={`${name} history`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-lg font-bold">{name}</h2>
        {trend.length > 0 && <span className="shrink-0 text-sm text-muted">Est. 1RM <b className="text-ink tabular-nums">{kg(Math.round(trend.at(-1)! * 2) / 2)}</b></span>}
      </div>
      {trend.length > 1 && <div className="mt-3 h-14"><Chart height={56} label={`${name} estimated 1RM trend`} config={sparkConfig(trend.slice(-20))} /></div>}
      {hist.length ? (
        <ul className="mt-3 divide-y divide-line">
          {hist.slice(-5).reverse().map(h => {
            const f = effort(h.sets.find(s => s.rpe)?.rpe)
            return (
              <li key={h.workoutId} className="py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{ago(h.date)}</span>
                  {f && <span className="text-xs text-muted">{f.emoji} {f.label}</span>}
                  <span className="ml-auto">{h.sets.map(s => <PbBadge key={s.id} kinds={model.pbs.get(s.id)} />)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{h.sets.map(setText).join(' · ')}</p>
              </li>
            )
          })}
        </ul>
      ) : <Empty>Not done before. Today sets the baseline.</Empty>}
      {ex && hist.length > 0 && <Link to={`/exercises/${ex.id}`} className="mt-1 block py-2 text-center text-sm text-accent">Full history ›</Link>}
    </Sheet>
  )
}
