import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { targetText } from '../../shared/plan'
import { fromCatalogue } from '../../shared/exercises'
import { Outbox } from '../components/Layout'
import { Planner } from '../components/Planner'
import { backupAge, lastBackup, saveBackup } from '../lib/backupFile'
import { LOCAL } from '../lib/local'
import { pauseReminders, scheduleRest } from '../lib/push'
import type { ImportWorkout, Muscle, WorkoutSet } from '../../shared/types'
import { api, useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { ago, clock, EFFORT, effort, kg, plural, setText, shown, workoutText } from '../lib/format'
import { ask, Burst, COPY, Empty, Icon, LookStrip, PbBadge, SHARE, shareCard, Sheet, Stepper, useShareCards } from '../components/ui'
import { Chart, sparkConfig } from '../components/Chart'
import { PbMoment } from '../components/PbMoment'
import { PlateLine, PlateSheet } from '../components/Plates'
import { barFor } from '../../shared/plates'
import { pbShow } from '../lib/pbMoment'
import { DONE_WORDS, workoutLine } from '../lib/motivation'
import { milestones } from '../lib/milestones'
import { beep, isTimed, loadActive, matchExercise, moveExercise, newExercise, routineFromWorkout, queue, rememberRest, rememberUnit, sendUnits, restOver, saveActive, setKg, setVoice, swapExercise, switchUnit, toImport, totals, unlockAudio, useNow, voiceOn, type Active } from '../lib/session'
import { e1rm, lastSets, livePb, MUSCLES, type ExerciseSession } from '../lib/stats'

let foldTimer = 0 // ponytail: module-level, there's only ever one logger
const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]

export default function Log() {
  const { sync, data } = useData()
  const [active, setActiveRaw] = useState(loadActive)
  const [finished, setFinished] = useState<ImportWorkout | null>(null)
  // Finished or discarded: no rest alert still to come.
  const setActive = (a: Active | null) => (a || scheduleRest(null), saveActive(a), setActiveRaw(a))
  // No streak nudge in the middle of a workout. Home works them out again once you're back (Layout).
  const running = !!active
  useEffect(() => { if (running) pauseReminders() }, [running])

  const finish = (a: Active) => {
    if (!totals(a).sets) return void ask('No sets ticked off. Discard this workout?', 'Discard', true).then(ok => ok && setActive(null))
    const w = toImport(a)
    queue(w)
    setActive(null)
    setFinished(w)
    void sync()
    void sendUnits(data.profile) // a unit switch made with no signal
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl animate-fade-in px-4 pb-40 pt-[calc(env(safe-area-inset-top)+1rem)]">
      {finished ? <Summary w={finished} done={() => setFinished(null)} />
        : active ? <Workout a={active} set={setActive} finish={() => finish(active)} />
        : <Planner begin={setActive}><Outbox /></Planner>}
    </div>
  )
}

