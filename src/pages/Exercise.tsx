import type { ChartConfiguration } from 'chart.js'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MUSCLE_LIST } from '../../shared/exercises'
import type { Exercise as Ex, Muscle } from '../../shared/types'
import { ACCENT_2, Chart, gradientFill, gradientStroke } from '../components/Chart'
import { ask, Card, Empty, Line, PageHeader, PbBadge, Stat, Tabs } from '../components/ui'
import { api, useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { date as fmtDate, kg, num, plural, shortDate } from '../lib/format'
import { LIFT_NAMES, standing } from '../lib/standards'
import { e1rm, exerciseBests, exerciseSeries, METRICS, RANGES, type MetricKey, type RangeKey } from '../lib/stats'

export default function Exercise() {
  const { id } = useParams()
  const { model, data } = useData()
  const ex = model.exById.get(Number(id))
  const [metric, setMetric] = useState<MetricKey>('heaviest')
  const [range, setRange] = useState<RangeKey>('All')
  const [editing, setEditing] = useState(false)

  const b = useMemo(() => (ex ? exerciseBests(model, ex.id) : null), [model, ex])
  const timed = !!b && !b.heaviest && !!b.longestHold
  const metrics = (timed ? ['hold'] : b?.heaviest ? ['heaviest', 'e1rm', 'bestSet', 'volume', 'reps'] : ['reps']) as MetricKey[]
  const activeMetric = metrics.includes(metric) ? metric : metrics[0]
  const series = useMemo(() => (ex ? exerciseSeries(model, ex.id, activeMetric, range) : []), [model, ex, activeMetric, range])

  const config = useMemo<ChartConfiguration>(() => ({
    type: 'line',
    data: {
      labels: series.map(p => shortDate(p.date)),
      datasets: [{ data: series.map(p => p.value), borderColor: gradientStroke, backgroundColor: gradientFill, fill: true, pointBackgroundColor: ACCENT_2, pointRadius: 4, pointHoverRadius: 6, borderWidth: 3, tension: 0.3 }],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: c => ` ${num(c.parsed.y ?? 0, 1)} ${METRICS[activeMetric].unit}` } } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: false, ticks: { callback: v => `${num(+v)} ${METRICS[activeMetric].unit}` } } },
    },
  }), [series, activeMetric])

  if (!ex || !b) return <Empty>That exercise doesn't exist. <Link className="text-accent" to="/exercises">Back to exercises</Link></Empty>

  const st = ex.lift && b.oneRm ? standing(ex.lift, b.oneRm.value, data.profile) : null
  const goal = data.goals.find(g => g.exercise === ex.name)
  const hist = [...(model.exHistory.get(ex.id) ?? [])].reverse()
  const change = series.length > 1 ? series.at(-1)!.value - series[0].value : 0

  return (
    <div className="space-y-5">
      <Link to="/exercises" className="text-sm text-muted hover:text-ink">← Exercises</Link>
      <PageHeader title={ex.name} sub={<><span className="capitalize">{ex.muscle}</span> · {plural(b.sessions, 'session')} · {plural(b.totalSets, 'set')}</>}
        action={!editing && <button className="relative btn-ghost" onClick={() => setEditing(true)}><Tap />Edit</button>} />
      {editing && <EditExercise key={ex.id} ex={ex} done={() => setEditing(false)} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {timed ? (
          <Card><Stat accent value={`${num(b.longestHold!.value)}s`} label="Longest hold" sub={shortDate(b.longestHold!.date)} /></Card>
        ) : (
          <>
            <Card><Stat accent value={b.heaviest ? kg(b.heaviest.value) : '–'} label="Heaviest weight" sub={b.heaviest && `× ${num(b.heaviest.set.reps ?? 0)} · ${shortDate(b.heaviest.date)}`} /></Card>
            <Card><Stat accent value={b.oneRm ? kg(Math.round(b.oneRm.value * 10) / 10) : '–'} label="Est. 1RM" sub={b.oneRm && `from ${kg(b.oneRm.set.weight_kg)} × ${num(b.oneRm.set.reps ?? 0)}`} /></Card>
            <Card><Stat accent value={b.bestSet ? kg(b.bestSet.value) : '–'} label="Best set volume" sub={b.bestSet && shortDate(b.bestSet.date)} /></Card>
            <Card><Stat accent value={b.bestSession ? kg(b.bestSession.value) : '–'} label="Best session volume" sub={b.bestSession && shortDate(b.bestSession.date)} /></Card>
          </>
        )}
        <Card><Stat accent value={b.mostReps ? num(b.mostReps.value) : '–'} label="Most reps in a set" sub={b.mostReps && shortDate(b.mostReps.date)} /></Card>
      </div>

      <Card
        title={METRICS[activeMetric].label}
        action={change !== 0 && <span className={`text-sm font-semibold ${change > 0 ? 'text-good' : 'text-bad'}`}>{change > 0 ? '▲' : '▼'} {num(Math.abs(change), 1)} {METRICS[activeMetric].unit} over this range</span>}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {metrics.length > 1 && <Tabs size="sm" value={activeMetric} onChange={setMetric} options={metrics.map(k => ({ value: k, label: METRICS[k].label }))} />}
          <Tabs size="sm" value={range} onChange={setRange} options={Object.keys(RANGES) as RangeKey[]} />
        </div>
        {series.length > 1 ? <Chart height={280} label={`${METRICS[activeMetric].label} for ${ex.name}`} config={config} /> : <Empty>{series.length ? 'One session in this range. Another one and there\'s a line.' : 'Nothing logged in this range.'}</Empty>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {st && b.oneRm && (
          <Card title="Strength level" action={<span className="text-xs text-muted">approx.</span>}>
            <div className="flex items-end justify-between gap-4">
              <Stat accent value={st.level} label={`Stronger than ~${st.pct}% of men your weight who lift`} />
              <div className="text-right text-sm text-muted">{num(st.ratio, 2)}× body weight</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full grad-bg" style={{ width: `${st.pct}%` }} /></div>
            {st.next && <div className="mt-4"><Line>Next up: {st.next.level} at about {kg(st.next.kg)} est. 1RM for {LIFT_NAMES[ex.lift!]}, {kg(Math.max(0, Math.round(st.next.kg - b.oneRm.value)))} to go.</Line></div>}
            <p className="mt-3 text-xs text-muted">Rough guide from published lifter standards at {kg(data.profile.weight_kg)} body weight. Not UK-specific or age-adjusted. Update your weight in Settings.</p>
          </Card>
        )}

        {b.setRecords.length > 0 && (
          <Card title="Set records" action={<span className="text-xs text-muted">Best weight for each rep count</span>}>
            <table className="w-full text-sm">
              <tbody>
                {b.setRecords.map(([reps, r]) => (
                  <tr key={reps} className="border-t border-line/60 first:border-0">
                    <td className="py-2 text-muted">{plural(reps, 'rep')}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{kg(r.kg)}</td>
                    <td className="w-24 py-2 text-right text-xs text-muted">{shortDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {goal && (
          <Card title="Target">
            <Line>{goal.target}</Line>
            {goal.latest && <p className="mt-3 text-sm text-muted">Latest when set: {goal.latest}</p>}
            {goal.context && <p className="mt-1 text-sm text-muted">{goal.context}</p>}
          </Card>
        )}
      </div>

      <Card title="History">
        <ul className="space-y-4">
          {hist.map(h => (
            <li key={h.workoutId} className="border-t border-line/60 pt-4 first:border-0 first:pt-0">
              <Link to={`/workouts#w${h.workoutId}`} className="text-sm font-semibold hover:text-accent">{fmtDate(h.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Link>
              <div className="mt-2 flex flex-wrap gap-2">
                {h.sets.map(s => {
                  const est = e1rm(s)
                  return (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-sm tabular-nums">
                      {s.weight_kg !== null ? `${num(s.weight_kg, 1)} kg` : 'BW'}
                      {s.reps !== null ? ` × ${num(s.reps)}` : s.seconds !== null ? ` × ${num(s.seconds)}s` : ''}
                      {est && <span className="text-xs text-muted">({num(est, 0)})</span>}
                      <PbBadge kinds={model.pbs.get(s.id)} />
                    </span>
                  )
                })}
              </div>
              {/* Set notes as text: a phone can't hover for a tooltip. */}
              {h.sets.some(s => s.notes) && (
                <p className="mt-2 text-xs text-muted">{h.sets.map((s, n) => s.notes && `Set ${n + 1}: ${s.notes}`).filter(Boolean).join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/** Rename, re-file, or merge into another exercise. The server keeps the old name as an alias (shared/exercises.ts). */
function EditExercise({ ex, done }: { ex: Ex; done: () => void }) {
  const { data, model, reload } = useData()
  const nav = useNavigate()
  const [name, setName] = useState(ex.name)
  const [muscle, setMuscle] = useState<Muscle>(ex.muscle)
  const [into, setInto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sets = (id: number) => (model.exHistory.get(id) ?? []).reduce((n, h) => n + h.sets.length, 0)
  const others = data.exercises.filter(e => e.id !== ex.id).sort((a, b) => a.name.localeCompare(b.name))
  const oldNames = Object.entries(data.aliases).filter(([, to]) => to === ex.name).map(([from]) => from)

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await f() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const merge = async (target: Ex, why = '') => {
    if (!await ask(`${why}Move ${plural(sets(ex.id), 'set')} from "${ex.name}" into "${target.name}"?\n\n"${ex.name}" disappears, and its history, PBs and targets become part of "${target.name}". Typing "${ex.name}" later also lands on "${target.name}" (you can undo that under Old names). The merge itself can't be undone.`, 'Merge', true)) return
    return run(async () => {
      await api('POST', `exercises/${ex.id}/merge`, { into: target.id })
      await reload()
      done() // close the panel: it belonged to the exercise that's gone
      nav(`/exercises/${target.id}`, { replace: true })
    })
  }
  const save = () => {
    const clash = name.trim() !== ex.name && others.find(e => e.name.toLowerCase() === name.trim().toLowerCase())
    if (clash) return merge(clash, `You already have "${clash.name}". `)
    return run(async () => {
      await api('PATCH', `exercises/${ex.id}`, { name: name.trim(), muscle })
      await reload()
      done()
    })
  }

  return (
    <Card title="Edit exercise">
      <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={e => (e.preventDefault(), save())}>
        <label className="text-sm text-muted">Name<input className="input mt-1" value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>
        <label className="text-sm text-muted">Muscle
          <select className="input mt-1 capitalize" value={muscle} onChange={e => setMuscle(e.target.value as Muscle)}>
            {MUSCLE_LIST.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted sm:col-span-2">Routines and targets follow the new name, and anything still using the old one (a routine, a workout waiting to upload) lands here.</p>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn" disabled={busy || !name.trim()}>Save</button>
          <button type="button" className="btn-ghost" onClick={done}>Cancel</button>
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-semibold">Merge into another exercise</p>
        <p className="mt-1 text-xs text-muted">For a typo or the same lift under two names: all {plural(sets(ex.id), 'set')} move over and this one disappears.</p>
        <div className="mt-3 flex gap-2">
          <select className="input" value={into} onChange={e => setInto(e.target.value)} aria-label="Merge into">
            <option value="">Pick an exercise…</option>
            {others.map(e => <option key={e.id} value={e.id}>{e.name} ({plural(sets(e.id), 'set')})</option>)}
          </select>
          <button className="btn-danger shrink-0" disabled={busy || !into} onClick={() => merge(others.find(e => e.id === Number(into))!)}>Merge</button>
        </div>
      </div>
      {oldNames.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-semibold">Old names that land here</p>
          <p className="mt-1 text-xs text-muted">Typing one of these files it under {ex.name}. Forget one if it's really a different exercise (say, a different machine).</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {oldNames.map(n => (
              <li key={n} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
                {n}
                <button className="icon-btn -my-2" aria-label={`Forget ${n}`} disabled={busy}
                  onClick={async () => await ask(`Forget "${n}"? Typing it will make a new exercise again. Nothing already logged changes.`, 'Forget') && run(async () => (await api('DELETE', `aliases/${encodeURIComponent(n)}`), await reload()))}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </Card>
  )
}
