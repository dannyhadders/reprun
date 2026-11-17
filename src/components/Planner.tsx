import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { estimateS, formatLine, parsePlan, roughTime, targetText, type PlanItem } from '../../shared/plan'
import { GOALS, type GoalId } from '../../shared/rules'
import { startersFor } from '../../shared/starter'
import type { Data, Profile, Routine, WorkoutSet } from '../../shared/types'
import { api, useData } from '../lib/data'
import { ago, date as fmtDate, plural } from '../lib/format'
import { Tap } from '../lib/haptic'
import { lastSets, type Model } from '../lib/stats'
import { ask, Icon } from './ui'
import { fromRoutine, fromWorkout, matchExercise, start, type Active } from '../lib/session'

/** Routines with their exercises and when each was last done; `next` is the one done longest ago (never-done first). Home shows it too. */
export function routineRows(data: Data, model: Model) {
  // A routine counts as done when a workout carries its name (starting one sets the title).
  const routines = data.routines.map(r => ({ r, items: parsePlan(r.body).flatMap(x => x.items), last: model.sessions.find(s => s.workout && s.title === r.name)?.date ?? null }))
  return { routines, next: [...routines].sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))[0] }
}

/** The logger's start screen: next routine up, all routines, recent workouts to repeat, or an empty one. */
export function Planner({ begin, children }: { begin: (a: Active) => void; children?: ReactNode }) {
  const { data, model, reload } = useData()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false) // hides the button once saved, even if the reload after it fails
  const addStarters = async () => {
    setAdding(true)
    try {
      await api('POST', 'routines', { routines: startersFor(data.profile.goals) })
      setAdded(true)
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null) // which row is showing its preview
  const toggle = (k: string) => setOpen(open === k ? null : k)
  const last = (name: string) => lastSets(model, name)
  const go = (a: Active) => begin(a)

  const { routines, next } = routineRows(data, model)
  const recent = model.sessions.filter(s => s.workout?.sets.length).slice(0, 5)

  if (editing) return <ImportPlan routine={editing === 'new' ? null : editing} close={() => setEditing(null)} />
  return (
    <div className="space-y-6 pt-6">
      <div className="space-y-2">
        <Link to="/" className="text-sm text-muted">← Dashboard</Link>
        <h1 className="text-3xl font-bold tracking-tight">Start a workout</h1>
      </div>
      {children}

      {next && (
        <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Next up</p>
          <h2 className="mt-1 text-xl font-bold">{next.r.name}</h2>
          <button className="relative mt-1 w-full text-left text-sm text-muted" aria-expanded={open === 'next'} onClick={() => toggle('next')}><Tap />
            {open === 'next' ? 'Hide exercises' : <>{next.items.slice(0, 4).map(i => i.name).join(' · ')}{next.items.length > 4 ? ` · +${next.items.length - 4} more` : ''}</>} <Chevron open={open === 'next'} />
          </button>
          {open === 'next' && <Preview rows={planRows(next.items)} />}
          <p className="mt-1 text-xs text-muted"><Time s={estimateS(next.items)} /> · {next.last ? `Last done ${ago(next.last).toLowerCase()}` : 'Not done yet'}</p>
          <button className="relative btn mt-3 w-full py-3 text-base" onClick={() => go(fromRoutine(next.r, data.exercises, last, data.aliases))}><Tap />Start {next.r.name}</button>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Routines</h2>
          <button className="relative btn-ghost py-1.5" onClick={() => setEditing('new')}><Tap />+ Import plan</button>
        </div>
        {routines.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {routines.map(({ r, items, last: when }) => (
              <li key={r.id} className="p-3">
                <div className="flex items-center gap-2">
                  <button className="relative min-w-0 flex-1 text-left" aria-expanded={open === `r${r.id}`} onClick={() => toggle(`r${r.id}`)}><Tap />
                    <p className="truncate font-semibold">{r.name} <Chevron open={open === `r${r.id}`} /></p>
                    <p className="truncate text-xs text-muted"><Time s={estimateS(items)} /> · {plural(items.length, 'exercise')} · {when ? ago(when) : 'not done yet'}</p>
                  </button>
                  <button className="relative icon-btn" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Tap />✎</button>
                  <button className="relative btn py-1.5" onClick={() => go(fromRoutine(r, data.exercises, last, data.aliases))}><Tap />Start</button>
                </div>
                {open === `r${r.id}` && (
                  <Preview rows={planRows(items)} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            <p>No routines yet. Start with ours, or import a plan from your PT or ChatGPT: paste the text and each day becomes a routine.</p>
            {added ? <p className="mt-3 text-good">Added. They'll show here once the page refreshes.</p>
              : <button className={`relative btn mt-3 w-full ${adding ? 'busy' : ''}`} disabled={adding} aria-busy={adding} onClick={addStarters}>{!adding && <Tap />}Add starter routines</button>}
            <p className="mt-2 text-xs">{startersFor(data.profile.goals).map(r => r.name).join(' · ')}{data.profile.goals?.length ? ', for your goals' : ''}. Edit or delete them any time.</p>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">Repeat a recent workout</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {recent.map(s => (
              <li key={s.key} className="p-3">
                <div className="flex items-center gap-2">
                  <button className="relative min-w-0 flex-1 text-left" aria-expanded={open === s.key} onClick={() => toggle(s.key)}><Tap />
                    <p className="truncate font-semibold">{s.title} <Chevron open={open === s.key} /></p>
                    <p className="truncate text-xs text-muted"><Time s={s.durationS} approx={s.durationSource === 'estimate'} /> · {fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {plural(new Set(s.workout!.sets.map(x => x.exercise_id)).size, 'exercise')}</p>
                  </button>
                  <button className="relative btn-ghost py-1.5" onClick={() => go(fromWorkout(s.workout!, model.exById))}><Tap />Repeat</button>
                </div>
                {open === s.key && <Preview rows={byExercise(s.workout!.sets).map(([id, sets]) => [model.exById.get(id)?.name ?? '?', sets.map(x => `${x.weight_kg ?? 'BW'}×${x.reps ?? '–'}`).join(', '), null])} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="relative btn-ghost w-full py-3" onClick={() => go(start())}><Tap />Empty workout</button>
    </div>
  )
}

// Lucide "clock", inline like the app's other icons.
const CLOCK = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'
export const Time = ({ s, approx = true }: { s: number | null; approx?: boolean }) => s
  ? <span className="whitespace-nowrap"><Icon d={CLOCK} className="mr-1 inline h-3.5 w-3.5 align-[-3px]" />{approx ? '~' : ''}{roughTime(s)}</span>
  : null

const Chevron = ({ open }: { open: boolean }) => <span aria-hidden className={`inline-block text-xs text-muted transition ${open ? 'rotate-90' : ''}`}>›</span>

const planRows = (items: PlanItem[]): [string, string, string | null][] =>
  items.map(p => [p.name, `${targetText(p)}${p.weight !== null ? ` · ${p.weight} kg` : ''}${p.restS ? ` · rest ${p.restS}s` : ''}`, p.note])

function byExercise(sets: WorkoutSet[]) {
  const g = new Map<number, WorkoutSet[]>()
  for (const x of sets) g.set(x.exercise_id, [...(g.get(x.exercise_id) ?? []), x])
  return [...g]
}

function Preview({ rows }: { rows: [string, string, string | null][] }) {
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
      {rows.map(([name, detail, note], i) => (
        <li key={i}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>{name}</span>
            <span className="ml-auto text-right tabular-nums text-muted">{detail}</span>
          </div>
          {note && <p className="text-xs text-muted">{note}</p>}
        </li>
      ))}
    </ul>
  )
}

/**
 * The ChatGPT prompt (Planner and onboarding): who they are and what they're after, then ask ChatGPT to quiz them
 * before writing a plan in the format the importer reads. Unknown details are just left out.
 */
export function planPrompt(names: string[], me: { goals?: GoalId[]; weight_kg?: number | null; age?: number | null; sex?: Profile['sex'] | null } = {}) {
  const goals = (me.goals ?? []).map(g => GOALS.find(x => x.id === g)!.label.toLowerCase())
  const about = [goals.length && `I want to ${goals.join(' and ')}`, me.age && `I'm ${me.age}`, me.weight_kg && `I weigh ${me.weight_kg} kg`, me.sex && `I'm ${me.sex === 'female' ? 'a woman' : 'a man'}`].filter(Boolean)
  return `Help me plan my gym training. I log it in an app called RepRun, which imports the plan you write.
${about.length ? `About me: ${about.join(', ')}.\n` : ''}Before you write anything, ask me a few short questions, one at a time: how many days a week I can train, how long a session can be, what equipment I have, any injuries, and how experienced I am.
Then write my gym plan as plain text, no tables or markdown.
Start each workout day with its name on its own line, ending with a colon.
Then one line per exercise, exactly like this:
Bicep Curl – 3x8-10 @ 12kg, rest 60s; optional coaching note
Use kg. Leave out "@ ...kg" for bodyweight exercises.${names.length ? `\nWhere they fit, use these exact exercise names: ${names.join(', ')}.` : ''}`
}

function ImportPlan({ routine, close }: { routine: Routine | null; close: () => void }) {
  const { data, reload } = useData()
  const [text, setText] = useState(routine ? `${routine.name}:\n${routine.body}` : '')
  const [rename, setRename] = useState<Record<string, string>>({}) // plan name (lower case) -> existing exercise
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => parsePlan(text), [text])
  const nameFor = (raw: string) => rename[raw.toLowerCase()] ?? matchExercise(raw, data.exercises, data.aliases)?.name ?? null

  const save = async () => {
    const out = parsed.map(r => ({ name: r.name, body: r.items.map(p => formatLine({ ...p, name: nameFor(p.name) ?? p.name })).join('\n') }))
    setBusy(true)
    try {
      if (routine) {
        await api('PUT', `routines/${routine.id}`, out[0])
        if (out.length > 1) await api('POST', 'routines', { routines: out.slice(1) })
      } else await api('POST', 'routines', { routines: out })
      await reload()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!routine || !await ask(`Delete the ${routine.name} routine? Past workouts stay.`, 'Delete', true)) return
    await api('DELETE', `routines/${routine.id}`)
    await reload()
    close()
  }

  return (
    <div className="space-y-4 pt-6">
      <button className="text-sm text-muted" onClick={close}>← Back</button>
      <h1 className="text-3xl font-bold tracking-tight">{routine ? `Edit ${routine.name}` : 'Import a plan'}</h1>
      <p className="text-sm text-muted">Paste a plan from your PT or ChatGPT. Each day's name on its own line, then one exercise per line, like <code className="text-ink">Bicep Curl – 3x8-10 @ 12kg, rest 60s</code>.</p>
      <button className="btn-ghost w-full" onClick={async () => { await navigator.clipboard.writeText(planPrompt(data.exercises.map(e => e.name), { goals: data.profile.goals, age: data.profile.age, weight_kg: data.profile.weight_kg }) /* not sex: it defaults to male, so it may never have been said */); setCopied(true) }}>
        {copied ? 'Copied: paste it into ChatGPT and answer its questions' : 'Copy a prompt for ChatGPT'}
      </button>
      <textarea className="input min-h-48 font-mono text-[13px]" placeholder={'Arm day:\nEZ-bar Curl – 3x10-12 @ 19kg, rest 75s\n…'} value={text} onChange={e => setText(e.target.value)} aria-label="Plan text" />

      {parsed.map((r, i) => (
        <section key={i} className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-bold">{r.name} <span className="text-sm font-normal text-muted">· {plural(r.items.length, 'exercise')}</span></h2>
          <ul className="mt-2 space-y-2 text-sm">
            {r.items.map((p, j) => {
              const matched = nameFor(p.name)
              return (
                <li key={j}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={matched ? '' : 'text-pb'}>{matched ?? p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{targetText(p)}{p.weight !== null ? ` · ${p.weight} kg` : ''}{p.restS ? ` · ${p.restS}s` : ''}</span>
                  </div>
                  {!matched && (
                    <label className="mt-1 flex items-center gap-2 text-xs text-muted">New exercise, or is it
                      <select className="input w-auto py-1 text-xs" value="" onChange={e => setRename({ ...rename, [p.name.toLowerCase()]: e.target.value })}>
                        <option value="">keep as new</option>
                        {data.exercises.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                      </select>
                    </label>
                  )}
                  {p.note && <p className="text-xs text-muted">{p.note}</p>}
                </li>
              )
            })}
          </ul>
          {r.unparsed.length > 0 && <p className="mt-3 text-xs text-muted">Skipped: {r.unparsed.join(' · ')}</p>}
        </section>
      ))}

      {error && <p className="text-sm text-bad">{error}</p>}
      <button className={`btn w-full py-3 ${busy ? 'busy' : ''}`} disabled={busy || !parsed.length} aria-busy={busy} onClick={save}>
        {routine ? 'Save routine' : parsed.length ? `Save ${plural(parsed.length, 'routine')}` : 'Paste a plan to preview it'}
      </button>
      {routine && <button className="w-full py-2 text-sm text-bad" onClick={remove}>Delete routine</button>}
    </div>
  )
}
