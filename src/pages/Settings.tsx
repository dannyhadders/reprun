import { Fragment, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { isBackup } from '../../shared/backup'
import { GOALS } from '../../shared/rules'
import { showIntroAgain } from '../lib/intro'
import type { ImportResult, Profile } from '../../shared/types'
import { DEFAULT_WEEKLY } from '../lib/stats'
import { ask, Card, Icon, PageHeader, SourceBadge, Tabs } from '../components/ui'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { api, importStravaFile, useData } from '../lib/data'
import { LOCAL } from '../lib/local'
import { lastBackup, saveBackup } from '../lib/backupFile'
import { ThisPhoneCard } from '../components/PhoneOnly'
import { pushSupported, ReminderSwitches, RestAlertsButton, useRestAlerts, WhatsSent } from '../lib/push'
import { CHANGELOG } from '../lib/changelog'
import { checkForUpdate } from '../components/Update'
import { Tap } from '../lib/haptic'
import { ago, date as fmtDate, kg, pendingUnits, localISO, plural, shortDate, shown, toKg, unitOf } from '../lib/format'
import { rememberUnit } from '../lib/session'
import { FEATURES, featureOn } from '../lib/features'

declare const __BUILD__: { sha: string; date: string } // vite.config.ts

// One icon per row: drawn in a tinted square, like the iPhone's own Settings.
const ICONS = {
  toggle: 'M7 6h10a6 6 0 0 1 0 12H7A6 6 0 0 1 7 6zM16 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  weight: 'M4 18l5-6 4 3 7-9',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  backup: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  strava: 'M10 3 4 15h4l2-4 2 4h4zM14 15l2 4 2-4',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
}
const CHEVRON = 'M9 6l6 6-6 6'

type Section = { id: string; title: string; icon?: string; tint?: string; status?: ReactNode; page: ReactNode }

/**
 * Settings is a grouped list, like the iPhone's: each row says where things stand ("On", "2 days ago") and opens its
 * own page at /settings/<id>. Check for updates runs right in the list.
 */
export default function Settings() {
  const { data } = useData()
  const { section } = useParams()
  const last = lastBackup()
  const goals = GOALS.filter(g => data.profile.goals?.includes(g.id)).map(g => g.label)
  const weighIn = data.bodyWeight.at(-1)
  const notify = pushSupported() || badgeSupported
  const groups: [string, Section[]][] = [
    ['Training', [
      ...(notify ? [{ id: 'notifications', title: 'Notifications', icon: ICONS.bell, tint: 'bg-accent/15 text-accent', status: pushSupported() ? <AlertsStatus /> : undefined, page: <NotificationsCard /> }] : []),
      { id: 'features', title: 'Features', icon: ICONS.toggle, tint: 'bg-accent/15 text-accent', status: `${FEATURES.filter(f => featureOn(data.profile, f.id)).length} of ${FEATURES.length} on`, page: <FeaturesCard /> },
      { id: 'body-weight', title: 'Body weight', icon: ICONS.weight, tint: 'bg-accent-2/15 text-accent-2', status: weighIn ? kg(weighIn.kg) : 'None yet', page: <BodyWeightLog /> },
    ]],
    ['Your data', [
      ...(LOCAL ? [{ id: 'phone', title: 'This phone', icon: ICONS.phone, tint: 'bg-pb/15 text-pb', page: <ThisPhoneCard /> }] : []),
      { id: 'backup', title: 'Backup', icon: ICONS.backup, tint: 'bg-good/15 text-good', status: last ? ago(localISO(new Date(last))) : 'Not saved yet', page: <BackupCard /> },
      ...(!data.demo && !LOCAL && featureOn(data.profile, 'runs') ? [{ id: 'strava', title: 'Strava', icon: ICONS.strava, tint: 'bg-strava/15 text-strava', status: data.strava.connected ? 'Connected' : 'Not connected', page: <StravaCard /> }] : []),
      ...(!data.demo ? [{ id: 'import', title: 'Import from a file', icon: ICONS.file, tint: 'bg-muted/15 text-ink', page: <ImportCard /> }] : []),
    ]],
    ['RepRun', [
      { id: 'about', title: "What's new", page: <AboutCard /> },
      { id: 'sources', title: 'Where the data comes from', page: <SourcesCard /> },
    ]],
  ]
  const profile: Section = { id: 'profile', title: 'Profile', page: <ProfileCard /> }
  const all = [profile, ...groups.flatMap(([, rows]) => rows)]
  if (section) {
    const open = all.find(r => r.id === section)
    if (!open) return <Navigate to="/settings" replace />
    return (
      <div className="mx-auto max-w-xl">
        <Link to="/settings" className="press -ml-1 inline-flex min-h-11 items-center gap-1 text-accent"><Icon d="M15 6l-6 6 6 6" className="size-5" />Settings</Link>
        <PageHeader title={open.title} />
        {open.page}
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Settings" />
      <Link to="/settings/profile" className="row-press flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-bg"><Icon d={ICONS.you} className="size-6 [stroke-width:2.2]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Profile</span>
          <span className="block truncate text-sm text-muted">{[...goals, `${plural(data.profile.weekly ?? DEFAULT_WEEKLY, 'session')} a week`].join(' · ')}</span>
        </span>
        <Icon d={CHEVRON} className="size-4 text-muted" />
      </Link>
      {groups.map(([name, rows]) => (<Fragment key={name}>
        {name === 'RepRun' && <Appearance />}
        <section>
          <h2 className="mb-2 pl-3.5 text-[13px] font-semibold uppercase tracking-wider text-muted">{name}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {name === 'RepRun' && <UpdateRow />}
            {rows.map(r => (
              <Link key={r.id} to={`/settings/${r.id}`} className="row-press flex min-h-13 items-center gap-3 px-3.5">
                {r.icon && <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.tint}`}><Icon d={r.icon} className="size-[18px]" /></span>}
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.status && <span className="shrink-0 text-sm text-muted">{r.status}</span>}
                <Icon d={CHEVRON} className="size-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      </Fragment>))}
      <p className="text-center text-xs tabular-nums text-muted">Version {__BUILD__.date} · {__BUILD__.sha}</p>
    </div>
  )
}

/** Light or dark, right in the list: two buttons the width of the page. */
function Appearance() {
  const [theme, set] = useState(getTheme)
  return (
    <section>
      <h2 className="mb-2 pl-3.5 text-[13px] font-semibold uppercase tracking-wider text-muted">Appearance</h2>
      <Tabs full value={theme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] as { value: Theme; label: string }[]} onChange={t => (setTheme(t), set(t))} />
    </section>
  )
}

/** The Notifications row's status. Its own component, so the push check only runs where push exists. */
function AlertsStatus() {
  const { state } = useRestAlerts()
  return <>{state === 'on' ? 'On' : 'Off'}</>
}

const FOUND = {
  new: 'Found one, installing…',
  later: 'Installs after your workout',
  latest: "You're on the latest ✓",
  offline: "Couldn't check",
}

/** Check for updates, right in the list: the answer shows where the row's status would be. */
function UpdateRow() {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<keyof typeof FOUND | null>(null)
  const look = async () => {
    setBusy(true)
    const found = await checkForUpdate()
    setBusy(false)
    setSaid(found)
    if (found !== 'new') setTimeout(() => setSaid(null), 4000) // 'new': the update pop-up takes over
  }
  return (
    <button className="row-press relative flex min-h-13 w-full items-center gap-3 px-3.5 text-left disabled:opacity-60" disabled={busy} aria-busy={busy} onClick={look}>
      {!busy && <Tap />}
      <span className="flex-1 text-accent">{busy ? 'Checking…' : 'Check for updates'}</span>
      {said && <span role="status" className={`animate-fade-in text-sm ${said === 'latest' ? 'text-good' : 'text-muted'}`}>{FOUND[said]}</span>}
    </button>
  )
}

/** Exercises switched away from your default unit (from the logger), each with a way back. Includes switches still
 *  waiting on the phone (no signal yet), and going back waits the same way, so it works offline too. */
function SwitchedUnits({ onChange }: { onChange: (units: Profile['units']) => void }) {
  const { data, reload } = useData()
  const [, redraw] = useState(0)
  const def = data.profile.unit ?? 'kg'
  const list = Object.entries({ ...data.profile.units, ...pendingUnits() }).filter(([, u]) => u !== def)
  if (!list.length) return null
  const back = async (key: string) => {
    const units = { ...data.profile.units }
    delete units[key]
    onChange(units)
    const sent = rememberUnit(key, def) // pending until the server has it; sent as a removal (lib/session.ts)
    redraw(n => n + 1)
    if (await sent) await reload()
  }
  return (
    <div className="mt-5 rounded-2xl border border-line">
      <p className="px-3.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">In {def === 'kg' ? 'lb' : 'kg'}</p>
      <ul className="divide-y divide-line">
        {list.map(([key]) => (
          <li key={key} className="flex items-center justify-between gap-3 pl-3.5">
            <span className="min-w-0 truncate text-sm">{data.exercises.find(e => e.name.toLowerCase() === key)?.name ?? key}</span>
            <button className="relative h-11 shrink-0 px-3.5 text-sm font-semibold text-accent" onClick={() => void back(key)}><Tap />Back to {def}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileCard() {
  const { data, reload } = useData()
  const [p, setP] = useState<Profile>(data.profile)
  const [saved, setSaved] = useState(false)
  // Body weight typed as text in the unit it was shown in (converting on every key would eat a half-typed "80."), and
  // that unit kept with it: switching Weights in and saving mustn't relabel "80" (kg) as 80 lb. Shown again after a save.
  const [bw, setBw] = useState(() => ({ u: unitOf(), v: shown(data.profile.weight_kg, unitOf()) }))
  const save = async () => {
    const weight_kg = bw.v.trim() && +bw.v > 0 ? toKg(+bw.v, bw.u) : null
    await api('PUT', 'profile', { ...p, weight_kg })
    await reload()
    const u = p.unit ?? 'kg'
    setBw({ u, v: shown(weight_kg, u) }) // in the unit just saved
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return (
    <Card action={<span className="text-xs text-muted">Shapes plans and strength comparisons</span>}>
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
        <label className="text-sm text-muted">Body weight ({bw.u})<input className="input mt-1" type="number" step="0.1" min="0" inputMode="decimal" value={bw.v} onChange={e => setBw({ ...bw, v: e.target.value })} /></label>
        <label className="text-sm text-muted">Compare with
          <select className="input mt-1" value={p.sex} onChange={e => setP({ ...p, sex: e.target.value as Profile['sex'] })}>
            <option value="male">Men</option>
            <option value="female">Women</option>
          </select>
        </label>
        {/* Lifting weights only; body weight stays in kg. Stored in kg either way, so switching changes nothing logged. */}
        <div className="col-span-3 flex items-center justify-between gap-3 text-sm text-muted">Weights in
          <div role="group" aria-label="Weights in" className="flex overflow-hidden rounded-xl border border-line">
            {(['kg', 'lb'] as const).map(u => (
              <button key={u} type="button" aria-pressed={(p.unit ?? 'kg') === u} onClick={() => setP({ ...p, unit: u })}
                className={`press relative h-11 w-16 font-semibold ${(p.unit ?? 'kg') === u ? 'bg-accent-deep text-white' : 'bg-surface-2 text-muted'}`}><Tap />{u}</button>
            ))}
          </div>
        </div>
        <p className="col-span-3 -mt-1 text-xs text-muted">Machines marked in the other one? In a workout, tap the unit above an exercise's weights to switch just that exercise.</p>
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
      <SwitchedUnits onChange={units => setP(x => ({ ...x, units }))} />
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
    <Card action={<span className="text-xs text-muted">{last ? `Last saved: ${ago(localISO(new Date(last)))}` : 'Not saved on this device yet'}</span>}>
      <p className="text-sm text-muted">Everything in one file: workouts, runs, routines, body weight and profile. Keep it in Files or iCloud Drive, or use it to move to another copy of RepRun. It's always called reprun-backup.json: save it into the same folder and choose Replace, so there's only ever one.</p>
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
    <Card action={<SourceBadge source="sheet" />}>
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

/** Settings → Features: a switch per part of the app you can turn off (lib/features.ts). Saved straight away. */
function FeaturesCard() {
  const { data, reload } = useData()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const flip = async (f: (typeof FEATURES)[number]) => {
    const on = !featureOn(data.profile, f.id)
    setBusy(f.id)
    setError(null)
    try {
      // Only this switch, on top of what's stored; back to its default goes as a removal (shared/rules.ts patchProfile).
      await api('PATCH', 'profile', { features: { [f.id]: on === f.on ? null : on } })
      await reload()
    } catch {
      setError("Couldn't save that. Check your signal and try again.")
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Turn off what you don't use. Nothing is deleted: turn it back on and it's all there.</p>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {FEATURES.map(f => {
          const on = featureOn(data.profile, f.id)
          return (
            // The whole row is the switch, as in Notifications.
            <button key={f.id} role="switch" aria-checked={on} disabled={busy !== null} className="relative flex w-full items-center gap-3 px-3.5 py-3 text-left disabled:opacity-60" onClick={() => void flip(f)}>
              {busy === null && <Tap />}
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{f.title}</span><span className="block text-xs text-muted">{f.about}</span></span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-good' : 'bg-line'}`} aria-hidden>
                <span className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </div>
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
    <Card action={<SourceBadge source="strava" />}>
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
        {data.strava.configured && !data.strava.connected && <a className="btn bg-strava-deep" href="/api/strava/connect">Connect Strava</a>}
        {data.strava.connected && <button className="btn bg-strava-deep" disabled={busy} onClick={() => run(async () => `Synced ${plural((await api<{ activities: number }>('POST', 'strava/sync')).activities, 'activity', 'activities')}.`)}>Sync now</button>}
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
  const { data } = useData()
  const alerts = useRestAlerts()
  const [perm, setPerm] = useState(() => 'Notification' in window ? Notification.permission : 'denied')
  return (
    <Card>
      {pushSupported() && (
        <div>
          <p className="font-medium">Rest alerts</p>
          <p className="mt-0.5 text-sm text-muted">A buzz on your lock screen and Apple Watch when rest is over, even with your phone in your pocket.</p>
          <RestAlertsButton {...alerts} className="mt-3" />
          {alerts.state === 'on' && !data.demo && <div className="mt-4"><ReminderSwitches /></div>}
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
    <Card>
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
    <Card>
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
    <Card action={<span className="text-xs tabular-nums text-muted">Version {__BUILD__.date} · {__BUILD__.sha}</span>}>
      <ol className="space-y-4 text-sm">
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
