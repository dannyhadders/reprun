// Screens only the phone-only copy (app.reprun.co.uk) shows: the This phone card in Settings and the
// backup nudge after a workout. Its first run is the onboarding (components/Onboarding.tsx). See src/lib/local.ts.
import { useEffect, useState } from 'react'
import { backupAge, saveBackup } from '../lib/backupFile'
import { useData } from '../lib/data'
import { wipeLocal } from '../lib/local'
import { ask, Card } from './ui'

const SETUP = 'https://github.com/dannyhadders/reprun/blob/main/docs/SETUP.md'

/** Settings, phone-only copies: where the data lives, whether the phone may clear it, and Start over. */
export function ThisPhoneCard() {
  const [kept, setKept] = useState<boolean | null>(null)
  useEffect(() => void navigator.storage?.persisted?.().then(p => p || navigator.storage.persist()).then(setKept, () => setKept(null)), [])
  const startOver = async () => {
    if (!await ask('Delete everything RepRun keeps on this phone? Workouts, runs, routines, body weight: all of it. Save a backup first if you might want it back.', 'Delete everything', true)) return
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
