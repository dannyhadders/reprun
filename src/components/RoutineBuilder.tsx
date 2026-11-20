// Build a routine yourself ("DIY"), no plan text or ChatGPT: "What's in it?" first (a search, and tap-to-add chips of
// your recent and popular lifts, narrowed by the muscle you pick), then the routine as a table (exercise · sets · reps ·
// kg) with its totals and rough time; tap a row to open its card, ☰ to put them in order, and the name last, in the Save
// sheet. Saves the same plan text Import does (shared/plan.ts fromRows).
import { useEffect, useRef, useState } from 'react'
import { fromCatalogue } from '../../shared/exercises'
import { estimateS, fromRows, nameError, parsePlan, roughTime, toRows, type BuilderRow } from '../../shared/plan'
import type { Muscle, Routine } from '../../shared/types'
import { api, useData } from '../lib/data'
import { ago, plural, setText, shown, toKg, unitOf, type Unit } from '../lib/format'
import { Tap } from '../lib/haptic'
import { matchExercise } from '../lib/session'
import { MUSCLE_ICON } from '../lib/muscleIcons'
import { lastSets, MUSCLES } from '../lib/stats'
import { Icon, MoveSheet, Sheet, Stepper } from './ui'

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]
const restText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`)
const GRIP = 'M4 6h16M4 12h16M4 18h16' // Lucide menu, as the logger's ☰
const X = 'M18 6 6 18M6 6l12 12'
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5'
// Popular when no muscle is picked: the big lifts most routines are built around.
const STAPLES = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-up', 'Romanian Deadlift', 'Hip Thrust', 'Lat Pulldown', 'Plank']
type Card = BuilderRow & { key: string; u: Unit } // u: the unit its weight box was filled in, kept even if it changes meanwhile
// The table's columns: ☰, exercise, sets, reps, kg. Shared by the header and every row so they line up.
const COLS = 'grid grid-cols-[2.75rem_minmax(0,1fr)_2.5rem_3.5rem_3.25rem] items-center gap-1.5'

export function RoutineBuilder({ routine, seed, close, onCount }: { routine: Routine | null; seed?: { name: string; body: string } | null; close: () => void; onCount?: (n: number) => void }) {
  const { data, model, reload } = useData()
  const start = routine ?? seed ?? null
  const [name, setName] = useState(start?.name ?? '')
  // Weights on the cards are in each exercise's unit (lb for one in lb); the routine's text keeps kg.
  const [rows, setRows] = useState<Card[]>(() => (start ? toRows(start.body).map(r => { const u = unitOf(r.name); return { ...r, weight: r.weight && shown(+r.weight, u), key: crypto.randomUUID(), u } }) : []))
  const inKg = (rs: Card[]) => rs.map(r => ({ ...r, weight: r.weight.trim() === '' || isNaN(+r.weight) ? r.weight : String(toKg(+r.weight, r.u)) }))
  const [open, setOpen] = useState<string | null>(null) // the row unfolded into its card, by key
  useEffect(() => onCount?.(rows.length), [rows.length, onCount]) // so "Tweak before saving" can ask before replacing them
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Any edit clears the last error: it was about what's just been changed.
  const set = (i: number, patch: Partial<BuilderRow>) => (setError(null), setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r))))
  const move = (from: number, to: number) => setRows(rs => {
    if (to < 0 || to >= rs.length || from === to) return rs
    const c = [...rs]
    c.splice(to, 0, ...c.splice(from, 1))
    return c
  })

  // Totals for the header: sets and the rough time Next up shows, from the rows that read (a half-typed one doesn't count).
  const items = rows.flatMap(r => { const o = fromRows(inKg([r])); return 'body' in o ? parsePlan(o.body).flatMap(d => d.items) : [] })
  const sets = items.reduce((n, p) => n + p.sets, 0)

  // Adding: your own name for it if you've logged it, starting from your last top weight; holds start at 30 seconds.
  const add = (raw: string) => {
    const n = matchExercise(raw, data.exercises, data.aliases)?.name ?? raw.trim()
    if (!n) return
    const last = lastSets(model, n)
    const top = Math.max(0, ...last.map(s => s.weight_kg ?? 0))
    const timed = last.some(s => s.seconds) || /plank|hold|hang|wall sit/i.test(n)
    const u = unitOf(n)
    const card = { key: crypto.randomUUID(), name: n, sets: '3', reps: timed ? '30s' : '8-12', weight: top ? shown(top, u) : '', restS: null, note: null, u }
    // A name the plan text would misread can't be fixed on the card (it's the exercise's name): say so now, not at Save.
    if ('error' in fromRows(inKg([card]))) return setError(nameError(n))
    setRows(rs => [...rs, card])
    setQ('')
    setError(null)
  }
  const inRoutine = new Set(rows.map(r => r.name.toLowerCase()))
  const recentDate = (id: number) => model.exHistory.get(id)?.at(-1)?.date ?? ''
  // Typing: the logger's search, what you've logged (most recent first), then popular lifts you haven't.
  const term = q.trim().toLowerCase()
  const mine = term ? data.exercises.filter(e => e.name.toLowerCase().includes(term)).sort((x, y) => recentDate(y.id).localeCompare(recentDate(x.id))).slice(0, 5) : []
  const popular = term ? fromCatalogue(term, data.exercises, data.aliases).slice(0, 8 - mine.length) : []
  // Not typing: tap-to-add chips, narrowed to the muscle picked ("What are you working on?").
  const recentChips = data.exercises.filter(e => recentDate(e.id) && (!muscle || e.muscle === muscle) && !inRoutine.has(e.name.toLowerCase()))
    .sort((x, y) => recentDate(y.id).localeCompare(recentDate(x.id))).slice(0, 5).map(e => e.name) // five each: enough to pick from, short enough to scan
  const popularChips = (muscle ? fromCatalogue('', data.exercises, data.aliases, muscle).map(c => c.name) : STAPLES.filter(n => { const k = matchExercise(n, data.exercises, data.aliases); return !k || !recentDate(k.id) }))
    .filter(n => !inRoutine.has(n.toLowerCase())).slice(0, 5)

  // Drag the ☰, as in the logger: a lifted copy follows the finger and the row's place shows as a dashed outline.
  // ponytail: same approach as Log.tsx's startDrag; share one hook if a third list needs it.
  const list = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const stopDrag = useRef<() => void>(null)
  useEffect(() => () => stopDrag.current?.(), [])
  const lifted = useRef(false) // a tap (no drag) opens Move up / down instead
  const [moveFor, setMoveFor] = useState<number | null>(null)
  const startDrag = (e: React.PointerEvent, from: number) => {
    e.stopPropagation()
    stopDrag.current?.()
    const id = e.pointerId
    let i = from
    lifted.current = false
    const card = e.currentTarget.closest('[data-sort]') as HTMLElement
    const box = card.getBoundingClientRect()
    const grab = e.clientY - box.top
    let ghost: HTMLElement | null = null
    const lift = () => { // on the first real move, so a tap doesn't flash it
      ghost = card.cloneNode(true) as HTMLElement
      ghost.querySelectorAll('select').forEach((x, k) => (x.value = card.querySelectorAll('select')[k].value)) // copies attributes, not choices
      ghost.removeAttribute('data-sort')
      ghost.dataset.ghost = ''
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      ghost.classList.remove('border-t', 'border-line', 'first:border-t-0')
      ghost.className += ' pointer-events-none fixed z-50 m-0 scale-[1.03] rounded-xl border border-accent bg-surface shadow-2xl shadow-black/50'
      Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` })
      document.body.append(ghost)
      lifted.current = true
      setDragging(i)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      if (!ghost) { if (Math.abs(ev.clientY - e.clientY) < 6) return; lift() }
      ghost!.style.top = `${ev.clientY - grab}px`
      const mid = ev.clientY - grab + box.height / 2
      const cards = [...(list.current?.querySelectorAll('[data-sort]') ?? [])].map(c => c.getBoundingClientRect())
      const prev = cards[i - 1], next = cards[i + 1]
      const to = prev && mid < prev.top + prev.height / 2 ? i - 1 : next && mid > next.top + next.height / 2 ? i + 1 : i
      if (to === i) return
      move(i, to)
      i = to
      setDragging(to)
    }
    const end = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== id) return
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      ghost?.remove()
      if (lifted.current) setTimeout(() => (lifted.current = false)) // the click that ends a drag is swallowed; a later Enter isn't
      stopDrag.current = null
      setDragging(null)
    }
    stopDrag.current = end
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  // Done: check the rows first (so a bad one can be fixed in place), then name it in the sheet.
  const done = () => {
    const out = fromRows(inKg(rows))
    if ('error' in out) return setError(out.error)
    setError(null)
    setNaming(true)
  }
  const save = async () => {
    if (busy) return // Return twice, or a key repeat: one routine, not two
    const n = name.trim()
    if (!n) return setError('Give it a name, like "Push day".')
    const out = fromRows(inKg(rows))
    if ('error' in out) return setError(out.error)
    setBusy(true)
    setError(null)
    try {
      if (routine) await api('PUT', `routines/${routine.id}`, { name: n, body: out.body })
      else await api('POST', 'routines', { routines: [{ name: n, body: out.body }] })
      await reload()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const chip = (n: string) => (
    <button key={n} type="button" className="press relative inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 text-sm font-semibold" onClick={() => add(n)} aria-label={`Add ${n}`}>
      <Tap /><span className="text-accent">＋</span>{n}
    </button>
  )
  const cell = 'rounded-lg bg-surface-2 py-1.5 text-center text-sm font-semibold tabular-nums'

  return (
    <div className="space-y-4">
      {/* The routine so far, as a table: what's in it at a glance, with its totals. */}
      {rows.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            In this routine <span className="normal-case tracking-normal">· {plural(rows.length, 'exercise')} · {plural(sets, 'set')}{items.length ? ` · ~${roughTime(estimateS(items))}` : ''}</span>
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className={`${COLS} border-b border-line px-1 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted`} aria-hidden>
              <span /><span>Exercise</span><span className="text-center">Sets</span><span className="text-center">Reps</span><span className="text-center">{unitOf()}</span>
            </div>
            <div ref={list} aria-label="Exercises in this routine">
              {rows.map((r, i) => {
                // Two rows for the same exercise: number them, so labels (and screen readers) can tell them apart.
                const label = rows.filter(x => x.name === r.name).length > 1 ? `${r.name} (${i + 1})` : r.name
                const isOpen = open === r.key
                return (
                  <div key={r.key} data-sort={i} className={`border-t border-line first:border-t-0 ${dragging === i ? 'rounded-xl !border border-dashed !border-accent/60 [&>*]:invisible' : isOpen ? 'bg-surface-2/60' : ''}`}>
                    <div className={`${COLS} px-1 py-1`}>
                      {rows.length > 1 ? (
                        <button type="button" className="grid size-11 cursor-grab touch-none select-none place-items-center rounded-full text-muted active:cursor-grabbing active:text-ink"
                          aria-label={`Move ${label}: tap for options, drag, or use the arrow keys`} onPointerDown={e => startDrag(e, i)}
                          onClick={() => (lifted.current ? (lifted.current = false) : setMoveFor(i))}
                          onKeyDown={e => {
                            const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
                            if (to === null || !rows[to]) return
                            e.preventDefault()
                            move(i, to)
                            requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-sort="${to}"] button`)?.focus())
                          }}>
                          <Icon d={GRIP} className="size-[18px]" />
                        </button>
                      ) : <span />}
                      {/* Tap the row to open its card; again to fold it. The cells show what's set. */}
                      <button type="button" className="relative col-span-4 grid min-h-11 grid-cols-subgrid items-center text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}
                        aria-label={`${label}, ${r.sets || '?'} sets of ${r.reps || '?'}, ${+r.weight ? `${r.weight} ${r.u}` : 'bodyweight'}`}>
                        <Tap />
                        <span className="truncate text-sm font-semibold" data-name>{r.name}</span>
                        <span className={cell}>{r.sets || '–'}</span>
                        <span className={cell}>{r.reps || '–'}</span>
                        <span className={`${cell} ${+r.weight ? '' : 'text-muted'}`}>{+r.weight ? `${r.weight}${r.u !== unitOf() ? ` ${r.u}` : ''}` : 'BW'}</span>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
                          <div><span className="mb-1 block">Sets</span><Stepper value={r.sets} placeholder="3" by={1} min={1} label={`${label} sets`} set={v => set(i, { sets: v })} /></div>
                          <div><span className="mb-1 block">Reps</span>
                            <input className="h-11 w-full rounded-xl border border-line bg-surface text-center text-sm text-ink outline-none placeholder:text-muted focus:border-accent" value={r.reps} placeholder="8-12" onChange={e => set(i, { reps: e.target.value })} aria-label={`${label} reps`} enterKeyHint="done" />
                          </div>
                          <div><span className="mb-1 block">{r.u}</span><Stepper value={r.weight} placeholder="BW" by={r.u === 'lb' ? 5 : 2.5} min={0} label={`${label} ${r.u}`} set={v => set(i, { weight: v })} /></div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="flex flex-1 items-center gap-2 text-xs text-muted">Rest
                            <select className="h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink" value={r.restS ?? ''} onChange={e => set(i, { restS: e.target.value ? +e.target.value : null })} aria-label={`${label} rest`}>
                              <option value="">your usual</option>
                              {[...new Set([...RESTS, ...(r.restS ? [r.restS] : [])])].sort((a, b) => a - b).map(s => <option key={s} value={s}>{restText(s)}</option>)}
                            </select>
                          </label>
                          <button type="button" className="relative flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-bad" aria-label={`Remove ${label}`} onClick={() => (setError(null), setOpen(null), setRows(rs => rs.filter((_, k) => k !== i)))}>
                            <Tap /><Icon d={X} className="size-3.5" />Remove
                          </button>
                        </div>
                        {r.note && <p className="mt-1 truncate text-xs text-muted">{r.note}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* What's in it: a search, or chips to tap. */}
      <form className="space-y-2" onSubmit={e => (e.preventDefault(), add(q))}>
        <div className="flex gap-2">
          <label className={`input flex h-12 items-center gap-2 focus-within:border-accent ${rows.length ? '' : 'border-accent/60'}`}>
            <Icon d={SEARCH} className="size-4 shrink-0 text-muted" />
            <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder={rows.length ? 'Add another exercise' : 'Search or type an exercise'} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" aria-label="Add an exercise" />
          </label>
          {term && <button className="btn">Add</button>}
        </div>
        {mine.length + popular.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2" aria-label="Matching exercises">
            {mine.map(e => {
              const last = model.exHistory.get(e.id)?.at(-1)
              const top = last?.sets.reduce((b, s) => ((s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b))
              return (
                <li key={e.id}>
                  <button type="button" className="relative w-full px-3 py-2.5 text-left" onClick={() => add(e.name)}>
                    <Tap /><span className="block font-medium">{e.name}</span>
                    <span className="block text-xs text-muted">{last && top ? <>Last {ago(last.date).toLowerCase()}: {setText(top, e.name)}</> : 'Not done yet'}</span>
                  </button>
                </li>
              )
            })}
            {popular.map(c => (
              <li key={c.name}>
                <button type="button" className="relative w-full px-3 py-2.5 text-left" onClick={() => add(c.name)}>
                  <Tap /><span className="block font-medium">{c.name}</span>
                  <span className="block text-xs capitalize text-muted">{c.muscle} · new</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {!term && (
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-muted">Need ideas? What are you working on?</p>
            {/* Six tiles, three across: all on screen, big enough to tap mid-set. */}
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Working on">
              {MUSCLES.map(m => (
                <button key={m} type="button" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}
                  className={`press relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[13px] font-semibold capitalize ${muscle === m ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface text-muted'}`}>
                  <Tap /><Icon d={MUSCLE_ICON[m]} className="size-[22px] text-accent" />{m}
                </button>
              ))}
            </div>
          </div>
          {recentChips.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Your recent</p>
              <div className="flex flex-wrap gap-2">{recentChips.map(chip)}</div>
            </div>
          )}
          {popularChips.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Popular{muscle ? ` for ${muscle}` : ''}</p>
              <div className="flex flex-wrap gap-2">{popularChips.map(chip)}</div>
            </div>
          )}
        </div>
      )}

      {error && !naming && <p className="text-sm text-bad" role="alert">{error}</p>}

      {/* Always in reach: Done names it (in a sheet) and saves. */}
      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-bg from-70% to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <button className="btn relative min-h-12 w-full text-base" disabled={!rows.length} onClick={done}>
          {rows.length > 0 && <Tap />}{rows.length ? `Done · ${plural(rows.length, 'exercise')}${items.length ? ` · ~${roughTime(estimateS(items))}` : ''}` : 'Add an exercise to start'}
        </button>
      </div>

      {moveFor !== null && rows[moveFor] && <MoveSheet name={(rows.filter(x => x.name === rows[moveFor].name).length > 1 ? `${rows[moveFor].name} (${moveFor + 1})` : rows[moveFor].name) || 'this exercise'} at={moveFor} count={rows.length} close={() => setMoveFor(null)}
        move={to => (move(moveFor, to), requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-sort="${to}"] button`)?.focus()))} />}
      {naming && (
        <Sheet close={() => setNaming(false)} label="Name this routine">
          <h2 className="text-lg font-bold">{routine ? 'Save changes' : 'Name this routine'}</h2>
          <p className="mb-3 text-sm text-muted">{plural(rows.length, 'exercise')} · {plural(sets, 'set')} · ~{roughTime(estimateS(items))}</p>
          <input className="input h-12 text-lg font-bold" placeholder="e.g. Push day" maxLength={100} value={name} onChange={e => (setError(null), setName(e.target.value))} aria-label="Routine name" enterKeyHint="done" autoFocus={!name}
            onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && void save()} />
          {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
          <button className={`btn relative mt-3 min-h-12 w-full text-base ${busy ? 'busy' : ''}`} disabled={busy} aria-busy={busy} onClick={() => void save()}>
            {!busy && <Tap />}Save routine
          </button>
        </Sheet>
      )}
    </div>
  )
}
