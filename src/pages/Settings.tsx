import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ImportResult, Profile } from '../../shared/types'
import { Card, PageHeader, SourceBadge } from '../components/ui'
import { api, useData } from '../lib/data'
import { CHANGELOG } from '../lib/changelog'
import { date as fmtDate, kg, plural, shortDate } from '../lib/format'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

export default function Settings() {
  const { data } = useData()
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" sub="Your profile, data sources and imports." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard />
        {!data.demo && <ImportCard />}
        {!data.demo && <StravaCard />}
        <BodyWeightLog />
        <SourcesCard />
        <AboutCard />
      </div>
    </div>
  )
}

function ProfileCard() {
  const { data, reload } = useData()
  const [p, setP] = useState<Profile>(data.profile)
  const [saved, setSaved] = useState(false)
  const save = async () => {
    await api('PUT', 'profile', p)
    await reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return (
    <Card title="Profile" action={<span className="text-xs text-muted">Used for strength standards</span>}>
      <form className="grid grid-cols-3 gap-3" onSubmit={e => (e.preventDefault(), save())}>
        <label className="text-sm text-muted">Age<input className="input mt-1" type="number" min="10" max="100" value={p.age ?? ''} onChange={e => setP({ ...p, age: e.target.value ? +e.target.value : null })} /></label>
        <label className="text-sm text-muted">Body weight (kg)<input className="input mt-1" type="number" step="0.1" min="20" max="300" value={p.weight_kg ?? ''} onChange={e => setP({ ...p, weight_kg: e.target.value ? +e.target.value : null })} /></label>
        <label className="text-sm text-muted">Compare with
          <select className="input mt-1" value={p.sex} onChange={e => setP({ ...p, sex: e.target.value as Profile['sex'] })}>
            <option value="male">Men</option>
            <option value="female">Women</option>
          </select>
        </label>
        <div className="col-span-3 flex items-center gap-3">
          <button className="btn">Save</button>
          {saved && <span className="text-sm text-good">Saved</span>}
        </div>
      </form>
    </Card>
  )
}

function ImportCard() {
  const { reload } = useData()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      // Parsing happens here in the browser; only the tidy result goes to the server.
      const [{ read }, { parseWorkbook }] = await Promise.all([import('xlsx'), import('../../shared/sheet')])
      const payload = parseWorkbook(read(await file.arrayBuffer()))
      if (!payload.workouts.length && !payload.activities.length) throw new Error('No "Set Log" or "Running Log" rows found in that file.')
      setResult(await api<ImportResult>('POST', 'import', payload))
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Import spreadsheet" action={<SourceBadge source="sheet" />}>
      <p className="text-sm text-muted">Drop in a training workbook (.xlsx) with the sheets listed below. Days already in RepRun are skipped, so re-importing the updated file only adds new sessions and never overwrites your edits.</p>
      <label className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-accent hover:bg-accent/5 ${busy ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
        <span className="text-2xl">📄</span>
        <span className="mt-2 font-semibold">{busy ? 'Importing…' : 'Choose or drop an .xlsx file'}</span>
        <span className="text-xs text-muted">Reads Set Log, Session Summary, Running Log, PBs & Benchmarks, Progress & Targets</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </label>
      {result && (
        <p className="mt-3 text-sm text-good">
          Imported {plural(result.workouts, 'workout')} ({plural(result.sets, 'set')}), {plural(result.activities, 'activity', 'activities')}, {plural(result.records, 'record')}, {plural(result.goals, 'target')}.
          {result.skipped.length > 0 && <span className="text-muted"> Skipped {plural(result.skipped.length, 'day')} already in RepRun.</span>}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </Card>
  )
}

function StravaCard() {
  const { data, model, reload } = useData()
  const [params] = useSearchParams()
  const [msg, setMsg] = useState<string | null>(params.get('strava') === 'connected' ? 'Strava connected. Hit "Sync now" to pull your history.' : null)
  const [busy, setBusy] = useState(false)
  const samples = data.activities.filter(a => a.sample).length
  const real = data.activities.filter(a => a.source === 'strava' && !a.sample).length

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    try {
      setMsg(await fn())
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Strava" action={<SourceBadge source="strava" />}>
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${data.strava.connected ? 'bg-good' : 'bg-muted'}`} />
        <span className="font-semibold">{data.strava.connected ? 'Connected' : data.strava.configured ? 'Not connected' : 'Not set up yet'}</span>
        {data.strava.lastSync && <span className="text-sm text-muted">last sync {fmtDate(data.strava.lastSync.slice(0, 10))}</span>}
      </div>
      <p className="mt-2 text-sm text-muted">
        {data.strava.configured
          ? 'Pulls runs and timed gym sessions (Apple Health → Strava). The first sync backfills your whole history.'
          : 'Needs a free Strava API app and two secrets in Cloudflare. Steps are in the README. Until then, sample data shows what synced activities look like.'}
      </p>
      <p className="mt-2 text-sm">{plural(real, 'real activity', 'real activities')} · {plural(samples, 'sample activity', 'sample activities')} · {plural(model.runs.length, 'run')} in total</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.strava.configured && !data.strava.connected && <a className="btn bg-strava" href="/api/strava/connect">Connect Strava</a>}
        {data.strava.connected && <button className="btn bg-strava" disabled={busy} onClick={() => run(async () => `Synced ${plural((await api<{ activities: number }>('POST', 'strava/sync')).activities, 'activity', 'activities')}.`)}>Sync now</button>}
        {samples > 0
          ? <button className="btn-ghost" disabled={busy} onClick={() => confirm(`Remove ${samples} sample Strava activities?`) && run(async () => (await api('DELETE', 'strava/sample'), 'Sample data removed.'))}>Remove sample data</button>
          : <button className="btn-ghost" disabled={busy} onClick={() => run(async () => `Added ${plural((await api<{ activities: number }>('POST', 'strava/sample')).activities, 'sample activity', 'sample activities')}.`)}>Load sample data</button>}
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </Card>
  )
}

function BodyWeightLog() {
  const { data, reload } = useData()
  return (
    <Card title="Body weight log">
      <ul className="divide-y divide-line text-sm">
        {[...data.bodyWeight].reverse().map(b => (
          <li key={b.date} className="flex items-center justify-between py-2">
            <span className="text-muted">{shortDate(b.date)}</span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{kg(b.kg)}</span>
              <button className="text-xs text-muted hover:text-bad" onClick={async () => { await api('DELETE', `body-weight/${b.date}`); await reload() }}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
      {!data.bodyWeight.length && <p className="text-sm text-muted">Nothing yet. Log your weight from the Home page.</p>}
    </Card>
  )
}

function SourcesCard() {
  const rows: [string, string, string | undefined][] = [
    ['sheet', 'Imported from a training spreadsheet', undefined],
    ['strava', 'Synced from Strava', undefined],
    ['strava', 'Generated sample data, shaped like a Strava import', 'sample'],
    ['manual', 'Added or edited here in RepRun', undefined],
    ['estimate', 'Estimated, e.g. duration from number of sets', undefined],
  ]
  return (
    <Card title="Where the data comes from">
      <ul className="space-y-2.5 text-sm">
        {rows.map(([s, label, sample]) => (
          <li key={label} className="flex items-center gap-3"><span className="w-28"><SourceBadge source={s} sample={!!sample} /></span><span className="text-muted">{label}</span></li>
        ))}
      </ul>
    </Card>
  )
}

function AboutCard() {
  return (
    <Card title="About" action={<span className="text-xs tabular-nums text-muted">Version {__BUILD__.date} · {__BUILD__.sha}</span>}>
      <ol className="max-h-96 space-y-4 overflow-y-auto text-sm">
        {CHANGELOG.map(c => (
          <li key={c.date}>
            <p className="font-semibold">{fmtDate(c.date)}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{c.changes.map(x => <li key={x}>{x}</li>)}</ul>
          </li>
        ))}
      </ol>
    </Card>
  )
}
