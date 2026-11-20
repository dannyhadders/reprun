import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { WorkoutSet } from '../../shared/types'
import { ask, CopyButton, Empty, Icon, Line, PageHeader, PbBadge, ShareButton, SourceBadge, Tabs } from '../components/ui'
import { api, useData } from '../lib/data'
import { duration, kg, monthLabel, plural, setText, shown, toKg, unitOf, weekday, workoutText, date as fmtDate, type Unit } from '../lib/format'
import { e1rm, type Session } from '../lib/stats'

const PENCIL = 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4'
const BIN = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'

export default function Workouts() {
  const { model } = useData()
  const { hash } = useLocation()
  const [filter, setFilter] = useState<'all' | 'logged' | 'strava'>('all')
  const [open, setOpen] = useState<string | null>(hash.slice(1) || null)

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  const list = model.sessions.filter(s => filter === 'all' || (filter === 'logged' ? s.workout : !s.workout))
  const months = useMemo(() => {
    const g = new Map<string, Session[]>()
    for (const s of list) g.set(s.date.slice(0, 7), [...(g.get(s.date.slice(0, 7)) ?? []), s])
    return [...g]
  }, [list])

  return (
    <div>
      <PageHeader
        title="Workouts"
        sub={`${plural(model.sessions.length, 'gym session')}, ${plural(model.sessions.filter(s => s.workout).length, 'with full set detail', 'with full set detail')}`}
        action={<Tabs value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'logged', label: 'Logged sets' }, { value: 'strava', label: 'Strava only' }]} />}
      />
      <div className="space-y-8">
        {months.map(([month, sessions]) => (
          <section key={month}>
            <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold text-muted">
              <span className="uppercase tracking-wider">{monthLabel(month + '-01')}</span>
              <span>{plural(sessions.length, 'workout')}</span>
            </h2>
            <div className="space-y-3">
              {sessions.map(s => <WorkoutCard key={s.key} s={s} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} />)}
            </div>
          </section>
        ))}
        {!months.length && <Empty>{model.sessions.length ? 'Nothing for this filter.' : 'No workouts yet. Tap + to log your first.'}</Empty>}
      </div>
    </div>
  )
}

