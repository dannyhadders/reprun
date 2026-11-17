import type { ChartConfiguration } from 'chart.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { estimateS } from '../../shared/plan'
import { routineRows, Time } from '../components/Planner'
import { Tap } from '../lib/haptic'
import { fromRoutine, loadActive, saveActive } from '../lib/session'
import { ACCENT, ACCENT_2, Chart, sparkConfig, STRAVA } from '../components/Chart'
import { BodyMap } from '../components/BodyMap'
import { Card, Empty, Line, Sheet, SourceBadge, Stat, Tabs, useCountUp } from '../components/ui'
import { api, useData } from '../lib/data'
import { ago, daysAgo, duration, greeting, kg, km, num, pace, plural, shortDate, today, weekStart } from '../lib/format'
import { overallLine } from '../lib/motivation'
import { lastSets, mainExercises, MUSCLES, muscleSets, runPace, weekly, weekStreak } from '../lib/stats'
import { milestones, type Milestone } from '../lib/milestones'

export default function Home() {
  const { model, data } = useData()
  const [days, setDays] = useState<'30' | '90'>('30')
  const n = +days

  const thisWeek = weekStart(today())
  const week = useMemo(() => {
    const s = model.sessions.filter(x => x.date >= thisWeek)
    const r = model.runs.filter(x => x.date >= thisWeek)
    return { gym: s.length, runs: r.length, km: r.reduce((a, x) => a + (x.distance_m ?? 0), 0), volume: s.reduce((a, x) => a + x.volume, 0) }
  }, [model, thisWeek])
  const streak = weekStreak(model, data.profile.weekly)
  const headline = useMemo(() => overallLine(model, model.sessions, model.runs.reduce((a, r) => a + (r.distance_m ?? 0), 0)), [model])

  const main = useMemo(() => mainExercises(model, n), [model, n])
  const split = useMemo(() => ({ now: muscleSets(model, daysAgo(n)), before: muscleSets(model, daysAgo(n * 2), daysAgo(n + 1)) }), [model, n])
  const [muscleView, setMuscleView] = useState<'body' | 'radar'>(() => { try { return localStorage.getItem('muscleView') === 'radar' ? 'radar' : 'body' } catch { return 'body' } })
  const pickMuscleView = (v: 'body' | 'radar') => { setMuscleView(v); try { localStorage.setItem('muscleView', v) } catch { /* private mode */ } }
  const radar = useMemo<ChartConfiguration>(() => {
    const { now, before } = split
    return {
      type: 'radar',
      data: {
        labels: MUSCLES.map(m => m[0].toUpperCase() + m.slice(1)),
        datasets: [
          { label: `Last ${n} days`, data: MUSCLES.map(m => now[m]), borderColor: ACCENT_2, backgroundColor: 'rgba(34,211,238,0.18)', pointBackgroundColor: ACCENT_2, borderWidth: 2 },
          { label: `Previous ${n} days`, data: MUSCLES.map(m => before[m]), borderColor: 'rgba(129,140,248,0.6)', backgroundColor: 'rgba(129,140,248,0.06)', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: {
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.r} sets` } } },
        scales: { r: { angleLines: { color: '#242a38' }, grid: { color: '#242a38' }, pointLabels: { color: '#e8eaf0', font: { size: 12, weight: 600 } }, ticks: { display: false }, beginAtZero: true } },
      },
    }
  }, [split, n])

  const weeks = useMemo(() => weekly(model, 12), [model])
  const weekChart = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: weeks.map(w => shortDate(w.week)),
      datasets: [
        { label: 'Gym', data: weeks.map(w => w.gym), backgroundColor: ACCENT, borderRadius: 4, stack: 's' },
        { label: 'Runs', data: weeks.map(w => w.runs), backgroundColor: STRAVA, borderRadius: 4, stack: 's' },
      ],
    },
    options: {
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { title: i => `Week of ${i[0].label}` } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } }, y: { stacked: true, ticks: { precision: 0 } } },
    },
  }), [weeks])

  const recent = useMemo(() => [
    ...model.sessions.slice(0, 6).map(s => ({ date: s.date, key: s.key, kind: 'gym' as const, s })),
    ...model.runs.slice(0, 6).map(r => ({ date: r.date, key: `r${r.id}`, kind: 'run' as const, r })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [model])

  return (
    <div className="space-y-5">
      <header>
        <p className="text-muted">{greeting()}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{headline}</h1>
      </header>
      <NextUp />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat accent value={<Up to={week.gym} fmt={n => plural(Math.round(n), 'session')} />} label="Gym this week" /></Card>
        <Card><Stat accent value={<Up to={week.km} fmt={n => km(n, 1)} />} label={`${plural(week.runs, 'run')} this week`} /></Card>
        <Card><Stat accent value={<Up to={week.volume} fmt={n => kg(Math.round(n))} />} label="Lifted this week" /></Card>
        <Card><Streak {...streak} /></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Main exercises" action={<Tabs size="sm" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '90', label: '3 months' }]} />}>
          {main.length ? (
            <ul className="divide-y divide-line">
              {main.map(x => (
                <li key={x.exercise.id}>
                  <Link to={`/exercises/${x.exercise.id}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{x.exercise.name}</div>
                      <div className="text-xs text-muted"><span className="capitalize">{x.exercise.muscle}</span> · {plural(x.sets, 'set')}</div>
                    </div>
                    <div className={`hidden h-9 w-28 ${x.series.length > 1 ? 'sm:block' : ''}`}><Chart height={36} label={`${x.exercise.name} trend`} config={sparkConfig(x.series.map(p => p.value))} /></div>
                    <div className="w-24 text-right">
                      <div className="font-semibold tabular-nums">{x.best ? kg(x.best) : '–'}</div>
                      <div className={`text-xs tabular-nums ${x.change > 0 ? 'text-good' : x.change < 0 ? 'text-bad' : 'text-muted'}`}>{x.change > 0 ? '▲ ' : x.change < 0 ? '▼ ' : ''}{x.change ? kg(Math.abs(x.change)) : x.points < 2 ? 'new' : 'steady'}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No gym sessions in this period.</p>}
        </Card>
        <Card className="lg:col-span-2" title="Muscle distribution" action={<Tabs size="sm" value={muscleView} onChange={pickMuscleView} options={[{ value: 'body', label: 'Body' }, { value: 'radar', label: 'Radar' }]} />}>
          {MUSCLES.every(m => !split.now[m] && !split.before[m]) ? <Empty>No gym sets in the last {n} days.</Empty>
            : muscleView === 'body' ? <BodyMap {...split} /> : <Chart height={280} label="Sets per muscle group" config={radar} />}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Last 12 weeks">{weeks.some(w => w.gym || w.runs) ? <Chart height={220} label="Sessions per week" config={weekChart} /> : <Empty>Nothing in the last 12 weeks yet.</Empty>}</Card>
        <Card className="lg:col-span-2" title="Recent" action={<Link to="/workouts" className="text-sm text-accent hover:underline">All</Link>}>
          <ul className="space-y-3">
            {recent.map(x => (
              <li key={x.key} className="flex items-center gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${x.kind === 'gym' ? 'bg-accent/15 text-accent' : 'bg-strava/15 text-strava'}`}>{x.kind === 'gym' ? '🏋️' : '🏃'}</div>
                <div className="min-w-0 flex-1">
                  <Link to={x.kind === 'gym' ? `/workouts#${x.key}` : '/runs'} className="block truncate text-sm font-semibold hover:underline">
                    {x.kind === 'gym' ? x.s.title : x.r.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {ago(x.date)} · {x.kind === 'gym' ? `${duration(x.s.durationS)}${x.s.sets ? ` · ${plural(x.s.sets, 'set')}` : ''}` : `${km(x.r.distance_m)} · ${pace(runPace(x.r))}`}
                  </div>
                </div>
                <SourceBadge source={x.kind === 'gym' ? (x.s.workout?.source ?? 'strava') : x.r.source} sample={x.kind === 'gym' ? (!x.s.workout && x.s.activity?.sample) || 0 : x.r.sample} />
              </li>
            ))}
          </ul>
          {!recent.length && <Empty>Log your first workout with the + button{data.strava.configured && !data.strava.connected ? ', or connect Strava in Settings' : ''}.</Empty>}
        </Card>
      </div>

      <Milestones />

      <div className="grid gap-5 lg:grid-cols-2">
        <BodyWeight />
        <Card title="Targets">
          {data.goals.length ? (
            <ul className="space-y-3">
              {data.goals.slice(0, 5).map(g => {
                const ex = data.exercises.find(e => e.name === g.exercise)
                return (
                  <li key={g.id} className="text-sm">
                    <div className="font-semibold">{ex ? <Link className="hover:underline" to={`/exercises/${ex.id}`}>{g.exercise}</Link> : g.exercise}</div>
                    <Line>{g.target}</Line>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-muted">No targets yet.</p>}
        </Card>
      </div>
    </div>
  )
}

// ponytail: once per app open. Counting up on every visit to Home would get old fast.
let counted = false
function Up({ to, fmt }: { to: number; fmt: (n: number) => string }) {
  const [animate, setAnimate] = useState(() => !counted)
  useEffect(() => {
    counted = true
    const t = setTimeout(() => setAnimate(false), 950) // after the first count, later changes just show
    return () => clearTimeout(t)
  }, [])
  const v = useCountUp(to, 900)
  return <>{fmt(animate ? v : to)}</>
}

/** The routine due next, one tap from opening the app. Hidden while a workout is running (the bar covers that) or with no routines. */
function NextUp() {
  const { data, model } = useData()
  const nav = useNavigate()
  const { next } = useMemo(() => routineRows(data, model), [data, model])
  if (!next || loadActive()) return null
  const begin = () => (saveActive(fromRoutine(next.r, data.exercises, n => lastSets(model, n), data.aliases)), nav('/log'))
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Next up</p>
        <h2 className="truncate text-lg font-bold">{next.r.name}</h2>
        <p className="truncate text-xs text-muted"><Time s={estimateS(next.items)} /> · {plural(next.items.length, 'exercise')} · {next.last ? `last done ${ago(next.last).toLowerCase()}` : 'not done yet'}</p>
      </div>
      <button className="btn relative min-h-11 shrink-0 px-5" onClick={begin}><Tap />Start</button>
    </section>
  )
}

function BodyWeight() {
  const { data, reload } = useData()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const pts = data.bodyWeight
  const latest = pts.at(-1)
  const config = useMemo<ChartConfiguration>(() => ({
    type: 'line',
    data: { labels: pts.map(p => shortDate(p.date)), datasets: [{ data: pts.map(p => p.kg), borderColor: ACCENT_2, pointBackgroundColor: ACCENT_2, tension: 0.3, borderWidth: 2 }] },
    options: { scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => `${v} kg` } } } },
  }), [pts])

  const add = async () => {
    setBusy(true)
    try {
      await api('POST', 'body-weight', { date: today(), kg: +value })
      setValue('')
      await reload()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Body weight" action={latest && <span className="text-sm font-semibold tabular-nums">{kg(latest.kg)}</span>}>
      {pts.length > 1 ? <Chart height={160} label="Body weight over time" config={config} /> : (
        <p className="mb-3 text-sm text-muted">{latest ? `${kg(latest.kg)} on ${shortDate(latest.date)}. Log it weekly to see a trend line here.` : 'Log your weight to start a trend line.'}</p>
      )}
      <form className="mt-3 flex gap-2" onSubmit={e => (e.preventDefault(), value && add())}>
        <input className="input" type="number" step="0.1" min="20" max="300" inputMode="decimal" placeholder={`Today's weight (kg)${latest ? `, last ${num(latest.kg, 1)}` : ''}`} value={value} onChange={e => setValue(e.target.value)} aria-label="Body weight in kg" />
        <button className="btn" disabled={busy || !value}>Log</button>
      </form>
    </Card>
  )
}

/**
 * Weeks in a row at the weekly target (Settings → Profile). The flame grows with the streak and is grey at 0; the dots
 * fill as this week's sessions land.
 */
function Streak({ weeks, thisWeek, target }: ReturnType<typeof weekStreak>) {
  const size = weeks >= 12 ? 'text-3xl' : weeks >= 4 ? 'text-2xl' : weeks ? 'text-xl' : 'text-lg'
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Stat accent value={<Up to={weeks} fmt={n => `${Math.round(n)} wk${Math.round(n) === 1 ? '' : 's'}`} />} label="Streak" />
        <span aria-hidden className={`-mt-5 ${size} leading-none ${weeks ? (weeks >= 4 ? 'animate-flicker' : '') : 'opacity-40 grayscale'}`}>🔥</span>
      </div>
      <div className="mt-1 flex items-center gap-1" role="img" aria-label={`${thisWeek} of ${target} sessions this week`}>
        {Array.from({ length: target }, (_, i) => <span key={i} className={`size-2 shrink-0 rounded-full ${i < thisWeek ? 'bg-accent-2' : 'bg-line'}`} />)}
        <span className="ml-1 truncate text-xs text-muted">{thisWeek >= target ? 'week done' : `${thisWeek}/${target} this week`}</span>
      </div>
    </div>
  )
}

const NEW_DAYS = 7
/** Latest badges earned and the closest ones to come; All opens the whole list. */
function Milestones() {
  const { data, model } = useData()
  const [all, setAll] = useState(false)
  const close = useCallback(() => setAll(false), [])
  const list = useMemo(() => milestones(model, data.profile.weekly), [model, data.profile.weekly])
  const earned = list.filter(m => m.date).sort((a, b) => b.date!.localeCompare(a.date!))
  const next = list.filter(m => !m.date).sort((a, b) => b.progress - a.progress)
  if (!earned.length && !model.sessions.length && !model.runs.length) return null
  return (
    <Card title="Milestones" action={<button className="min-h-9 text-sm text-accent hover:underline" onClick={() => setAll(true)}>All {earned.length}</button>}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {earned.slice(0, 2).map(m => <Badge key={m.key} m={m} />)}
        {next.slice(0, 2).map(m => <Badge key={m.key} m={m} />)}
      </ul>
      {all && (
        <Sheet close={close} label="Milestones">
          <h2 className="text-lg font-bold">Milestones</h2>
          <p className="mb-3 text-sm text-muted">{plural(earned.length, 'reached', 'reached')}, {next.length} on the way.</p>
          <ul className="space-y-3">{[...next, ...earned].map(m => <Badge key={m.key} m={m} />)}</ul>
        </Sheet>
      )}
    </Card>
  )
}

function Badge({ m }: { m: Milestone }) {
  const fresh = m.date && daysAgo(NEW_DAYS) <= m.date
  return (
    <li className={`flex items-center gap-3 ${m.date ? '' : 'opacity-80'}`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-xl ${m.date ? 'bg-pb/15' : 'bg-surface-2 grayscale'}`} aria-hidden>{m.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{m.title}</span>
          {fresh && <span className="shrink-0 rounded-full bg-pb/15 px-1.5 py-0.5 text-[10px] font-bold text-pb">NEW</span>}
        </div>
        {m.date ? <div className="text-xs text-muted">{ago(m.date)}</div> : (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-linear-to-r from-accent to-accent-2" style={{ width: `${Math.max(2, m.progress * 100)}%` }} /></div>
            <span className="text-xs tabular-nums text-muted">{Math.floor(m.progress * 100)}%</span>
          </div>
        )}
      </div>
    </li>
  )
}
