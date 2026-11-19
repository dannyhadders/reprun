// Build a routine in the app, no plan text or ChatGPT: a name, then a card per exercise (sets, reps, kg, rest), found with
// the logger's search and put in order by dragging the ☰. Saves the same plan text Import does (shared/plan.ts fromRows).
import { useEffect, useRef, useState } from 'react'
import { fromCatalogue } from '../../shared/exercises'
import { fromRows, nameError, toRows, type BuilderRow } from '../../shared/plan'
import type { Routine } from '../../shared/types'
import { api, useData } from '../lib/data'
import { ago, setText } from '../lib/format'
import { Tap } from '../lib/haptic'
import { matchExercise } from '../lib/session'
import { lastSets } from '../lib/stats'
import { Icon, Stepper } from './ui'

const RESTS = [30, 45, 60, 90, 120, 150, 180, 240, 300]
const restText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`)
const GRIP = 'M4 6h16M4 12h16M4 18h16' // Lucide menu, as the logger's ☰
const X = 'M18 6 6 18M6 6l12 12'
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5'
type Card = BuilderRow & { key: string }

export function RoutineBuilder({ routine, close }: { routine: Routine | null; close: () => void }) {
  const { data, model, reload } = useData()
  const [name, setName] = useState(routine?.name ?? '')
  const [rows, setRows] = useState<Card[]>(() => (routine ? toRows(routine.body).map(r => ({ ...r, key: crypto.randomUUID() })) : []))
  const [q, setQ] = useState('')
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

  // Adding: your own name for it if you've logged it, starting from your last top weight; holds start at 30 seconds.
  const add = (raw: string) => {
    const n = matchExercise(raw, data.exercises, data.aliases)?.name ?? raw.trim()
    if (!n) return
    const last = lastSets(model, n)
    const top = Math.max(0, ...last.map(s => s.weight_kg ?? 0))
    const timed = last.some(s => s.seconds) || /plank|hold|hang|wall sit/i.test(n)
    const card = { key: crypto.randomUUID(), name: n, sets: '3', reps: timed ? '30s' : '8-12', weight: top ? String(top) : '', restS: null, note: null }
    // A name the plan text would misread can't be fixed on the card (it's the exercise's name): say so now, not at Save.
    if ('error' in fromRows([card])) return setError(nameError(n))
    setRows(rs => [...rs, card])
    setQ('')
    setError(null)
  }
  // The logger's search: what you've logged (most recent first), then popular lifts you haven't.
  const term = q.trim().toLowerCase()
  const recent = (id: number) => model.exHistory.get(id)?.at(-1)?.date ?? ''
  const mine = term ? data.exercises.filter(e => e.name.toLowerCase().includes(term)).sort((x, y) => recent(y.id).localeCompare(recent(x.id))).slice(0, 5) : []
  const popular = term ? fromCatalogue(term, data.exercises, data.aliases).slice(0, 8 - mine.length) : []

  // Drag the ☰, as in the logger: a lifted copy follows the finger and the card's place shows as a dashed outline.
  // ponytail: same approach as Log.tsx's startDrag; share one hook if a third list needs it.
  const list = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const stopDrag = useRef<() => void>(null)
  useEffect(() => () => stopDrag.current?.(), [])
  const startDrag = (e: React.PointerEvent, from: number) => {
    e.stopPropagation()
    stopDrag.current?.()
    const id = e.pointerId
    let i = from
    const card = e.currentTarget.closest('[data-sort]') as HTMLElement
    const box = card.getBoundingClientRect()
    const grab = e.clientY - box.top
    const ghost = card.cloneNode(true) as HTMLElement
    ghost.removeAttribute('data-sort')
    ghost.dataset.ghost = ''
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.querySelectorAll('select').forEach((x, k) => (x.value = card.querySelectorAll('select')[k].value)) // copies attributes, not choices
    ghost.classList.replace('border-line', 'border-accent')
    ghost.className += ' pointer-events-none fixed z-50 m-0 scale-[1.03] shadow-2xl shadow-black/50'
    Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` })
    document.body.append(ghost)
    setDragging(i)
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      ghost.style.top = `${ev.clientY - grab}px`
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
      ghost.remove()
      stopDrag.current = null
      setDragging(null)
    }
    stopDrag.current = end
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  const save = async () => {
    const n = name.trim()
    if (!n) return setError('Give it a name, like "Push day".')
    const out = fromRows(rows)
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

  return (
    <div className="space-y-4">
      <input className="input h-12 text-lg font-bold" placeholder="Name, e.g. Push day" maxLength={100} value={name} onChange={e => (setError(null), setName(e.target.value))} aria-label="Routine name" />

      {rows.length > 0 && (
        <div ref={list} className="space-y-2" aria-label="Exercises in this routine">
          {rows.map((r, i) => {
            // Two cards for the same exercise: number them, so labels (and screen readers) can tell them apart.
            const label = rows.filter(x => x.name === r.name).length > 1 ? `${r.name} (${i + 1})` : r.name
            return (
            <div key={r.key} data-sort={i} className={`rounded-2xl border p-3 ${dragging === i ? 'border-dashed border-accent/60 [&>*]:invisible' : 'border-line bg-surface'}`}>
              <div className="flex items-center gap-1">
                {rows.length > 1 && (
                  <button type="button" className="-ml-1 grid size-10 shrink-0 cursor-grab touch-none select-none place-items-center rounded-full text-muted active:cursor-grabbing active:text-ink"
                    aria-label={`Move ${label}: drag, or use the arrow keys`} onPointerDown={e => startDrag(e, i)}
                    onKeyDown={e => {
                      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null
                      if (to === null || !rows[to]) return
                      e.preventDefault()
                      move(i, to)
                      requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-sort="${to}"] button`)?.focus())
                    }}>
                    <Icon d={GRIP} />
                  </button>
                )}
                <h3 className="min-w-0 flex-1 truncate font-semibold">{r.name}</h3>
                <button type="button" className="relative grid size-10 shrink-0 place-items-center rounded-full text-muted" aria-label={`Remove ${label}`} onClick={() => (setError(null), setRows(rs => rs.filter((_, k) => k !== i)))}>
                  <Tap /><Icon d={X} className="size-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted">
                <div><span className="mb-1 block">Sets</span><Stepper value={String(r.sets)} placeholder="3" by={1} min={1} label={`${label} sets`} set={v => set(i, { sets: v })} /></div>
                <div><span className="mb-1 block">Reps</span>
                  <input className="h-11 w-full rounded-xl border border-line bg-surface-2 text-center text-sm text-ink outline-none placeholder:text-muted focus:border-accent" value={r.reps} placeholder="8-12" onChange={e => set(i, { reps: e.target.value })} aria-label={`${label} reps`} enterKeyHint="done" />
                </div>
                <div><span className="mb-1 block">kg</span><Stepper value={r.weight} placeholder="BW" by={2.5} min={0} label={`${label} kg`} set={v => set(i, { weight: v })} /></div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">Rest
                <select className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink" value={r.restS ?? ''} onChange={e => set(i, { restS: e.target.value ? +e.target.value : null })} aria-label={`${label} rest`}>
                  <option value="">your usual</option>
                  {[...new Set([...RESTS, ...(r.restS ? [r.restS] : [])])].sort((a, b) => a - b).map(s => <option key={s} value={s}>{restText(s)}</option>)}
                </select>
              </label>
              {r.note && <p className="mt-1 truncate text-xs text-muted">{r.note}</p>}
            </div>
            )
          })}
        </div>
      )}

      {/* Add an exercise: the logger's search, or a name of your own. */}
      <form className="space-y-2 rounded-2xl border border-dashed border-line p-3" onSubmit={e => (e.preventDefault(), add(q))}>
        <div className="flex gap-2">
          <label className="input flex h-11 items-center gap-2 focus-within:border-accent">
            <Icon d={SEARCH} className="size-4 shrink-0 text-muted" />
            <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder={rows.length ? 'Add another exercise' : 'Add an exercise'} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" aria-label="Add an exercise" />
          </label>
          <button className="btn" disabled={!q.trim()}>Add</button>
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
                    <span className="block text-xs text-muted">{last && top ? <>Last {ago(last.date).toLowerCase()}: {setText(top)}</> : 'Not done yet'}</span>
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

      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <button className={`btn relative min-h-12 w-full text-base ${busy ? 'busy' : ''}`} disabled={busy} aria-busy={busy} onClick={() => void save()}>
        <Tap />{routine ? 'Save routine' : rows.length ? `Save routine · ${rows.length} exercise${rows.length === 1 ? '' : 's'}` : 'Save routine'}
      </button>
    </div>
  )
}
