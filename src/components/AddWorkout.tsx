import { useRef, useState } from 'react'
import { resolveExercise } from '../../shared/catalogue.ts'
import type { ImportPayload } from '../../shared/types.ts'
import { api, useData } from '../lib/data'
import { today } from '../lib/format'
import { Tabs } from './ui'

type Row = { exercise: string; reps: string; weight: string }
const blank: Row = { exercise: '', reps: '', weight: '' }
// "45" = minutes, "45:30" = mm:ss, "1:02:30" = h:mm:ss
const toSeconds = (t: string) => (t.includes(':') ? t.split(':').reduce((a, b) => a * 60 + Number(b), 0) : Number(t) * 60)

export function AddWorkout({ className = '', onOpen }: { className?: string; onOpen?: () => void }) {
  const { data, reload } = useData()
  const dlg = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState<'strength' | 'run'>('strength')
  const [date, setDate] = useState(today())
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<Row[]>([blank])
  const [dist, setDist] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = () => {
    onOpen?.()
    setDate(today()); setTitle(''); setRows([blank]); setDist(''); setTime(''); setError(null)
    dlg.current?.showModal()
  }
  const setRow = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)))

  const save = async () => {
    const p: ImportPayload = { workouts: [], activities: [], records: [], goals: [] }
    if (kind === 'run') {
      const seconds = toSeconds(time)
      if (!(+dist > 0) || !(seconds > 0)) return setError('Add a distance and a time (e.g. 45 or 45:30)')
      p.activities.push({
        date, start: null, sport: 'Run', name: title || 'Run', distance_m: +dist * 1000, moving_s: Math.round(seconds), elapsed_s: Math.round(seconds),
        elevation_m: null, avg_hr: null, notes: null, source: 'manual', external_id: null, sample: 0,
      })
    } else {
      const sets = rows.filter(r => r.exercise.trim())
      if (!sets.length) return setError('Add at least one exercise')
      if (sets.some(r => !(+r.reps > 0) || (r.weight !== '' && !(+r.weight >= 0)))) return setError('Reps must be above 0; weight is optional')
      p.workouts.push({
        date, title: title || null, notes: null, source: 'manual',
        sets: sets.map((r, i) => {
          const weight = r.weight === '' ? null : +r.weight
          const e = resolveExercise(r.exercise, weight)
          return { exercise: e.name, muscle: e.muscle, lift: e.lift ?? null, position: i, weight_kg: weight, reps: +r.reps, seconds: null, notes: null }
        }),
      })
    }
    setBusy(true)
    try {
      await api('POST', 'import', p)
      await reload()
      dlg.current?.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className={className} onClick={open} aria-label="Log a workout">+ Add past workout</button>
      <dialog ref={dlg} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/60">
        <form method="dialog" className="space-y-4" onSubmit={e => (e.preventDefault(), save())}>
          <div className="flex items-center justify-between gap-3">
            <Tabs value={kind} onChange={setKind} options={[{ value: 'strength', label: 'Strength' }, { value: 'run', label: 'Run' }]} />
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => dlg.current?.close()}>✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-muted">Date<input className="input mt-1" type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="text-sm text-muted">Name<input className="input mt-1" placeholder={kind === 'run' ? 'Run' : 'Push day'} value={title} onChange={e => setTitle(e.target.value)} /></label>
          </div>

          {kind === 'run' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-muted">Distance (km)<input className="input mt-1" type="number" step="0.01" min="0" inputMode="decimal" value={dist} onChange={e => setDist(e.target.value)} /></label>
              <label className="text-sm text-muted">Time<input className="input mt-1" placeholder="45:30" inputMode="numeric" pattern="[0-9:]+" value={time} onChange={e => setTime(e.target.value)} /></label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_4.5rem_5.5rem_2rem] gap-2 text-xs text-muted"><span>Exercise</span><span>Reps</span><span>Weight kg</span></div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_4.5rem_5.5rem_2rem] gap-2">
                  <input className="input" list="exercise-names" aria-label="Exercise" value={r.exercise} onChange={e => setRow(i, { exercise: e.target.value })} />
                  <input className="input" type="number" min="1" inputMode="numeric" aria-label="Reps" value={r.reps} onChange={e => setRow(i, { reps: e.target.value })} />
                  <input className="input" type="number" min="0" step="0.5" inputMode="decimal" aria-label="Weight in kg" placeholder="BW" value={r.weight} onChange={e => setRow(i, { weight: e.target.value })} />
                  <button type="button" className="icon-btn" aria-label="Remove set" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank])}>✕</button>
                </div>
              ))}
              {/* New set copies the last one, so logging 3x the same lift is two taps. */}
              <button type="button" className="btn-ghost w-full" onClick={() => setRows([...rows, { ...rows[rows.length - 1] }])}>+ Add set</button>
              <datalist id="exercise-names">{data.exercises.map(e => <option key={e.id} value={e.name} />)}</datalist>
            </div>
          )}

          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </form>
      </dialog>
    </>
  )
}
