import type { ChartConfiguration } from 'chart.js'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCENT, ACCENT_2, Chart, sparkConfig, STRAVA } from '../components/Chart'
import { BodyMap } from '../components/BodyMap'
import { Card, Line, SourceBadge, Stat, Tabs } from '../components/ui'
import { api, useData } from '../lib/data'
import { ago, daysAgo, duration, greeting, kg, km, num, pace, plural, shortDate, today, weekStart } from '../lib/format'
import { overallLine } from '../lib/motivation'
import { mainExercises, MUSCLES, muscleSets, runPace, weekly, weekStreak } from '../lib/stats'

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
  const streak = weekStreak(model)
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat accent value={plural(week.gym, 'session')} label="Gym this week" /></Card>
        <Card><Stat accent value={km(week.km, 1)} label={`${plural(week.runs, 'run')} this week`} /></Card>
        <Card><Stat accent value={kg(Math.round(week.volume))} label="Lifted this week" /></Card>
        <Card><Stat accent value={`${streak} wk${streak === 1 ? '' : 's'}`} label="Active streak" sub="Weeks in a row with a session" /></Card>
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
                    <div className="hidden h-9 w-28 sm:block"><Chart height={36} label={`${x.exercise.name} trend`} config={sparkConfig(x.series.map(p => p.value))} /></div>
                    <div className="w-24 text-right">
                      <div className="font-semibold tabular-nums">{x.best ? kg(x.best) : '–'}</div>
                      <div className={`text-xs tabular-nums ${x.change > 0 ? 'text-good' : x.change < 0 ? 'text-bad' : 'text-muted'}`}>{x.change > 0 ? '▲ ' : x.change < 0 ? '▼ ' : ''}{x.change ? kg(Math.abs(x.change)) : 'steady'}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No gym sessions in this period.</p>}
        </Card>
        <Card className="lg:col-span-2" title="Muscle distribution" action={<Tabs size="sm" value={muscleView} onChange={pickMuscleView} options={[{ value: 'body', label: 'Body' }, { value: 'radar', label: 'Radar' }]} />}>
          {muscleView === 'body' ? <BodyMap {...split} /> : <Chart height={280} label="Sets per muscle group" config={radar} />}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Last 12 weeks"><Chart height={220} label="Sessions per week" config={weekChart} /></Card>
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
        </Card>
      </div>

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
