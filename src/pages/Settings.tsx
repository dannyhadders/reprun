import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isBackup } from '../../shared/backup'
import { GOALS } from '../../shared/rules'
import { showIntroAgain } from '../lib/intro'
import type { ImportResult, Profile } from '../../shared/types'
import { DEFAULT_WEEKLY } from '../lib/stats'
import { ask, Card, PageHeader, SourceBadge } from '../components/ui'
import { api, importStravaFile, useData } from '../lib/data'
import { LOCAL } from '../lib/local'
import { lastBackup, saveBackup } from '../lib/backupFile'
import { ThisPhoneCard } from '../components/PhoneOnly'
import { pushSupported, RestAlertsButton, useRestAlerts, WhatsSent } from '../lib/push'
import { CHANGELOG } from '../lib/changelog'
import { ago, date as fmtDate, kg, localISO, plural, shortDate } from '../lib/format'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

export default function Settings() {
  const { data } = useData()
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" sub="Your profile, data sources and imports." />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard />
        {LOCAL && <ThisPhoneCard />}
        <BackupCard />
        {!data.demo && <ImportCard />}
        {!data.demo && !LOCAL && <StravaCard />}
        {(pushSupported() || badgeSupported) && <NotificationsCard />}
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
    <Card title="Profile" action={<span className="text-xs text-muted">Shapes plans and strength comparisons</span>}>
      <form className="grid grid-cols-3 gap-3" onSubmit={e => (e.preventDefault(), save())}>
        <div className="col-span-3 text-sm text-muted">Training for <span className="text-xs">(up to two)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {GOALS.map(g => {
              const on = (p.goals ?? []).includes(g.id)
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => setP(x => ({ ...x, goals: on ? (x.goals ?? []).filter(y => y !== g.id) : [...(x.goals ?? []), g.id].slice(-2) }))}
                  className={`press min-h-11 rounded-full border px-3.5 text-sm font-medium ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted'}`}>
                  {g.emoji} {g.label}
                </button>
              )
            })}
          </div>
        </div>
        <label className="text-sm text-muted">Age<input className="input mt-1" type="number" min="10" max="100" value={p.age ?? ''} onChange={e => setP({ ...p, age: e.target.value ? +e.target.value : null })} /></label>
        <label className="text-sm text-muted">Body weight (kg)<input className="input mt-1" type="number" step="0.1" min="20" max="300" value={p.weight_kg ?? ''} onChange={e => setP({ ...p, weight_kg: e.target.value ? +e.target.value : null })} /></label>
        <label className="text-sm text-muted">Compare with
          <select className="input mt-1" value={p.sex} onChange={e => setP({ ...p, sex: e.target.value as Profile['sex'] })}>
            <option value="male">Men</option>
            <option value="female">Women</option>
          </select>
        </label>
        <label className="col-span-3 text-sm text-muted">Sessions a week <span className="text-xs">(for your streak 🔥: gym, runs, anything from Strava)</span>
          <select className="input mt-1" value={p.weekly ?? DEFAULT_WEEKLY} onChange={e => setP({ ...p, weekly: +e.target.value })}>
            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="col-span-3 flex items-center gap-3">
          <button className="btn">Save</button>
          {saved && <span className="text-sm text-good">Saved</span>}
          <button type="button" className="ml-auto text-sm text-accent underline-offset-4 hover:underline" onClick={() => (showIntroAgain(), location.reload())}>Show the intro again</button>
        </div>
      </form>
    </Card>
  )
}