function Workout({ a, set, finish }: { a: Active; set: (a: Active | null) => void; finish: () => void }) {
  const { data, model, reload } = useData()
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
  const [restFor, setRestFor] = useState<number | null>(null) // exercise whose rest picker is open
  const [swapFor, setSwapFor] = useState<number | null>(null) // exercise being swapped
  const [plates, setPlates] = useState<{ total: number; name: string; u: 'kg' | 'lb' } | null>(null) // plate calculator sheet
  // Drag the ☰ to reorder: a lifted copy of the card (the ghost) follows the finger, and the card's real place shows as a
  // dashed outline. Each time the ghost's middle passes the middle of the card above or below, they swap places.
  // Only the finger that started it counts. Cards are keyed by their own id, so the ☰ under the finger stays in the DOM.
  // ponytail: one place per pointer move, no slide animation for the others and no auto-scroll; folded cards fit a phone
  // screen. Add them if lists get long.
  const [dragging, setDragging] = useState<number | null>(null)
  const stopDrag = useRef<() => void>(null)
  useEffect(() => () => stopDrag.current?.(), []) // left the logger mid-drag: no listeners left behind
  const startDrag = (e: React.PointerEvent, from: number) => {
    e.stopPropagation()
    stopDrag.current?.()
    const id = e.pointerId
    let i = from
    // The ghost: a copy of the card as it looks now, fixed to the screen, moved with the finger. Hidden from screen
    // readers and taps; the real card stays in the list as the drop spot.
    const card = e.currentTarget.closest('section')!
    const box = card.getBoundingClientRect()
    const grab = e.clientY - box.top
    const ghost = card.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-ex')
    ghost.dataset.ghost = ''
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.classList.replace('border-line', 'border-accent')
    ghost.className += ' pointer-events-none fixed z-50 m-0 scale-[1.03] shadow-2xl shadow-black/50'
    Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` })
    document.body.append(ghost)
    setDragging(i)
    setFx(null) // a finish burst is kept by position: it would replay on whichever card lands there
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      ghost.style.top = `${ev.clientY - grab}px`
      const mid = ev.clientY - grab + box.height / 2
      const cards = [...document.querySelectorAll('[data-ex]')].map(c => c.getBoundingClientRect())
      const prev = cards[i - 1], next = cards[i + 1]
      const to = prev && mid < prev.top + prev.height / 2 ? i - 1 : next && mid > next.top + next.height / 2 ? i + 1 : i
      if (to === i) return
      const at = i
      update(x => moveExercise(x, at, to))
      i = to
      setDragging(to)
    }
    const end = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== id) return
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      ghost.remove()
      stopDrag.current = null
      setDragging(null)
    }
    stopDrag.current = end
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }
  const closePeek = useCallback(() => setPeek(null), [])
  const [voice, setVoiceState] = useState(voiceOn)


  // Keep the screen on for the whole workout, so the rest timer stays visible and audible.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const grab = () => void (document.visibilityState === 'visible' && navigator.wakeLock?.request('screen').then(l => (lock = l)).catch(() => {}))
    grab()
    document.addEventListener('visibilitychange', grab)
    return () => (document.removeEventListener('visibilitychange', grab), void lock?.release())
  }, [])

  // Rest over: beep and clear. A negative delay (app reopened after the rest ended) fires straight away.
  // Rest alerts (lib/push): the server buzzes the lock screen when rest ends, unless the app is still on screen 5 s
  // before, when it cancels and beeps itself (5 s so the cancel gets there on gym signal; 2 s didn't always). A locked phone pauses this timer, so the alert goes. Left for another
  // page mid-rest, nothing here cancels it either, which is what you want: the logger isn't there to beep.
  useEffect(() => scheduleRest(a.restEndsAt), [a.restEndsAt])
  useEffect(() => {
    if (!a.restEndsAt) return
    const t = setTimeout(() => (restOver(loadActive() ?? a), update(x => (x.restEndsAt = null))), a.restEndsAt - Date.now())
    // "On screen" means the screen is drawing: a locked iPhone can keep running timers (the beep's audio keeps the page
    // awake) and still say 'visible', but it stops animation frames. No frame within a second: leave the alert to go.
    const ends = a.restEndsAt
    const early = setTimeout(() => requestAnimationFrame(() => Date.now() < ends - 1000 && scheduleRest(null)), ends - Date.now() - 5000)
    return () => (clearTimeout(t), clearTimeout(early))
  })

  // The hold's countdown ran out (or Done): tick the set and start the rest, as a tap on ✓ would.
  const finishHold = () => update(x => {
    const h = x.hold
    x.hold = null
    const y = h && x.exercises[h.i]?.sets[h.j]
    if (!h || !y || y.done) return
    y.done = true
    const finished = x.exercises.every(e => e.sets.every(z => z.done))
    x.restFrom = Date.now()
    x.restEndsAt = finished ? null : x.restFrom + x.exercises[h.i].restS * 1000
  })
  useEffect(() => {
    if (!a.hold) return
    const t = setTimeout(() => (beep(), finishHold()), a.hold.endsAt - Date.now())
    return () => clearTimeout(t)
  })

  const known = name.trim() ? matchExercise(name, data.exercises, data.aliases) : null // follows renames, merges and the catalogue
  const isNew = name.trim() && !known && newExercise(name).muscle === 'other'
  const t = totals(a)
  // Held for seconds last time (a plank): timed again.
  const add = (n: string, m?: Muscle) => (update(x => void x.exercises.push({ ...newExercise(n, m), ...(isTimed(lastSets(model, n)) && { timed: true }) })), setName(''))
  // Search as you type: what you've logged, most recently done first.
  const q = name.trim().toLowerCase()
  const matches = q ? data.exercises.filter(e => e.name.toLowerCase().includes(q))
    .map(e => ({ e, hist: model.exHistory.get(e.id) ?? [] }))
    .sort((x, y) => (y.hist.at(-1)?.date ?? '').localeCompare(x.hist.at(-1)?.date ?? ''))
    .slice(0, 6) : []
  // Then popular lifts you haven't logged, so a new user's search finds something.
  const popular = q ? fromCatalogue(q, data.exercises, data.aliases).slice(0, 8 - matches.length) : []

  return (
    <div className="space-y-4">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        {/* The workout stays saved on the phone; a bar on every page brings you back. */}
        <Link to="/" className="icon-btn -ml-2 text-xl" aria-label="Back to the menu, workout keeps running">‹</Link>
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-lg font-bold outline-none placeholder:text-ink" placeholder="Workout" value={a.title} onChange={e => update(x => (x.title = e.target.value))} aria-label="Workout name" />
          <p className="text-sm tabular-nums text-muted">{clock((now - a.startedAt) / 1000)} · <span key={t.sets} className="inline-block animate-bump">{plural(t.sets, 'set')}</span> · {kg(Math.round(t.volume))}</p>
        </div>
        {/* Mutes the spoken "Rest over. Next: …"; the beep stays. */}
        <button className="icon-btn relative" onClick={() => { unlockAudio(); setVoice(!voice); setVoiceState(!voice) }}
          aria-label={voice ? 'Mute spoken cues' : 'Turn spoken cues on'} aria-pressed={!voice}>
          <Tap /><Icon d={voice ? SPEAKER_ON : SPEAKER_OFF} className="h-6 w-6" />
        </button>
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
        const u = ex.lb ? 'lb' : 'kg'
        const pbAt = livePb(history, ex.sets.map(s => ({ weight_kg: s.weight === '' ? null : setKg(s.weight, ex.lb), reps: s.reps === '' ? null : +s.reps, done: s.done })))
        const done = ex.sets.filter(s => s.done).length
        const cur = ex.sets.findIndex(s => !s.done) // the next set to do: "+ Add note" goes there, in every exercise (people don't go in order)
        const toggle = () => update(x => void (x.exercises[i].collapsed = !ex.collapsed))
        return (
          // Folded, the whole card opens it; open, the whole header row folds it. The rest picker and ✕ keep their own taps.
          <section key={ex.key ?? i} data-ex={i} className={`rounded-2xl border p-4 ${dragging === i ? 'border-dashed border-accent/60 [&>*]:invisible' : 'border-line bg-surface'} ${ex.collapsed ? 'row-press cursor-pointer' : ''}`} onClick={ex.collapsed ? toggle : undefined}>
            {/* Press and hold the name for this exercise's history; a plain tap folds it. */}
            <div className="flex cursor-pointer items-center gap-2" onClick={e => {
              e.stopPropagation() // the card's own handler would undo it
              toggle()
            }}>
              {/* Press and hold the name for history too (the toolbar's history button is the obvious way). */}
              <button className="relative flex min-w-0 flex-1 select-none items-center gap-2 text-left [-webkit-touch-callout:none]" aria-expanded={!ex.collapsed} {...hold(() => setPeek(ex.name))}>
                <Tap />
                <span className={`text-muted transition duration-300 ${ex.collapsed ? '-rotate-90' : ''}`}>▾</span>
                <h2 className="min-w-0 break-words font-semibold leading-tight [overflow-wrap:anywhere] line-clamp-2">{ex.name}</h2>
                <span key={done} className={`relative inline-block shrink-0 animate-bump text-xs tabular-nums ${done === ex.sets.length ? 'text-good' : 'text-muted'}`}>
                  {done}/{ex.sets.length}
                  {fx?.all && fx.i === i && <Burst key={fx.t} />}
                </span>
              </button>
              {/* Finished: a green tick on the right so it reads as done at a glance. The tools are in the toolbar below. */}
              {done === ex.sets.length && (
                <span className="grid size-11 shrink-0 animate-pop place-items-center rounded-full text-good" role="img" aria-label={`${ex.name} done`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              )}
              {/* Folded and not finished: a ☰ to drag it up or down (arrow keys too). Finished ones stay put with their tick. */}
              {ex.collapsed && done < ex.sets.length && a.exercises.length > 1 && (
                <button type="button" data-move={i} className="grid size-11 shrink-0 cursor-grab touch-none select-none place-items-center rounded-full text-muted active:cursor-grabbing active:text-ink"
                  aria-label={`Move ${ex.name}: drag, or use the arrow keys`}
                  onClick={e => e.stopPropagation()} onPointerDown={e => startDrag(e, i)}
                  onKeyDown={e => {
                    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
                    if (to === null || !a.exercises[to]) return
                    e.preventDefault()
                    setFx(null)
                    update(x => moveExercise(x, i, to))
                    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${to}"]`)?.focus())
                  }}>
                  <Icon d={GRIP} />
                </button>
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
            {done < ex.sets.length && (
              // The exercise's tools, as bordered buttons so they read as buttons: rest on the left, history, swap and delete on the right.
              <div className="mb-3 flex items-center gap-2">
                <button className="press relative flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold tabular-nums active:bg-surface-2"
                  aria-label={`Rest between sets: ${clock(ex.restS)}. Change`} onClick={() => setRestFor(i)}>
                  <Tap /><Icon d={TIMER} className="size-4 text-accent-2" />{clock(ex.restS)}
                </button>
                <span className="flex-1" />
                <button className={TOOL} aria-label={`${ex.name} history`} onClick={() => setPeek(ex.name)}><Tap /><Icon d={HISTORY} /></button>
                {/* Swap for another exercise, today only (the machine's taken). */}
                <button className={TOOL} aria-label={`Swap ${ex.name} for another exercise`} onClick={() => setSwapFor(i)}><Tap /><Icon d={SHUFFLE} /></button>
                <button className={TOOL} aria-label={`Remove ${ex.name}`} onClick={async () => {
                  if (!await ask(`Remove ${ex.name} from this workout?${done ? ` Its ${plural(done, 'ticked set')} go too.` : ''}`, 'Remove', true)) return
                  update(x => void x.exercises.splice(i, 1))
                  setFx(null) // indices shift: don't let the pop land on another exercise
                  setUndo({ msg: `Removed ${ex.name}`, put: x => void x.exercises.splice(Math.min(i, x.exercises.length), 0, ex) })
                }}><Icon d={BIN} /></button>
              </div>
            )}
            {ex.target && (<>
              <p className="mb-3 text-xs text-muted">
                Plan {targetText(ex.target)}{ex.suggest ? ex.suggest.fresh ? ' · first time: enter a weight, or leave it blank for bodyweight' : ` · today ${ex.suggest.weight ? `${ex.suggest.weight} ${u}` : 'BW'} × ${ex.suggest.reps}${ex.timed ? 's' : ''}${ex.suggest.held ? ', same weight: last time felt hard' : ''}` : ''}{ex.target.note ? ` · ${ex.target.note}` : ''}
              </p>
              {/* From a routine the grey numbers are today's suggestion, so last time goes here: every set, one line. */}
              {prev[0] && <p className="-mt-2 mb-3 text-xs text-muted">Last time: {prev.map(x => (x.weight_kg === null ? 'BW' : shown(x.weight_kg, u)) + setText(x).replace(/^.*? × /, ' × ')).join(' · ')}</p>}
            </>)}
            <div className="grid grid-cols-[1.25rem_minmax(6.5rem,1.4fr)_minmax(4.75rem,1fr)_2.75rem] items-center gap-1.5 text-sm">
              <span className="text-xs text-muted">Set</span>{/* The unit is a button: machines marked in lb at a kg gym. Remembered for this exercise (Settings → Profile lists them). */}
              <button className="relative -my-3 justify-self-start py-3 pr-3 text-left text-xs font-semibold text-accent" aria-label={`Weights in ${u} for ${ex.name}. Switch to ${ex.lb ? 'kg' : 'lb'}`}
                onClick={() => {
                  update(x => switchUnit(x.exercises[i]))
                  void rememberUnit(data.profile, ex.name, ex.lb ? 'kg' : 'lb').then(ok => { if (ok) void reload() }) // no signal: kept, sent at Finish
                }}><Tap />{u} ⇄</button>
              <span className="text-xs text-muted">{ex.timed ? 'Secs' : 'Reps'}</span><span />
              {ex.sets.map((s, j) => {
                const p = prev[j] ?? prev.at(-1)
                // What an empty set means when ticked: today's suggestion if this came from a routine, else last time.
                const hint = ex.suggest ?? { weight: shown(p?.weight_kg, u), reps: (ex.timed ? p?.seconds : p?.reps)?.toString() ?? '' }
                return [
                  <SwipeRow key={`row${j}`} onDelete={ex.sets.length > 1 ? () => void removeSet(j) : undefined}>
                  {/* Tap the set number for a note on that set. */}
                  <button className="relative min-h-11 text-center text-muted" aria-label={`Note for set ${j + 1}`}
                    onClick={() => update(x => void (x.exercises[i].sets[j].note = s.note === undefined ? '' : s.note ? s.note : undefined))}>
                    {j + 1}{s.note ? <span className="absolute -right-0.5 top-0 size-1.5 rounded-full bg-accent" /> : null}
                  </button>
                  <Stepper done={s.done} by={ex.lb ? 5 : 2.5} min={0} label={`Set ${j + 1} ${u}`} placeholder={hint.weight || (ex.suggest?.fresh ? u : 'BW')} value={s.weight} set={v => update(x => (x.exercises[i].sets[j].weight = v))} />
                  <Stepper done={s.done} by={ex.timed ? 5 : 1} min={ex.timed ? 5 : 1} label={`Set ${j + 1} ${ex.timed ? 'seconds' : 'reps'}`} placeholder={hint.reps} value={s.reps} set={v => update(x => (x.exercises[i].sets[j].reps = v))} />
                  <button aria-label={`Set ${j + 1} done`} aria-pressed={s.done}
                    className={`press relative h-11 rounded-xl text-lg font-bold ${s.done ? 'bg-good text-bg' : 'bg-surface-2 text-muted'} ${s.done && fx?.i === i && fx.j === j ? 'animate-pop' : ''}`}
                    onClick={async () => {
                      unlockAudio()
                      // A timed set (a plank): ✓ starts its countdown, which ticks it at the end. ✓ again mid-hold ticks it now.
                      if (ex.timed && !s.done) {
                        if (a.hold?.i === i && a.hold.j === j) return finishHold()
                        const secs = +(s.reps || hint.reps) || 30
                        return update(x => {
                          const y = x.exercises[i].sets[j]
                          y.reps ||= String(secs)
                          y.weight ||= hint.weight
                          x.hold = { i, j, from: Date.now(), endsAt: Date.now() + secs * 1000 }
                          x.restEndsAt = null // holding, not resting
                        })
                      }
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
                  // Last time's note for this set, so "wide bar, upstairs machine" is there when you need it.
                  prev[j]?.notes && <p key={`l${j}`} className="col-span-4 -mt-1 truncate px-1 text-xs text-muted">Last time: {prev[j].notes}</p>,
                  // Barbell lifts: the plates for the set you're on, from the typed weight or the grey one.
                  j === cur && !ex.timed && barFor(ex.name) && <PlateLine key={`p${j}`} total={+(s.weight || hint.weight)} name={ex.name} u={u} open={() => setPlates({ total: +(s.weight || hint.weight), name: ex.name, u })} />,
                  s.note !== undefined ? (
                    <input key={`t${j}`} className="input col-span-4 py-2" placeholder={`Note for set ${j + 1}, e.g. wide bar, felt easy`} aria-label={`Set ${j + 1} note`}
                      autoFocus={!s.note} value={s.note} onChange={e => update(x => void (x.exercises[i].sets[j].note = e.target.value))}
                      onBlur={e => !e.target.value.trim() && update(x => void (x.exercises[i].sets[j] && (x.exercises[i].sets[j].note = undefined)))} />
                  ) : j === cur && (
                    // Only under the set you're on; earlier sets still take a note by tapping their number.
                    <button key={`a${j}`} type="button" className="press col-span-4 flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-left text-[13px] text-muted active:bg-surface-2"
                      onClick={() => update(x => void (x.exercises[i].sets[j].note = ''))}>
                      <Icon d={PLUS} className="size-3.5" />Add note for set {j + 1}
                    </button>
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
        {matches.length + popular.length > 0 && (
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
                      {last ? <>Last {ago(last.date).toLowerCase()}: {setText(heaviest(last.sets)!, e.name)}</> : 'Not done yet'}
                      {best && <> · Best {setText(best, e.name)}</>}
                    </span>
                  </button>
                </li>
              )
            })}
            {popular.map(c => (
              <li key={c.name}>
                <button type="button" className="relative w-full px-3 py-2.5 text-left" onClick={() => add(c.name, c.muscle)}>
                  <Tap />
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs capitalize text-muted">{c.muscle} · new</span>
                </button>
              </li>
            ))}
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
      {plates && <PlateSheet {...plates} close={() => setPlates(null)} />}
      {restFor !== null && a.exercises[restFor] && <RestPicker ex={a.exercises[restFor]} close={() => setRestFor(null)}
        pick={sec => (rememberRest(a.exercises[restFor].name, sec), update(x => void (x.exercises[restFor] && (x.exercises[restFor].restS = sec))), setRestFor(null))} />}
      {swapFor !== null && a.exercises[swapFor] && <SwapPicker current={a.exercises[swapFor]} close={() => setSwapFor(null)}
        pick={(n, m) => {
          const i = swapFor, old = a.exercises[i]
          update(x => void (x.exercises[i] = swapExercise(x.exercises[i], n, m, lastSets(model, n))))
          setSwapFor(null)
          setUndo({ msg: `Swapped ${old.name} for ${n}`, put: x => void (x.exercises[i] = old) })
        }} />}

      {/* One dock at the bottom: Undo stacks on top of the rest timer, so neither can cover the other. */}
      <div className="fixed inset-x-0 bottom-0 z-20">
      {undo && (
        <div className={`mx-4 mb-3 flex animate-toast-in items-center gap-3 rounded-2xl border border-line bg-surface-2 py-1.5 pl-4 pr-1.5 shadow-lg sm:mx-auto sm:max-w-md ${a.restEndsAt || a.hold ? '' : 'mb-[max(1rem,env(safe-area-inset-bottom))]'}`} role="status">
          <span className="min-w-0 flex-1 truncate text-sm">{undo.msg}</span>
          <button className="press relative min-h-11 rounded-xl px-4 text-sm font-semibold text-accent" onClick={() => (update(undo.put), setUndo(null), setFx(null))}><Tap />Undo</button>
        </div>
      )}

      {a.hold && (
        <div className="relative border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur" role="timer" aria-label="Hold">
          {/* Fills as the hold goes on: the opposite of rest, which drains. */}
          <div className="absolute inset-x-0 top-0 h-1 bg-line">
            <div className="h-full bg-linear-to-r from-accent-2 to-good transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(0, Math.min(1, (now - a.hold.from) / Math.max(1, a.hold.endsAt - a.hold.from))) * 100}%` }} />
          </div>
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className={`text-3xl font-bold tabular-nums ${a.hold.endsAt - now <= 5_000 ? 'text-good' : ''}`}>{clock(Math.max(0, (a.hold.endsAt - now) / 1000))}</span>
              <span className="truncate text-sm text-muted">Hold · {a.exercises[a.hold.i]?.name}</span>
            </span>
            <button className="btn-ghost min-h-11" onClick={() => update(x => (x.hold = null))}>Cancel</button>
            <button className="btn min-h-11" onClick={finishHold}>Done</button>
          </div>
        </div>
      )}
      {a.restEndsAt && !a.hold && (
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
const SPEAKER_ON = 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14' // Lucide volume-2
const SPEAKER_OFF = 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6' // Lucide volume-x
/** A kg or reps box with − and + either side, so a sweaty hand can nudge it instead of typing. An empty box steps from its grey number. */

const TOOL = 'press relative grid size-11 shrink-0 place-items-center rounded-xl border border-line text-muted active:bg-surface-2 hover:text-ink'
const HISTORY = 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2' // Lucide history
const SHUFFLE = 'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4' // Lucide shuffle
const TIMER = 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' // Lucide timer
const PLUS = 'M12 5v14M5 12h14'
const GRIP = 'M4 6h16M4 12h16M4 18h16' // Lucide menu: the ☰ to drag an exercise
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5'

/** Rest between sets as big buttons; the current one filled. Remembered per exercise (rememberRest). */
function RestPicker({ ex, pick, close }: { ex: { name: string; restS: number }; pick: (s: number) => void; close: () => void }) {
  return (
    <Sheet close={close} label="Rest between sets">
      <h2 className="text-lg font-bold">Rest between sets</h2>
      <p className="mb-4 truncate text-sm text-muted">{ex.name} · remembered for next time</p>
      <div className="grid grid-cols-3 gap-2">
        {[...new Set([...RESTS, ex.restS])].sort((x, y) => x - y).map(sec => {
          const on = sec === ex.restS
          return (
            <button key={sec} aria-pressed={on} onClick={() => pick(sec)}
              className={`press relative h-13 rounded-2xl border text-lg font-bold tabular-nums ${on ? 'border-accent bg-accent text-bg' : 'border-line bg-surface-2'}`}>
              <Tap />{clock(sec)}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/** Swap an exercise for another, today only: same-muscle ones you've done first, or search any, or type a new one. */
function SwapPicker({ current, pick, close }: { current: { name: string; muscle: Muscle }; pick: (name: string, muscle: Muscle) => void; close: () => void }) {
  const { data, model } = useData()
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const recent = (id: number) => model.exHistory.get(id)?.at(-1)?.date ?? ''
  const list = data.exercises
    .filter(e => e.name !== current.name && (term ? e.name.toLowerCase().includes(term) : e.muscle === current.muscle))
    .sort((x, y) => recent(y.id).localeCompare(recent(x.id)))
    .slice(0, 8)
  // Popular lifts you haven't logged fill it up: same muscle, or matching the search.
  const popular = fromCatalogue(term, data.exercises, data.aliases, current.muscle).filter(c => c.name !== current.name).slice(0, 8 - list.length)
  const typed = q.trim() && !data.exercises.some(e => e.name.toLowerCase() === term) && !popular.some(c => c.name.toLowerCase() === term) ? q.trim() : null
  return (
    <Sheet close={close} label={`Swap ${current.name}`}>
      <h2 className="truncate text-lg font-bold">Swap {current.name} for…</h2>
      <p className="mb-3 text-sm text-muted">Just for today. Ticked sets stay, under the new name.</p>
      <label className="input mb-2 flex h-11 items-center gap-2 focus-within:border-accent">
        <Icon d={SEARCH} className="size-4 shrink-0 text-muted" />
        <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder="Search exercises" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" aria-label="Search exercises" />
      </label>
      {!term && list.length + popular.length > 0 && <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Also {current.muscle}</p>}
      <ul className="divide-y divide-line">
        {list.map(e => {
          const hist = model.exHistory.get(e.id) ?? []
          const last = hist.at(-1)
          const top = last && heaviest(last.sets)
          return (
            <li key={e.id}>
              <button className="row-press relative flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left" onClick={() => pick(e.name, e.muscle)}>
                <Tap />
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-xs font-bold text-accent">{initials(e.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block text-xs text-muted">{top ? `Last ${setText(top, e.name)}` : 'Not done yet'}</span>
                </span>
                {last && <span className="shrink-0 text-xs text-muted">{ago(last.date)}</span>}
              </button>
            </li>
          )
        })}
        {popular.map(c => (
          <li key={c.name}>
            <button className="row-press relative flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left" onClick={() => pick(c.name, c.muscle)}>
              <Tap />
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block text-xs capitalize text-muted">{c.muscle} · new</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {typed && (
        <button className="btn-ghost mt-2 w-full" onClick={() => pick(typed, newExercise(typed).muscle === 'other' ? current.muscle : newExercise(typed).muscle)}>Use "{typed}"</button>
      )}
      {!list.length && !popular.length && !typed && <p className="py-6 text-center text-sm text-muted">Nothing else logged for {current.muscle} yet. Search or type a name.</p>}
    </Sheet>
  )
}

const initials = (name: string) => name.split(/[\s-]+/).filter(w => /[a-z]/i.test(w[0] ?? '')).slice(0, 2).map(w => w[0].toUpperCase()).join('')

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
  const cells = 'col-span-4 grid grid-cols-subgrid items-center'
  if (!onDelete) return <div className={cells}>{children}</div>
  return (
    // Clipped on the left only (where the row slides out), so the ✓'s pop and 🏆 aren't cut off.
    <div ref={wrap} className={`relative [clip-path:inset(-8px_-8px_-8px_0)] ${cells}`}>
      <button type="button" aria-label="Delete set" tabIndex={open ? 0 : -1} aria-hidden={!open}
        className="press absolute inset-y-0 right-0 grid place-items-center rounded-xl bg-bad-deep text-white" style={{ width: BIN_W }}
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
  const { data, model, lines, pending, reload } = useData()
  // A new workout (not a routine's, not the same exercises as one) can become a routine. Worked out once, so the button
  // stays to say "Saved" after the routine it made is in the list.
  const [asRoutine] = useState(() => routineFromWorkout(w, data.routines, data.exercises, data.aliases))
  const [savedAs, setSavedAs] = useState<'no' | 'busy' | 'yes'>('no')
  const saveRoutine = async () => {
    if (!asRoutine) return
    setSavedAs('busy')
    try {
      await api('POST', 'routines', { routines: [asRoutine] })
      setSavedAs('yes')
      void reload()
    } catch (e) {
      setSavedAs('no')
      alert(`Couldn't save the routine: ${e instanceof Error ? e.message : e}`)
    }
  }
  const nav = useNavigate()
  const session = model.sessions.find(s => s.workout?.client_id === w.client_id) // once it's uploaded
  // Exercises with a PB, for the picture: from the saved PBs once uploaded, until then the same check the logger's 🏆 uses.
  // Memoised so the pictures aren't redrawn on every render.
  const saved = session?.workout
  const pbNames = useMemo(() => saved
    ? [...new Set(saved.sets.filter(x => model.pbs.has(x.id)).map(x => model.exById.get(x.exercise_id)?.name ?? '?'))]
    : [...new Set(w.sets.map(s => s.exercise))].filter(n => livePb(model.exHistory.get(matchExercise(n, data.exercises, data.aliases)?.id ?? -1) ?? [], w.sets.filter(s => s.exercise === n).map(s => ({ ...s, done: true }))) >= 0),
  [w, saved, model, data])
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  // The same one-liner the Workouts list will show; until it's uploaded, one from the weight lifted.
  const line = (session && lines.get(session.key)) || workoutLine(volume, w.sets.length)
  // Milestones this workout reached: what's earned once it's in, minus what was earned when this screen opened.
  // ponytail: snapshot at mount works because the upload is always async, so the first render has the old data. If
  // this screen is ever shown after the reload, compare against a model built without this workout instead.
  const weekly = data.profile.weekly
  const [before] = useState(() => new Set(milestones(model, weekly).filter(m => m.date).map(m => m.key)))
  // One per kind: jumping from 45 to 65 kg is "First 60 kg lift", not that and 50 kg too. Ladders run low to high, so the last wins.
  const reached = useMemo(() => [...new Map(milestones(model, weekly).filter(m => m.date && !before.has(m.key)).map(m => [m.key.split(':')[0], m])).values()], [model, weekly, before])
  // The PB moment: worked out once at mount, like the milestones above, before the upload adds this workout to the history.
  const [moment, setMoment] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? [] : [...new Set(w.sets.map(s => s.exercise))].flatMap(n => {
    const p = pbShow(n, model.exHistory.get(matchExercise(n, data.exercises, data.aliases)?.id ?? -1) ?? [], w.sets.filter(s => s.exercise === n))
    return p ? [p] : []
  }))
  const endMoment = useCallback(() => setMoment([]), [])
  // The picture is the page (like Strava): every look made ahead, swiped in place, and Share sends the one on screen.
  const cards = useShareCards(w, pbNames, line)
  const [at, setAt] = useState(0)
  const card = cards?.[at] ?? null
  // Phone-only copy: the backup is a tile here, and the line under the tiles says how old the last one is.
  // Any backup from before now can't have this workout in it, so the tile asks again until one's saved from here,
  // and says under it when the last one was.
  const [age] = useState(backupAge)
  const [backedUp, setBackedUp] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const backup = () => {
    setBackingUp(true)
    saveBackup(data).then(ok => ok && setBackedUp(true), e => alert(e instanceof Error ? e.message : String(e))).finally(() => setBackingUp(false))
  }
  const last = lastBackup()
  const lastText = backedUp ? 'This workout included' : !last ? 'No backup yet'
    : age === 0 ? `Last: today ${new Date(last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : age === 1 ? 'Last: yesterday' : `Last: ${age} days ago`
  const best = (n: string) => w.sets.filter(x => x.exercise === n).reduce((b, x) => ((x.weight_kg ?? 0) > (b.weight_kg ?? 0) || ((x.weight_kg ?? 0) === (b.weight_kg ?? 0) && (x.reps ?? 0) > (b.reps ?? 0)) ? x : b))
  const leave = () => (done(), nav('/workouts'))
  // No PB to celebrate: a big tick and a few words first, which fade into the page. Skipped with reduced motion.
  const [cheer, setCheer] = useState(() => !moment.length && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const endCheer = useCallback(() => setCheer(false), [])
  const tiles = 1 + Number(!!asRoutine) + Number(LOCAL)
  return (
    <div className="space-y-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
      {moment.length > 0 && <PbMoment pbs={moment} close={endMoment} />}
      {cheer && <DoneMoment close={endCheer} />}
      {/* The name is on the picture, so the heading is for screen readers. */}
      <h1 className="sr-only">{w.title || 'Workout'} done</h1>
      {cards
        ? <LookStrip made={cards} title={w.title} at={at} setAt={setAt} height="h-[46dvh]" />
        : <div className="mx-auto h-[46dvh] w-3/4 animate-pulse rounded-xl bg-surface" aria-label="Making the picture" />}
      {(pbNames.length > 0 || reached.length > 0) && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-left" aria-label="Highlights">
          {pbNames.map((n, i) => (
            <li key={n} className="flex animate-pop items-center gap-3 px-4 py-3" style={{ animationDelay: `${0.2 + i * 0.12}s`, animationFillMode: 'backwards' }}>
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-pb/15">🏆</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">PB: {n}</span><span className="block text-xs text-muted">{setText(best(n), n)}</span></span>
              {i === 0 && <span className="relative"><Burst n={18} r={70} /></span>}
            </li>
          ))}
          {reached.map((m, i) => (
            <li key={m.key} className="flex animate-pop items-center gap-3 px-4 py-3" style={{ animationDelay: `${0.3 + (pbNames.length + i) * 0.12}s`, animationFillMode: 'backwards' }}>
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-pb/15">{m.emoji}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">Milestone: {m.title}</span></span>
            </li>
          ))}
        </ul>
      )}
      <button className={`btn relative min-h-[3.25rem] w-full text-base ${card ? '' : 'busy'}`} disabled={!card} aria-busy={!card} onClick={() => card && shareCard(card, w.title)}>
        <Tap /><Icon d={SHARE} className="h-4 w-4" />Share as a picture
      </button>
      <div className={`grid gap-2 ${tiles === 3 ? 'grid-cols-3' : tiles === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <CopyTile text={() => workoutText(w)} />
        {asRoutine && (
          <Tile icon={savedAs === 'yes' ? TICK : PLUS} label={savedAs === 'yes' ? 'Saved ✓' : 'Save as routine'} busy={savedAs === 'busy'} disabled={savedAs !== 'no'}
            aria={savedAs === 'yes' ? 'Saved as a routine ✓' : `Save "${asRoutine.name}" as a routine`} onClick={() => void saveRoutine()} />
        )}
        {LOCAL && <Tile icon={backedUp ? TICK : DOWNLOAD} label={backedUp ? 'Backed up ✓' : 'Save a backup'} sub={lastText} tone={!backedUp && (age === null || age >= 7) ? 'pb' : undefined} busy={backingUp} onClick={backup} />}
      </div>
      {pending ? <Outbox /> : (
        <p className="text-center text-xs text-muted">
          {LOCAL ? `Saved on this phone${last ? ' · save the backup over the last one in Files' : ''}` : 'Uploaded ✓'}
        </p>
      )}
      {/* At the very bottom, so the way out goes past Share and the backup. */}
      <button className="btn-ghost relative min-h-12 w-full" onClick={leave}><Tap />Done</button>
    </div>
  )
}

/**
 * No PB, still worth a moment: a big green tick that pulses, a few words (DONE_WORDS) on a card, then it fades into the
 * finish screen after 2.5 s. A tap anywhere skips it.
 */
function DoneMoment({ close }: { close: () => void }) {
  const [words] = useState(() => DONE_WORDS[Math.floor(Math.random() * DONE_WORDS.length)])
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), 2100)
    const gone = setTimeout(close, 2500) // 2.5 s in all, the last 0.4 s fading
    return () => (clearTimeout(out), clearTimeout(gone))
  }, [close])
  return (
    <div role="status" aria-label="Workout done" onClick={close}
      className={`fixed inset-0 z-50 grid place-items-center bg-bg/80 p-6 backdrop-blur-sm transition-opacity duration-400 ${leaving ? 'opacity-0' : 'animate-fade-in'}`}>
      <div className="flex w-full max-w-xs animate-pop flex-col items-center gap-5 rounded-3xl border border-line bg-surface px-6 py-10 shadow-2xl shadow-black/50">
        <span className="relative grid size-24 place-items-center rounded-full bg-good/15 text-good">
          <span className="absolute inset-0 animate-ping rounded-full bg-good/20" aria-hidden />
          <Icon d={TICK} className="size-12 [stroke-width:2.6]" />
        </span>
        <p className="text-center text-3xl font-extrabold tracking-tight">{words}</p>
      </div>
    </div>
  )
}

/** One of the finish screen's small square actions: an icon in a tinted square, a short label under it. */
function Tile({ icon, label, sub, aria, onClick, busy = false, disabled = false, tone }: { icon: string; label: string; sub?: string; aria?: string; onClick: () => void; busy?: boolean; disabled?: boolean; tone?: 'pb' }) {
  return (
    <button type="button" className={`press relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-2.5 text-xs font-semibold disabled:opacity-60 ${busy ? 'busy' : ''}`}
      aria-label={aria} aria-busy={busy} disabled={disabled || busy} onClick={onClick}>
      <Tap />
      <span className={`grid size-9 place-items-center rounded-xl ${tone === 'pb' ? 'bg-pb/15 text-pb' : 'bg-accent/15 text-accent'}`}><Icon d={icon} className="size-[18px]" /></span>
      {label}
      {sub && <span className="-mt-1 text-[11px] font-medium leading-tight text-muted">{sub}</span>}
    </button>
  )
}

/** Copy the workout as plain text (for ChatGPT or a PT), with a moment of "Copied". */
function CopyTile({ text }: { text: () => string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = () => navigator.clipboard.writeText(text()).then(() => 'done' as const, () => 'failed' as const).then(r => (setState(r), setTimeout(() => setState('idle'), 2000)))
  return <Tile icon={state === 'done' ? TICK : COPY} label={state === 'done' ? 'Copied ✓' : state === 'failed' ? "Couldn't copy" : 'Copy results as text'} onClick={() => void copy()} />
}

const TICK = 'M20 6 9 17l-5-5'
const DOWNLOAD = 'M12 3v12M7 10l5 5 5-5M5 21h14'

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
        {trend.length > 0 && <span className="shrink-0 text-sm text-muted">Est. 1RM <b className="text-ink tabular-nums">{kg(Math.round(trend.at(-1)! * 2) / 2, name)}</b></span>}
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
                <p className="mt-0.5 text-sm text-muted">{h.sets.map(x => setText(x, name) + (x.notes ? ` (${x.notes})` : '')).join(' · ')}</p>
              </li>
            )
          })}
        </ul>
      ) : <Empty>Not done before. Today sets the baseline.</Empty>}
      {ex && hist.length > 0 && <Link to={`/exercises/${ex.id}`} className="mt-1 block py-2 text-center text-sm text-accent">Full history ›</Link>}
    </Sheet>
  )
}
