import { localISO, plural, date as fmtDate } from '../lib/format'

/** GitHub-style year grid: one column per week (Mon at the top), shaded by how much happened that day. */
export function Heatmap({ year, days }: { year: number; days: Map<string, number> }) {
  const first = new Date(year, 0, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  const weeks: { iso: string; inYear: boolean }[][] = []
  for (let d = new Date(start); d.getFullYear() <= year; ) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push({ iso: localISO(d), inYear: d.getFullYear() === year })
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
    if (d.getFullYear() > year) break
  }
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const shade = (n: number) => (n >= 3 ? 'bg-accent-2' : n === 2 ? 'bg-accent' : n === 1 ? 'bg-accent/45' : 'bg-surface-2')

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-[3px] pl-0 text-[10px] text-muted">
          {weeks.map((w, i) => {
            const firstOfMonth = w.find(d => d.inYear && d.iso.endsWith('-01'))
            return <div key={i} className="w-[11px]">{firstOfMonth ? months[+firstOfMonth.iso.slice(5, 7) - 1] : ''}</div>
          })}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {w.map(d => {
                const n = days.get(d.iso) ?? 0
                return (
                  <div
                    key={d.iso}
                    title={d.inYear ? `${fmtDate(d.iso)}: ${n ? plural(n, 'activity', 'activities') : 'rest day'}` : undefined}
                    className={`h-[11px] w-[11px] rounded-[3px] ${d.inYear ? shade(n) : 'bg-transparent'}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
          Rest {[0, 1, 2, 3].map(n => <span key={n} className={`h-[10px] w-[10px] rounded-[3px] ${shade(n)}`} />)} Busy
        </div>
      </div>
    </div>
  )
}