/** Everything to one file and back. Restoring merges, so it never duplicates or overwrites anything. */
function BackupCard() {
  const { data, reload } = useData()
  const [last, setLast] = useState(lastBackup)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setMsg(null)
    try {
      if (await saveBackup(data)) setLast(lastBackup())
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const restore = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const b: unknown = JSON.parse(await file.text())
      if (!isBackup(b)) throw new Error('That isn\'t a RepRun backup file.')
      const r = await api<ImportResult>('POST', 'import', b)
      await reload()
      const added = [plural(r.workouts, 'workout'), plural(r.activities, 'activity', 'activities'), plural(r.routines ?? 0, 'routine'), plural(r.bodyWeight ?? 0, 'weigh-in'), plural(r.records + r.goals, 'record or target', 'records and targets')]
      setMsg({ ok: true, text: `Added ${added.join(', ')}. ${r.skipped.length ? `${plural(r.skipped.length, 'workout')} already here were kept as they are.` : ''}` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? 'That file isn\'t a RepRun backup.' : e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Backup" action={<span className="text-xs text-muted">{last ? `Last saved: ${ago(localISO(new Date(last)))}` : 'Not saved on this device yet'}</span>}>
      <p className="text-sm text-muted">Everything in one file: workouts, runs, routines, body weight and profile. Keep it in Files or iCloud Drive, or use it to move to another copy of RepRun.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn" onClick={save}>Save a backup</button>
        {!data.demo && (
          <label className={`btn-ghost cursor-pointer ${busy ? 'busy' : ''}`} aria-busy={busy}>
            Restore from a file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
          </label>
        )}
      </div>
      {!data.demo && <p className="mt-3 text-xs text-muted">Restoring adds what's missing and never changes or deletes what's already here, so it's safe to restore the same file twice.</p>}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
    </Card>
  )
}

function ImportCard() {
  const { reload } = useData()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [strava, setStrava] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setStrava(null)
    try {
      // Strava's activities.csv goes its own way: same picker, recognised by its header.
      if (/\.csv$/i.test(file.name) && /^\uFEFF?Activity ID,/.test(await file.slice(0, 64).text())) {
        setStrava(await importStravaFile(file))
        await reload()
        return
      }
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
      <p className="mt-2 text-sm text-muted">Or Strava's <b className="text-ink">activities.csv</b>: on strava.com, Settings → My Account → Download or Delete Your Account → Request your archive. Every run, ride and gym session comes in with its time and distance (Strava keeps no sets).</p>
      <label className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-accent hover:bg-accent/5 ${busy ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
        <span className="text-2xl">📄</span>
        <span className="mt-2 font-semibold">{busy ? 'Importing…' : 'Choose or drop an .xlsx or activities.csv'}</span>
        <span className="text-xs text-muted">Reads Set Log, Session Summary, Running Log, PBs & Benchmarks, Progress & Targets</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </label>
      {result && (
        <p className="mt-3 text-sm text-good">
          Imported {plural(result.workouts, 'workout')} ({plural(result.sets, 'set')}), {plural(result.activities, 'activity', 'activities')}, {plural(result.records, 'record')}, {plural(result.goals, 'target')}.
          {result.skipped.length > 0 && <span className="text-muted"> Skipped {plural(result.skipped.length, 'day')} already in RepRun.</span>}
        </p>
      )}
      {strava && <p className="mt-3 text-sm text-good">{strava}</p>}
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
          ? <button className="btn-ghost" disabled={busy} onClick={async () => await ask(`Remove ${samples} sample Strava activities?`, 'Remove', true) && run(async () => (await api('DELETE', 'strava/sample'), 'Sample data removed.'))}>Remove sample data</button>
          : <button className="btn-ghost" disabled={busy} onClick={() => run(async () => `Added ${plural((await api<{ activities: number }>('POST', 'strava/sample')).activities, 'sample activity', 'sample activities')}.`)}>Load sample data</button>}
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </Card>
  )
}

const badgeSupported = !LOCAL && 'setAppBadge' in navigator && 'Notification' in window // phone-only has no uploads to count

function NotificationsCard() {
  const alerts = useRestAlerts()
  const [perm, setPerm] = useState(() => 'Notification' in window ? Notification.permission : 'denied')
  return (
    <Card title="Notifications">
      {pushSupported() && (
        <div>
          <p className="font-medium">Rest alerts</p>
          <p className="mt-0.5 text-sm text-muted">A buzz on your lock screen and Apple Watch when rest is over, even with your phone in your pocket.</p>
          <RestAlertsButton {...alerts} className="mt-3" />
          <div className="mt-3"><WhatsSent /></div>
        </div>
      )}
      {badgeSupported && (
        <div className={pushSupported() ? 'mt-5 border-t border-line pt-4' : ''}>
          <p className="font-medium">Badge on the app icon</p>
          <p className="mt-0.5 text-sm text-muted">A number on RepRun's icon when a workout is saved on this phone but not uploaded yet. iPhone needs notifications allowed for it.</p>
          {perm === 'granted' || alerts.state === 'on' ? <p className="mt-3 text-sm text-good">On.</p>
            : perm === 'denied' || alerts.state === 'denied' ? <p className="mt-3 text-sm text-muted">Notifications are blocked. Turn them on in the phone's Settings → Notifications → RepRun.</p>
            : <button className="btn mt-3" onClick={() => void Notification.requestPermission().then(setPerm)}>Turn on</button>}
        </div>
      )}
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
  // From the "Updated ✓" toast's What's new: open on the changelog.
  const [params] = useSearchParams()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (params.has('about')) ref.current?.scrollIntoView({ block: 'start' }) }, [params])
  return (
    <div ref={ref} className="scroll-mt-4">
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
    </div>
  )
}
