// Screens only the phone-only copy (reprun.danielhadaway.dev) shows: first-run welcome, the This phone
// card in Settings, and the backup nudge after a workout. See src/lib/local.ts.
import { useEffect, useState } from 'react'
import { backupAge, saveBackup } from '../lib/backupFile'
import { useData } from '../lib/data'
import { wipeLocal } from '../lib/local'
import { Card } from './ui'

const SETUP = 'https://github.com/dannyhadders/reprun/blob/main/docs/SETUP.md'
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const android = () => /Android/.test(navigator.userAgent)
// The icons iOS shows on those buttons, so the steps match what's on screen.
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="-mt-1 inline size-[1.15em]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Share">
    <path d="M12 3v12M8 7l4-4 4 4M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
  </svg>
)
const AddIcon = () => (
  <svg viewBox="0 0 24 24" className="-mt-1 inline size-[1.15em]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" role="img" aria-label="Add">
    <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" />
  </svg>
)
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** First run. Shown by DataProvider until the phone picks one of the two buttons. */
export function Welcome({ onStart }: { onStart: (sample: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = (sample: boolean) => {
    setBusy(true)
    setError(null)
    onStart(sample).catch(e => setError(`Couldn't start: ${e instanceof Error ? e.message : e}. Check your signal and try again.`)).finally(() => setBusy(false))
  }
  const tip = 'rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-muted'
  return (
    <div className="grid min-h-dvh place-items-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <img src="/favicon.svg" alt="" className="mx-auto size-14" />
          <h1 className="mt-4 text-2xl font-bold">Rep<span className="grad-text">Run</span> on your phone</h1>
          <p className="mt-1 text-muted">Log your gym sessions and runs. Free, no account, nothing to set up.</p>
        </div>

        {!installed() && (ios() || android()) && (
          <div className={`${tip} border-accent/40 bg-accent/10 text-ink`}>
            <b>First, add it to your home screen</b>
            {ios()
              ? <> in Safari: tap <b>Share <ShareIcon /></b> (bottom of the screen, or top right on iPad), then <b>Add to Home Screen <AddIcon /></b></>
              : <>: <b>⋮ → Add to Home screen</b></>}, then open it from there.
            It then works like an app, offline too.{ios() && ' What you log here in Safari stays separate from the app.'}
          </div>
        )}

        <ul className="space-y-2 text-sm">
          <li className={tip}><span aria-hidden>🔒 </span><b className="text-ink">Only on this phone.</b> Nothing is sent anywhere and there's no account. That also means no syncing to other devices.</li>
          <li className={tip}><span aria-hidden>💾 </span><b className="text-ink">Deleting the app deletes your data.</b> Save a backup file now and then: Settings → Backup, or after any workout.</li>
          <li className={tip}><span aria-hidden>☁️ </span><b className="text-ink">Want it synced and safe on a server?</b> <a className="text-accent underline" href={SETUP} target="_blank" rel="noreferrer">Host your own copy</a> for free on Cloudflare, then restore your backup there.</li>
        </ul>

        <div className="grid gap-2">
          <button className="btn py-3 text-base" disabled={busy} onClick={() => go(false)}>Start fresh</button>
          <button className="btn-ghost py-3" disabled={busy} onClick={() => go(true)}>Look around with sample data first</button>
        </div>
        {error && <p className="text-center text-sm text-bad">{error}</p>}
      </div>
    </div>
  )
}

/** Settings, phone-only copies: where the data lives, whether the phone may clear it, and Start over. */
export function ThisPhoneCard() {
  const [kept, setKept] = useState<boolean | null>(null)
  useEffect(() => void navigator.storage?.persisted?.().then(p => p || navigator.storage.persist()).then(setKept, () => setKept(null)), [])
  const startOver = () => {
    if (!confirm('Delete everything RepRun keeps on this phone? Workouts, runs, routines, body weight: all of it. Save a backup first if you might want it back.')) return
    wipeLocal()
    location.assign('/')
  }
  return (
    <Card title="This phone">
      <p className="text-sm text-muted">Everything is stored on this phone only: no account, no server, no sync.</p>
      <p className="mt-2 text-sm text-muted">
        {kept === true ? '✓ Protected: the phone won\'t clear it to free up space.'
          : kept === false ? 'Not protected yet: if the phone runs very low on space it may clear it. Opening RepRun from the home screen helps. Keep backups.'
          : 'Keep backups: deleting the app deletes its data.'}
      </p>
      <p className="mt-2 text-sm text-muted">Want it synced and safe on a server? <a className="text-accent underline" href={SETUP} target="_blank" rel="noreferrer">Host your own copy</a>, then use Restore there.</p>
      <button className="btn-danger mt-4" onClick={startOver}>Start over</button>
    </Card>
  )
}

/** After a workout on phone-only copies: one tap to a backup. Louder when the last one is a week old or more. */
export function BackupNudge() {
  const { data } = useData()
  const [age, setAge] = useState(backupAge)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stale = age === null || age >= 7
  const save = () => {
    setBusy(true)
    setError(null)
    saveBackup(data).then(ok => ok && setAge(backupAge()), e => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false))
  }
  return (
    <div className={`rounded-2xl border p-4 text-left text-sm ${stale ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface'}`}>
      <p>
        <b>Saved on this phone.</b>{' '}
        <span className="text-muted">{age === null ? 'No backup file yet.' : age === 0 ? 'Backed up today.' : `Last backup ${age === 1 ? 'yesterday' : `${age} days ago`}.`}</span>
      </p>
      <button className={`${stale ? 'btn' : 'btn-ghost'} mt-3 w-full`} disabled={busy} onClick={save}>Save a backup</button>
      {error && <p className="mt-2 text-bad">{error}</p>}
    </div>
  )
}
