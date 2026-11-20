import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Muscle } from '../../shared/types'
import { PageHeader, Tabs } from '../components/ui'
import { useData } from '../lib/data'
import { ago, kg, num, plural } from '../lib/format'
import { exerciseBests, MUSCLES } from '../lib/stats'

export default function Exercises() {
  const { model, data } = useData()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<'all' | Muscle>('all')

  const rows = useMemo(() => data.exercises
    .map(e => ({ e, b: exerciseBests(model, e.id) }))
    .filter(x => x.b.sessions > 0)
    .sort((a, b) => (b.b.last ?? '').localeCompare(a.b.last ?? '') || b.b.totalSets - a.b.totalSets), [data, model])
  const shown = rows.filter(x => (muscle === 'all' || x.e.muscle === muscle) && x.e.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <PageHeader title="Exercises" sub={`${plural(rows.length, 'exercise')} logged. Tap one for PBs and progress.`} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input className="input md:max-w-xs" placeholder="Search exercises" value={q} onChange={e => setQ(e.target.value)} aria-label="Search exercises" />
        <Tabs size="sm" value={muscle} onChange={setMuscle} options={[{ value: 'all', label: 'All' }, ...MUSCLES.map(m => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))]} />
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {shown.map(({ e, b }) => (
            <li key={e.id}>
              <Link to={`/exercises/${e.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2 md:px-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-sm font-bold text-accent">{e.name.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className="text-xs text-muted"><span className="capitalize">{e.muscle}</span> · {plural(b.sessions, 'session')} · {b.last && ago(b.last)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {b.heaviest ? `${kg(b.heaviest.value, e.name)}` : b.longestHold ? `${num(b.longestHold.value)}s` : b.mostReps ? `${num(b.mostReps.value)} reps` : '–'}
                  </div>
                  <div className="text-xs text-muted">{b.heaviest ? 'heaviest' : b.longestHold ? 'longest hold' : 'best'}</div>
                </div>
              </Link>
            </li>
          ))}
          {!shown.length && <li className="p-6 text-center text-sm text-muted">{rows.length ? 'Nothing matches.' : 'No exercises yet. They show up here after your first workout.'}</li>}
        </ul>
      </div>
    </div>
  )
}
