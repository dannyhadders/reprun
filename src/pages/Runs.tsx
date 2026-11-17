import type { ChartConfiguration } from 'chart.js'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCENT_2, Chart, gradientFill, gradientStroke, STRAVA } from '../components/Chart'
import { Icon } from '../components/Layout'
import { Card, Empty, Line, PageHeader, SourceBadge, Stat, Tabs } from '../components/ui'
import { api, useData } from '../lib/data'
import { clock, date as fmtDate, duration, km, num, pace, plural, shortDate, today } from '../lib/format'
import { inRange, runBests, runPace, weekly, type RangeKey } from '../lib/stats'

export default function Runs() {
  const { model, data, reload } = useData()
  const [range, setRange] = useState<RangeKey>('1Y')
  const runs = useMemo(() => model.runs.filter(r => inRange(r.date, range)), [model, range])
  const bests = runBests(runs)
  const allBests = runBests(model.runs)
  const year = today().slice(0, 4)
  const yearKm = model.runs.filter(r => r.date.startsWith(year)).reduce((a, r) => a + (r.distance_m ?? 0), 0)
  const hasSample = model.runs.some(r => r.sample)

  const weeks = useMemo(() => weekly(model, 16), [model])
  const kmChart = useMemo<ChartConfiguration>(() => ({
    type: 'bar',
    data: { labels: weeks.map(w => shortDate(w.week)), datasets: [{ data: weeks.map(w => Math.round(w.km * 10) / 10), backgroundColor: STRAVA, borderRadius: 4 }] },
    options: {
      plugins: { tooltip: { callbacks: { title: i => `Week of ${i[0].label}`, label: c => ` ${c.parsed.y} km` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } }, y: { ticks: { callback: v => `${v} km` } } },
    },
  }), [weeks])

  const paceRuns = useMemo(() => [...runs].filter(r => runPace(r)).reverse(), [runs])
  const paceChart = useMemo<ChartConfiguration>(() => ({
    type: 'line',
    data: {
      labels: paceRuns.map(r => shortDate(r.date)),
      datasets: [{ data: paceRuns.map(r => Math.round(runPace(r)!)), borderColor: gradientStroke, backgroundColor: gradientFill, fill: true, pointRadius: 2.5, pointBackgroundColor: ACCENT_2, borderWidth: 2, tension: 0.3 }],
    },
    options: {
      plugins: { tooltip: { callbacks: { label: c => ` ${pace(c.parsed.y)} · ${km(paceRuns[c.dataIndex].distance_m)}` } } },
      // Faster is better, so faster goes up.
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 16 } }, y: { reverse: true, ticks: { callback: v => clock(+v) } } },
    },
  }), [paceRuns])

  const records = data.records.filter(r => r.category !== 'Strength')

  return (
    <div className="space-y-5">
      <PageHeader title="Runs" sub={`${num(yearKm / 1000)} km so far in ${year}`} action={<Tabs value={range} onChange={setRange} options={['30D', '3M', '1Y', 'All'] as RangeKey[]} />} />
      {hasSample && (
        <div className="rounded-2xl border border-dashed border-strava/40 bg-strava/5 p-4 text-sm text-ink/90">
          Most runs here are <strong>sample Strava data</strong>, shaped exactly like a real Strava import so you can see how it'll look. Connect Strava and remove the samples in <Link className="text-strava underline" to="/settings">Settings</Link>.
        </div>
      )}

      {!model.runs.length ? <Card><Empty>No runs yet.{data.strava.configured && !data.strava.connected ? ' Connect Strava in Settings to bring them in.' : ' Add one with + Add past workout.'}</Empty></Card> : <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat accent value={km(bests.totalM, 0)} label={`${plural(runs.length, 'run')}`} /></Card>
        <Card><Stat accent value={duration(bests.totalS)} label="Time running" /></Card>
        <Card><Stat accent value={bests.longest ? km(bests.longest.distance_m, 1) : '–'} label="Longest run" sub={bests.longest && shortDate(bests.longest.date)} /></Card>
        <Card><Stat accent value={bests.fastest5k ? pace(runPace(bests.fastest5k)) : '–'} label="Fastest 5K+ pace" sub={bests.fastest5k && `${km(bests.fastest5k.distance_m, 1)} · ${shortDate(bests.fastest5k.date)}`} /></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Weekly distance"><Chart height={220} label="Kilometres per week" config={kmChart} /></Card>
        <Card title="Pace over time">{paceRuns.length > 1 ? <Chart height={220} label="Average pace per run" config={paceChart} /> : <Empty>Need a couple more runs for a trend.</Empty>}</Card>
      </div>
      </>}

      {records.length > 0 && (
        <Card title="Records & benchmarks" action={<SourceBadge source="sheet" />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {records.map(r => (
              <div key={r.id} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted">{r.name}</span>
                  <span className="text-xs text-muted">{r.date ? shortDate(r.date) : ''}</span>
                </div>
                <div className="text-lg font-bold tabular-nums">{r.value}</div>
                {r.context && <div className="text-xs text-muted">{r.context}</div>}
              </div>
            ))}
          </div>
          {allBests.longest && <div className="mt-4"><Line>Longest run on record: {km(allBests.longest.distance_m, 1)} on {fmtDate(allBests.longest.date)}.</Line></div>}
        </Card>
      )}

      <Card title="All runs">
        <ul className="divide-y divide-line">
          {runs.map(r => (
            <li key={r.id} className="group flex items-center gap-3 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-strava/12 text-lg">🏃</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{r.name}</span>
                  <SourceBadge source={r.source} sample={r.sample} />
                </div>
                <div className="text-xs text-muted">
                  {fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{r.start ? ` · ${r.start}` : ''}
                  {r.elevation_m ? ` · ↗ ${num(r.elevation_m)} m` : ''}{r.avg_hr ? ` · ❤️ ${Math.round(r.avg_hr)}` : ''}
                </div>
                {r.notes && <div className="mt-0.5 text-xs text-muted">{r.notes}</div>}
              </div>
              <div className="text-right tabular-nums">
                <div className="font-semibold">{km(r.distance_m)}</div>
                <div className="text-xs text-muted">{r.moving_s ? clock(r.moving_s) : '–'} · {pace(runPace(r))}</div>
              </div>
              <button
                className="icon-btn md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Delete ${r.name}`}
                onClick={async () => { if (confirm(`Delete ${r.name} on ${fmtDate(r.date)}?`)) { await api('DELETE', `activities/${r.id}`); await reload() } }}
              >
                <Icon d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!runs.length && <Empty>No runs in this range.</Empty>}
        </ul>
      </Card>
    </div>
  )
}