function WorkoutCard({ s, open, onToggle }: { s: Session; open: boolean; onToggle: () => void }) {
  const { model, lines } = useData()
  const [editing, setEditing] = useState(false)
  const w = s.workout
  // The workout with exercise names filled in, for the picture and the copied text. Memoised: the picture redraws when it changes.
  const named = useMemo(() => w && w.sets.length ? { ...w, duration_s: s.durationSource === 'estimate' ? null : s.durationS, sets: w.sets.map(x => ({ ...x, exercise: model.exById.get(x.exercise_id)?.name ?? '?' })) } : null, [w, s, model])
  const pbNames = useMemo(() => [...new Set((w?.sets ?? []).filter(x => model.pbs.has(x.id)).map(x => model.exById.get(x.exercise_id)?.name ?? '?'))], [w, model])
  const groups = useMemo(() => {
    const g = new Map<number, WorkoutSet[]>()
    for (const x of w?.sets ?? []) g.set(x.exercise_id, [...(g.get(x.exercise_id) ?? []), x])
    return [...g]
  }, [w])

  return (
    <article id={s.key} className={`scroll-mt-6 overflow-hidden rounded-2xl border bg-surface transition ${open ? 'border-accent/50' : 'border-line'}`}>
      <button onClick={onToggle} className="w-full p-4 text-left md:p-5" aria-expanded={open}>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-center leading-none">
            <div>
              <div className="text-base font-bold">{s.date.slice(8)}</div>
              <div className="text-[10px] uppercase text-muted">{fmtDate(s.date, { month: 'short' })}</div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{s.title}</h3>
              <SourceBadge source={w?.source ?? 'strava'} sample={!w && s.activity?.sample} />
              {s.pbs > 0 && <span className="rounded-full bg-pb/15 px-2 py-0.5 text-[11px] font-bold text-pb">🏆 {plural(s.pbs, 'PB')}</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span>{weekday(s.date)}</span>
              <span className="inline-flex items-center gap-1">⏱ {duration(s.durationS)} {s.durationSource && <SourceBadge source={s.durationSource} sample={s.durationSource === 'strava' && s.activity?.sample} />}</span>
              {s.volume > 0 && <span>🏋️ {kg(Math.round(s.volume))}</span>}
              {s.sets > 0 && <span>{plural(s.sets, 'set')}</span>}
              {s.activity?.avg_hr && <span>❤️ {Math.round(s.activity.avg_hr)} bpm</span>}
            </div>
            <div className="mt-2"><Line>{lines.get(s.key)}</Line></div>
            {!open && groups.length > 0 && (
              <p className="mt-2 truncate text-sm text-muted">
                {groups.slice(0, 4).map(([id, sets]) => `${sets.length} × ${model.exById.get(id)?.name}`).join(' · ')}
                {groups.length > 4 && ` · +${groups.length - 4} more`}
              </p>
            )}
          </div>
          <Icon d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} className="mt-1 h-5 w-5 shrink-0 text-muted" />
        </div>
      </button>

      {open && editing && <WorkoutEditor s={s} groups={groups} close={() => setEditing(false)} />}
      {open && !editing && (
        <div className="border-t border-line bg-bg/40 p-4 md:p-5">
          {w?.notes && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">{w.notes}</p>}
          {groups.length ? (
            <div className="space-y-5">
              {groups.map(([exId, sets]) => (
                <div key={exId}>
                  <Link to={`/exercises/${exId}`} className="font-semibold text-accent hover:underline">{model.exById.get(exId)?.name}</Link>
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr><th className="w-12 py-1 font-medium">Set</th><th className="py-1 font-medium">kg × reps</th><th className="hidden w-24 py-1 text-right font-medium sm:table-cell">Est. 1RM</th></tr>
                    </thead>
                    <tbody>{sets.map((x, i) => <SetRow key={x.id} set={x} n={x.warmup ? 0 : sets.slice(0, i + 1).filter(y => !y.warmup).length} />)}</tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Timed by {s.activity?.sample ? 'sample ' : ''}Strava ({s.activity?.name}{s.activity?.start ? `, started ${s.activity.start}` : ''}). No sets were logged for this one; once the logging app exists, they will be.
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {named && <ShareButton w={named} pbs={pbNames} line={lines.get(s.key)} />}
            {named && <CopyButton label="Copy as text" text={() => workoutText(named)} />}
            <button className="btn-ghost" onClick={() => setEditing(true)}><Icon d={PENCIL} className="h-4 w-4" /> Edit</button>
          </div>
        </div>
      )}
    </article>
  )
}

function SetRow({ set, n }: { set: WorkoutSet; n: number }) {
  const { model } = useData()
  const est = set.warmup ? null : e1rm(set) // a warm-up's 1RM estimate means nothing
  const name = model.exById.get(set.exercise_id)?.name
  return (
    // A warm-up shows as W, lighter; the working sets are numbered 1, 2, 3 after it.
    <tr className={`border-t border-line/60 align-top ${set.warmup ? 'text-muted' : ''}`}>
      <td className="py-2 text-muted">{set.warmup ? <abbr title="Warm-up" className="text-xs font-extrabold no-underline">W</abbr> : n}</td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums">{setText(set, name)}</span>
          <PbBadge kinds={model.pbs.get(set.id)} />
        </div>
        {set.notes && <div className="mt-0.5 text-xs text-muted">{set.notes}</div>}
      </td>
      <td className="hidden py-2 text-right text-muted tabular-nums sm:table-cell">{est ? kg(Math.round(est * 10) / 10, name) : '–'}</td>
    </tr>
  )
}

const timed = (set: WorkoutSet) => set.seconds !== null && set.reps === null
type Draft = { weight: string; reps: string; removed: boolean; u: Unit } // u: the unit the weight box was filled in, kept even if it changes meanwhile

/** The whole workout editable at once: title, notes, every set. Delete lives here, out of the way. */
function WorkoutEditor({ s, groups, close }: { s: Session; groups: [number, WorkoutSet[]][]; close: () => void }) {
  const { model, reload } = useData()
  const w = s.workout
  const [title, setTitle] = useState(w?.title ?? '')
  const [notes, setNotes] = useState(w?.notes ?? '')
  // Weights in each exercise's own unit (lb for one in lb), back to kg when saved: in the unit the box was filled in.
  const [sets, setSets] = useState(() => new Map<number, Draft>((w?.sets ?? []).map(x => {
    const u = unitOf(model.exById.get(x.exercise_id)?.name)
    return [x.id, { weight: shown(x.weight_kg, u), reps: (timed(x) ? x.seconds : x.reps)?.toString() ?? '', removed: false, u }]
  })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const edit = (id: number, d: Partial<Draft>) => setSets(new Map(sets).set(id, { ...sets.get(id)!, ...d }))

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await f()
      await reload()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  // ponytail: one request per changed set; a workout is ~30 sets, so a batch endpoint isn't worth it yet.
  const save = () => run(async () => {
    if (!w) return
    if (title !== (w.title ?? '') || notes !== (w.notes ?? '')) await api('PATCH', `workouts/${w.id}`, { title: title.trim() || null, notes: notes.trim() || null })
    for (const x of w.sets) {
      const d = sets.get(x.id)!
      if (d.removed) await api('DELETE', `sets/${x.id}`)
      else if (d.weight !== shown(x.weight_kg, d.u) || d.reps !== ((timed(x) ? x.seconds : x.reps)?.toString() ?? '')) {
        // Weight untouched (only the reps changed): send it back exactly as stored, not via the box's rounding.
        const weight_kg = d.weight === shown(x.weight_kg, d.u) ? x.weight_kg ?? '' : d.weight === '' ? '' : toKg(+d.weight, d.u)
        await api('PATCH', `sets/${x.id}`, { weight_kg, reps: timed(x) ? null : d.reps, seconds: timed(x) ? d.reps : null, notes: x.notes })
      }
    }
  })
  const remove = async () => await ask(w ? `Delete ${s.title} on ${fmtDate(s.date)} and all ${s.sets} sets?` : 'Delete this Strava activity from RepRun? (It stays in Strava, and comes back on the next full sync.)', 'Delete', true)
    && run(() => api('DELETE', w ? `workouts/${w.id}` : `activities/${s.activity!.id}`))

  return (
    <div className="space-y-5 border-t border-line bg-bg/40 p-4 md:p-5">
      {w && (
        <div className="space-y-2">
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Workout name" aria-label="Workout name" />
          <textarea className="input min-h-20" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" aria-label="Workout notes" />
        </div>
      )}
      {groups.map(([exId, list]) => (
        <div key={exId}>
          <p className="font-semibold">{model.exById.get(exId)?.name}</p>
          <div className="mt-2 grid grid-cols-[1.5rem_1fr_auto_1fr_2.75rem] items-center gap-2 text-sm">
            {list.map((x, i) => {
              const d = sets.get(x.id)!
              return [
                <span key={`n${x.id}`} className={`text-center text-muted ${d.removed ? 'line-through' : ''} ${x.warmup ? 'text-xs font-extrabold' : ''}`}>{x.warmup ? 'W' : list.slice(0, i + 1).filter(y => !y.warmup).length}</span>,
                <input key={`w${x.id}`} className="input px-2 text-center" type="number" step="0.5" min="0" inputMode="decimal" disabled={d.removed} value={d.weight} onChange={e => edit(x.id, { weight: e.target.value })} aria-label={`Set ${i + 1} ${d.u}`} placeholder={d.u} />,
                <span key={`x${x.id}`} className="text-muted">×</span>,
                <input key={`r${x.id}`} className="input px-2 text-center" type="number" step="1" min="0" inputMode="numeric" disabled={d.removed} value={d.reps} onChange={e => edit(x.id, { reps: e.target.value })} aria-label={`Set ${i + 1} ${timed(x) ? 'seconds' : 'reps'}`} placeholder={timed(x) ? 'sec' : 'reps'} />,
                <button key={`d${x.id}`} className="icon-btn" onClick={() => edit(x.id, { removed: !d.removed })} aria-label={d.removed ? `Keep set ${i + 1}` : `Remove set ${i + 1}`}>{d.removed ? '↺' : '✕'}</button>,
              ]
            })}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-danger mr-auto" disabled={busy} onClick={() => void remove()}><Icon d={BIN} className="h-4 w-4" /> Delete {w ? 'workout' : 'activity'}</button>
        <button className="btn-ghost" disabled={busy} onClick={close}>Cancel</button>
        {w && <button className={`btn ${busy ? 'busy' : ''}`} disabled={busy} aria-busy={busy} onClick={() => void save()}>Save</button>}
      </div>
    </div>
  )
}
