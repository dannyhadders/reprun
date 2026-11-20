import type { ChartConfiguration } from 'chart.js'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { C, Chart } from '../components/Chart'
import { Heatmap } from '../components/Heatmap'
import { Card, Empty, Line, PbBadge, Tabs } from '../components/ui'
import { useData } from '../lib/data'
import { useFeature } from '../lib/features'
import { duration, kg, km, num, pace, plural, setText, shortDate } from '../lib/format'
import { overallLine } from '../lib/motivation'
import { MUSCLES, runPace, yearsWithData, yearSummary } from '../lib/stats'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Year() {
  const { model, data } = useData()
  const runs = useFeature('runs') // off: the year without runs (Settings → Features)
  const years = yearsWithData(model)
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear())
  const y = useMemo(() => yearSummary(model, year), [model, year])
  const sessions = useMemo(() => model.sessions.filter(s => s.date.startsWith(String(year))), [model, year])
  const headline = useMemo(() => overallLine(model, sessions, runs ? y.run.totalM : 0, `in ${year}`), [model, sessions, y, year, runs])

  const monthChart = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: {
      labels: MONTHS.map(m => m.slice(0, 3)),
      datasets: [
        { label: 'Gym', data: y.months.map(m => m.gym), backgroundColor: C().accent, borderRadius: 4, stack: 's' },
        ...(runs ? [{ label: 'Runs', data: y.months.map(m => m.runs), backgroundColor: C().strava, borderRadius: 4, stack: 's' }] : []),
      ],
    },
    options: { plugins: { legend: { display: runs, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } } },
  }), [y, runs])

  const muscleChart = useMemo<ChartConfiguration>(() => ({
    type: 'radar',
    data: { labels: MUSCLES.map(m => m[0].toUpperCase() + m.slice(1)), datasets: [{ data: MUSCLES.map(m => y.muscles[m]), borderColor: C().accent2, backgroundColor: C().accent2 + '2e', pointBackgroundColor: C().accent2, borderWidth: 2 }] },
    options: { plugins: { tooltip: { callbacks: { label: c => ` ${c.parsed.r} sets` } } }, scales: { r: { angleLines: { color: C().line }, grid: { color: C().line }, pointLabels: { color: C().ink, font: { size: 12, weight: 600 } }, ticks: { display: false }, beginAtZero: true } } },
  }), [y])

  if (!years.length) return <Empty>Nothing logged yet. Come back after a few sessions.</Empty>

  const best = y.bestMonth
  const tiles: [string, string][] = [
    [num(y.sessions), 'gym sessions'],
    ...(runs ? [[num(y.runs), 'runs'] as [string, string]] : []),
    [num(y.activeDays), 'active days'],
    [duration(y.durationS), 'training time'],
    [kg(Math.round(y.volume)), 'lifted'],
    ...(runs ? [[km(y.run.totalM, 0), 'run'] as [string, string]] : []),
    [num(y.pbSets.length), 'PBs'],
    [`${y.longestStreak} wks`, 'longest streak'],
  ]

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 md:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full grad-bg opacity-20 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted">Year in review</p>
            {years.length > 1 && <Tabs size="sm" value={String(year)} onChange={v => setYear(+v)} options={years.map(String)} />}
          </div>
          <h1 className="mt-3 text-5xl font-extrabold tracking-tight md:text-7xl"><span className="grad-text">{year}</span></h1>
          <p className="mt-4 max-w-2xl text-lg text-ink/90 md:text-xl">{headline}</p>
          <div className={`mt-8 grid grid-cols-2 gap-x-6 gap-y-6 ${runs ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            {tiles.map(([v, l]) => (
              <div key={l}>
                <div className="text-3xl font-bold tracking-tight tabular-nums md:text-4xl">{v}</div>
                <div className="text-sm text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card title="Active days" action={<span className="text-sm text-muted">Favourite day: <span className="text-ink">{y.favouriteDay}</span></span>}>
        <Heatmap year={year} days={y.activeDates} />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Month by month"><Chart height={240} label="Sessions per month" config={monthChart} /></Card>
        <Card className="lg:col-span-2" title="Best month">
          {best && best.days > 0 ? (
            <>
              <div className="text-3xl font-extrabold grad-text">{MONTHS[best.month]}</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-muted">Active days</span><span className="font-semibold">{best.days}</span></li>
                <li className="flex justify-between"><span className="text-muted">Gym sessions</span><span className="font-semibold">{best.gym}</span></li>
                {runs && <li className="flex justify-between"><span className="text-muted">Runs</span><span className="font-semibold">{best.runs} · {num(best.km, 1)} km</span></li>}
                {best.volume > 0 && <li className="flex justify-between"><span className="text-muted">Lifted</span><span className="font-semibold">{kg(Math.round(best.volume))}</span></li>}
              </ul>
              <div className="mt-4"><Line>{best.days >= 12 ? `${best.days} active days in ${MONTHS[best.month]}. That's a habit, not a phase.` : `${MONTHS[best.month]} set the bar. Time to raise it.`}</Line></div>
            </>
          ) : <Empty>No standout month yet.</Empty>}
        </Card>
      </div>

      <div className={`grid grid-cols-1 gap-5 ${runs ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <Card title="Top exercises">
          <ol className="space-y-3">
            {y.topExercises.map((t, i) => (
              <li key={t.exercise.id} className="flex items-center gap-3">
                <span className="w-5 text-lg font-bold text-muted">{i + 1}</span>
                <Link to={`/exercises/${t.exercise.id}`} className="flex-1 truncate font-semibold hover:text-accent">{t.exercise.name}</Link>
                <span className="text-sm text-muted">{plural(t.sets, 'set')}</span>
              </li>
            ))}
          </ol>
          {!y.topExercises.length && <Empty>No sets logged this year.</Empty>}
        </Card>
        <Card title="Muscle split">{MUSCLES.some(m => y.muscles[m]) ? <Chart height={240} label="Sets per muscle group this year" config={muscleChart} /> : <Empty>No gym sets this year.</Empty>}</Card>
        {runs && <Card title="Running">
          {!y.run.totalM ? <Empty>No runs this year.</Empty> : <>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between"><span className="text-muted">Distance</span><span className="font-semibold">{km(y.run.totalM, 1)}</span></li>
            <li className="flex justify-between"><span className="text-muted">Time</span><span className="font-semibold">{duration(y.run.totalS)}</span></li>
            <li className="flex justify-between"><span className="text-muted">Longest</span><span className="font-semibold">{y.run.longest ? `${km(y.run.longest.distance_m, 1)} · ${shortDate(y.run.longest.date)}` : '–'}</span></li>
            <li className="flex justify-between"><span className="text-muted">Fastest 5K+</span><span className="font-semibold">{y.run.fastest5k ? pace(runPace(y.run.fastest5k)) : '–'}</span></li>
          </ul>
          {y.run.totalM > 42195 && <div className="mt-4"><Line>{num(y.run.totalM / 42195, 1)} marathons, one sensible chunk at a time.</Line></div>}
          </>}
        </Card>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={`PBs in ${year}`} action={<span className="text-sm text-muted">{plural(y.pbSets.length, 'PB')}</span>}>
          {y.pbSets.length ? (
            <ul className="divide-y divide-line">
              {[...y.pbSets].reverse().slice(0, 12).map(({ s, date, kinds }) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-14 text-xs text-muted">{shortDate(date)}</span>
                  <Link to={`/exercises/${s.exercise_id}`} className="flex-1 truncate font-medium hover:text-accent">{model.exById.get(s.exercise_id)?.name}</Link>
                  <span className="tabular-nums">{s.reps !== null ? setText(s, model.exById.get(s.exercise_id)?.name) : s.weight_kg !== null ? kg(s.weight_kg, model.exById.get(s.exercise_id)?.name) : 'BW'}</span>
                  <PbBadge kinds={kinds} />
                </li>
              ))}
            </ul>
          ) : <Empty>No PBs yet this year. Plenty of time.</Empty>}
        </Card>
        <Card title="Hall of fame" action={<span className="text-xs text-muted">Lifetime, from your records</span>}>
          <ul className="space-y-2.5 text-sm">
            {data.records.map(r => (
              <li key={r.id} className="flex items-baseline justify-between gap-3">
                <span className="text-muted">{r.name}</span>
                <span className="text-right font-semibold">{r.value}</span>
              </li>
            ))}
          </ul>
          {!data.records.length && <Empty>No records imported.</Empty>}
        </Card>
      </div>
    </div>
  )
}
