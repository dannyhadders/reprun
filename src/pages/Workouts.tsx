import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { WorkoutSet } from '../../shared/types'
import { Icon } from '../components/Layout'
import { CopyButton, Line, PageHeader, PbBadge, SourceBadge, Tabs } from '../components/ui'
import { api, useData } from '../lib/data'
import { duration, kg, monthLabel, num, plural, weekday, workoutText, date as fmtDate } from '../lib/format'
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
      </div>
    </div>
  )
}

function WorkoutCard({ s, open, onToggle }: { s: Session; open: boolean; onToggle: () => void }) {
  const { model, lines, reload } = useData()
  const w = s.workout
  const groups = useMemo(() => {
    const g = new Map<number, WorkoutSet[]>()
    for (const x of w?.sets ?? []) g.set(x.exercise_id, [...(g.get(x.exercise_id) ?? []), x])
    return [...g]
  }, [w])

  const remove = async () => {
    if (!confirm(w ? `Delete ${s.title} on ${fmtDate(s.date)} and all ${s.sets} sets?` : `Delete this Strava activity from RepRun? (It stays in Strava, and comes back on the next full sync.)`)) return
    await api('DELETE', w ? `workouts/${w.id}` : `activities/${s.activity!.id}`)
    await reload()
  }

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

      {open && (
        <div className="border-t border-line bg-bg/40 p-4 md:p-5">
          {w?.notes && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">{w.notes}</p>}
          {groups.length ? (
            <div className="space-y-5">
              {groups.map(([exId, sets]) => (
                <div key={exId}>
                  <Link to={`/exercises/${exId}`} className="font-semibold text-accent hover:underline">{model.exById.get(exId)?.name}</Link>
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr><th className="w-12 py-1 font-medium">Set</th><th className="py-1 font-medium">kg × reps</th><th className="hidden w-24 py-1 text-right font-medium sm:table-cell">Est. 1RM</th><th className="w-20 py-1"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody>{sets.map((x, i) => <SetRow key={x.id} set={x} n={i + 1} />)}</tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Timed by {s.activity?.sample ? 'sample ' : ''}Strava ({s.activity?.name}{s.activity?.start ? `, started ${s.activity.start}` : ''}). No sets were logged for this one; once the logging app exists, they will be.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            {w && groups.length > 0 && <CopyButton label="Copy as text" text={() => workoutText({ ...w, duration_s: s.durationSource === 'estimate' ? null : s.durationS, sets: w.sets.map(x => ({ ...x, exercise: model.exById.get(x.exercise_id)?.name ?? '?' })) })} />}
            <button className="btn-danger" onClick={remove}><Icon d={BIN} className="h-4 w-4" /> Delete {w ? 'workout' : 'activity'}</button>
          </div>
        </div>
      )}
    </article>
  )
}

function SetRow({ set, n }: { set: WorkoutSet; n: number }) {
  const { model, reload } = useData()
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState(set.weight_kg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? set.seconds?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const timed = set.seconds !== null && set.reps === null
  const est = e1rm(set)

  const save = async () => {
    try {
      await api('PATCH', `sets/${set.id}`, { weight_kg: weight, reps: timed ? null : reps, seconds: timed ? reps : null, notes: set.notes })
      setEditing(false)
      setError(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const remove = async () => {
    if (!confirm(`Delete set ${n}?`)) return
    await api('DELETE', `sets/${set.id}`)
    await reload()
  }

  if (editing) {
    return (
      <tr className="border-t border-line/60">
        <td className="py-2 text-muted">{n}</td>
        <td className="py-2" colSpan={2}>
          <form className="flex flex-wrap items-center gap-2" onSubmit={e => (e.preventDefault(), save())}>
            <input className="input w-24" type="number" step="0.5" min="0" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} aria-label="Weight in kg" placeholder="kg" />
            <span className="text-muted">×</span>
            <input className="input w-24" type="number" step="1" min="0" inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} aria-label={timed ? 'Seconds' : 'Reps'} placeholder={timed ? 'sec' : 'reps'} />
            <button className="btn px-3 py-1.5">Save</button>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setEditing(false)}>Cancel</button>
            {error && <span className="w-full text-xs text-bad">{error}</span>}
          </form>
        </td>
        <td />
      </tr>
    )
  }
  return (
    <tr className="group border-t border-line/60 align-top">
      <td className="py-2 text-muted">{n}</td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums">
            {set.weight_kg !== null ? `${num(set.weight_kg, 1)} kg` : set.notes?.includes('bodyweight') ? 'Bodyweight' : '–'}
            {timed ? ` × ${num(set.seconds!)}s` : set.reps !== null ? ` × ${num(set.reps)}` : ''}
          </span>
          <PbBadge kinds={model.pbs.get(set.id)} />
        </div>
        {set.notes && <div className="mt-0.5 text-xs text-muted">{set.notes}</div>}
      </td>
      <td className="hidden py-2 text-right text-muted tabular-nums sm:table-cell">{est ? kg(Math.round(est * 10) / 10) : '–'}</td>
      <td className="py-1 text-right">
        <div className="inline-flex opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label={`Edit set ${n}`}><Icon d={PENCIL} className="h-4 w-4" /></button>
          <button className="icon-btn hover:text-bad" onClick={remove} aria-label={`Delete set ${n}`}><Icon d={BIN} className="h-4 w-4" /></button>
        </div>
      </td>
    </tr>
  )
}
