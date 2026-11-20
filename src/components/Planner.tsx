import { useMemo, useState, type ReactNode } from 'react'
import { working } from '../../shared/types'
import { Link } from 'react-router-dom'
import { estimateS, focusChoices, formatLine, parsePlan, planPrompt, roughTime, targetText, workoutPrompt, type PlanItem } from '../../shared/plan'
import { startersFor } from '../../shared/starter'
import type { Data, Routine, WorkoutSet } from '../../shared/types'
import { api, useData } from '../lib/data'
import { activityText, ago, date as fmtDate, kg, plural, shown, unitOf, workoutText } from '../lib/format'
import { Tap } from '../lib/haptic'
import { lastSets, type Model } from '../lib/stats'
import { MUSCLE_ICON } from '../lib/muscleIcons'
import { RoutineBuilder } from './RoutineBuilder'
import { ask, CHECK, COPY, Icon, Sheet, Tabs } from './ui'
import { fromRoutine, fromWorkout, matchExercise, start, type Active } from '../lib/session'

// A routine picked as next up, with when it was last done at the time. Once it's done again `last` moves on and the pick lapses.
// ponytail: per device in localStorage; move it to the profile if a second phone should see the same pick.
type Pick = { id: number; since: string | null }
const PICK = 'reprun.nextPick'
const getPick = (): Pick | null => { try { return JSON.parse(localStorage.getItem(PICK) ?? 'null') as Pick | null } catch { return null } }
const setPick = (p: Pick | null) => { try { if (p) localStorage.setItem(PICK, JSON.stringify(p)); else localStorage.removeItem(PICK) } catch { /* stays automatic */ } }

/** Routines with their exercises and when each was last done; `next` is your pick, else the one done longest ago (never-done first). Home shows it too. */
export function routineRows(data: Data, model: Model) {
  // A routine counts as done when a workout carries its name (starting one sets the title).
  const routines = data.routines.map(r => ({ r, items: parsePlan(r.body).flatMap(x => x.items), last: model.sessions.find(s => s.workout && s.title === r.name)?.date ?? null }))
  const auto = [...routines].sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))[0]
  const p = getPick()
  const picked = p ? routines.find(x => x.r.id === p.id && x.last === p.since) : undefined
  return { routines, auto, next: picked ?? auto, picked: !!picked }
}

/** "What's next?": Automatic or any routine. One tap picks and closes. */
function PickNext({ rows, auto, current, close }: { rows: ReturnType<typeof routineRows>['routines']; auto: string; current: number | null; close: () => void }) {
  const choose = (p: Pick | null) => (setPick(p), close())
  const row = (on: boolean, title: string, sub: string, pick: Pick | null, key: string) => (
    <li key={key}>
      <button role="radio" aria-checked={on} className="relative flex w-full items-center gap-3 p-3 text-left" onClick={() => choose(pick)}><Tap />
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-line'}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}</span>
        <span className="min-w-0"><span className="block truncate font-semibold">{title}</span><span className="block truncate text-xs text-muted">{sub}</span></span>
      </button>
    </li>
  )
  return (
    <Sheet close={close} label="What's next?">
      <h2 className="text-lg font-bold">What's next?</h2>
      <p className="mb-3 text-sm text-muted">Pick the routine for your next workout.</p>
      <ul role="radiogroup" className="divide-y divide-line rounded-2xl border border-line bg-surface-2">
        {row(current === null, 'Automatic', `The one done longest ago: ${auto}`, null, 'auto')}
        {rows.map(({ r, last }) => row(current === r.id, r.name, last ? `Last done ${ago(last).toLowerCase()}` : 'Not done yet', { id: r.id, since: last }, String(r.id)))}
      </ul>
    </Sheet>
  )
}

/** The logger's start screen: next routine up, all routines, recent workouts to repeat, or an empty one. */
export function Planner({ begin, children }: { begin: (a: Active) => void; children?: ReactNode }) {
  const { data, model, reload, backToIntro } = useData()
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
  // /log#import (the intro's "Paste a plan") opens straight on the paste box.
  const [editing, setEditing] = useState<Routine | 'new' | null>(() => (location.hash === '#import' ? 'new' : null))
  const [open, setOpen] = useState<string | null>('next') // which row is showing its preview: Next up's, to start with
  const toggle = (k: string) => setOpen(open === k ? null : k)
  const last = (name: string) => lastSets(model, name)
  const go = (a: Active) => begin(a)

  const [choosing, setChoosing] = useState(false)
  const { routines, next, auto, picked } = routineRows(data, model)
  const recent = model.sessions.filter(s => s.workout?.sets.length).slice(0, 5)

  if (editing) return <ImportPlan routine={editing === 'new' ? null : editing} close={() => (setEditing(null), backToIntro?.())} />
  return (
    <div className="space-y-6 pt-6">
      <div className="space-y-2">
        <Link to="/" className="text-sm text-muted">← Dashboard</Link>
        <h1 className="text-3xl font-bold tracking-tight">Start a workout</h1>
      </div>
      {children}

      {next && (
        <section className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Next up{picked && <span className="normal-case tracking-normal text-muted"> · your pick</span>}</p>
            {routines.length > 1 && <button className="relative btn-ghost -my-1 border-accent/40 py-1.5 text-accent" onClick={() => setChoosing(true)}><Tap /><Icon d={SWAP} className="h-4 w-4" />Change</button>}
          </div>
          <h2 className="mt-1 text-xl font-bold">{next.r.name}</h2>
          <button className="relative mt-1 w-full text-left text-sm text-muted" aria-expanded={open === 'next'} onClick={() => toggle('next')}><Tap />
            {open === 'next' ? 'Hide exercises' : <>{next.items.slice(0, 4).map(i => i.name).join(' · ')}{next.items.length > 4 ? ` · +${next.items.length - 4} more` : ''}</>} <Chevron open={open === 'next'} />
          </button>
          {open === 'next' && <Preview rows={planRows(next.items)} />}
          <p className="mt-1 text-xs text-muted"><Time s={estimateS(next.items)} /> · {next.last ? `Last done ${ago(next.last).toLowerCase()}` : 'Not done yet'}</p>
          <button className="relative btn mt-3 w-full py-3 text-base" onClick={() => go(fromRoutine(next.r, data.exercises, last, data.aliases))}><Tap />Start {next.r.name}</button>
        </section>
      )}
      {choosing && auto && <PickNext rows={routines} auto={auto.r.name} current={picked ? next.r.id : null} close={() => setChoosing(false)} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Routines</h2>
          <button className="relative btn-ghost py-1.5" onClick={() => setEditing('new')}><Tap />+ Import / create plan</button>
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
                {open === s.key && <Preview rows={byExercise(s.workout!.sets.filter(working)).map(([id, sets]) => [model.exById.get(id)?.name ?? '?', sets.map(x => `${x.weight_kg === null ? 'BW' : shown(x.weight_kg, unitOf(model.exById.get(id)?.name))}×${x.reps ?? '–'}`).join(', '), null])} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="relative btn-ghost w-full flex-col gap-0 border-dashed py-3" onClick={() => go(start())}><Tap />Start an empty workout<span className="text-xs font-normal text-muted">Add exercises as you go</span></button>
    </div>
  )
}

const SWAP = 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4' // Lucide arrow-left-right

// Lucide "clock", inline like the app's other icons.
const CLOCK = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'
export const Time = ({ s, approx = true }: { s: number | null; approx?: boolean }) => s
  ? <span className="whitespace-nowrap"><Icon d={CLOCK} className="mr-1 inline h-3.5 w-3.5 align-[-3px]" />{approx ? '~' : ''}{roughTime(s)}</span>
  : null

const Chevron = ({ open }: { open: boolean }) => <span aria-hidden className={`inline-block text-xs text-muted transition ${open ? 'rotate-90' : ''}`}>›</span>

const planRows = (items: PlanItem[]): [string, string, string | null][] =>
  items.map(p => [p.name, `${targetText(p)}${p.weight !== null ? ` · ${kg(p.weight, p.name)}` : ''}${p.restS ? ` · rest ${p.restS}s` : ''}`, p.note])

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

/** "Ask ChatGPT for one workout": three muscle groups trained least in the last 7 days; tapping one copies a prompt with that week in it. */
const SPARKLES = 'M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0zM20 3v4M22 5h-4M4 17v2M5 18H3' // Lucide sparkles
const PENCIL = 'M13 21h8M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' // Lucide pen-line: DIY
const ZAP = 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' // Lucide zap
const CALENDAR = 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01' // Lucide calendar-days
const tabLabel = (d: string, text: string) => <span className="inline-flex items-center gap-1.5"><Icon d={d} className="h-4 w-4" />{text}</span>

/** "Get one from ChatGPT": Just today (three buttons, above) or a Full weekly plan (the questions-first prompt). */
function AskChatGPT() {
  const { data, model } = useData()
  const [tab, setTab] = useState<'today' | 'plan'>('today')
  const [copied, setCopied] = useState<string | null>(null)
  const me = { goals: data.profile.goals, age: data.profile.age, weight_kg: data.profile.weight_kg } // not sex: it defaults to male, so it may never have been said
  const [[today, from]] = useState(() => [new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)])
  const workouts = model.sessions.filter(s => s.workout?.sets.length).map(s => s.workout!) // newest first
  // The buttons weigh this week; the prompt gets the last 5 workouts however old, so a week off still shows your weights.
  const choices = focusChoices(workouts.filter(w => w.date >= from).flatMap(w => w.sets.filter(working).map(x => model.exById.get(x.exercise_id)?.muscle ?? 'other')))
  const copy = async (label: string) => {
    const recent = workouts.slice(0, 5).map(w => workoutText({ ...w, sets: w.sets.map(x => ({ ...x, exercise: model.exById.get(x.exercise_id)?.name ?? '?' })) }))
    // Runs and rides count too: a long run yesterday means no heavy legs today.
    const runs = [...model.runs, ...model.otherActivities].filter(a => a.date >= from).sort((a, b) => b.date.localeCompare(a.date)).map(activityText)
    await navigator.clipboard.writeText(workoutPrompt(label, today, recent, data.exercises.map(e => e.name), me, runs))
    setCopied(label)
  }
  const copyPlan = async () => (await navigator.clipboard.writeText(planPrompt(data.exercises.map(e => e.name), me)), setCopied('plan'))
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center justify-center gap-2 font-semibold"><Icon d={SPARKLES} className="h-5 w-5 text-accent" />Create one with AI</h2>
      <p className="mb-3 mt-0.5 text-center text-xs text-muted">Copy a prompt into ChatGPT (or any AI chat), then copy its reply and tap Paste from clipboard.</p>
      <div className="flex justify-center"><Tabs value={tab} options={[{ value: 'today', label: tabLabel(ZAP, 'Just today') }, { value: 'plan', label: tabLabel(CALENDAR, 'Full weekly plan') }]} onChange={t => (setTab(t), setCopied(null))} /></div>
      {tab === 'today' ? (
        <>
          <p className="mb-2 mt-3 text-xs text-muted">One workout for what you've trained least this week, planned around your last 5 workouts and this week's runs. Tap one to copy its prompt.</p>
          <div className="grid grid-cols-3 gap-2">
            {choices.map(c => (
              <button key={c.id} className={`relative btn-ghost flex-col gap-0 py-2 ${copied === c.label ? 'border-good' : ''}`} onClick={() => void copy(c.label)}><Tap />
                <Icon d={copied === c.label ? CHECK : MUSCLE_ICON[c.id]} className={`mb-1 h-6 w-6 ${copied === c.label ? 'text-good' : 'text-accent'}`} />
                <span className="font-semibold">{copied === c.label ? 'Copied' : c.label}</span>
                <span className="text-[11px] text-muted">{c.sets ? plural(c.sets, 'set') : 'none yet'}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 mt-3 text-xs text-muted">A plan for the whole week. ChatGPT asks a few questions first (days, time, equipment, injuries).</p>
          <button className={`relative btn-ghost w-full ${copied === 'plan' ? 'border-good' : ''}`} onClick={() => void copyPlan()}><Tap /><Icon d={copied === 'plan' ? CHECK : COPY} className="h-4 w-4" />{copied === 'plan' ? 'Copied' : 'Copy the prompt'}</button>
        </>
      )}
      {copied && <p className="mt-2 text-xs text-good">Paste it into ChatGPT{copied === 'plan' ? ' and answer its questions' : ''}, then copy its reply and tap Paste from clipboard below.</p>}
    </section>
  )
}

function ImportPlan({ routine, close }: { routine: Routine | null; close: () => void }) {
  const { data, reload } = useData()
  // Build it here (cards), or paste a plan's text. The intro's "Paste a plan" (/log#import) opens on Paste, and so does a
  // routine the builder couldn't show line for line (several days, or lines it doesn't read).
  const [mode, setMode] = useState<'build' | 'paste'>(() => {
    const days = routine ? parsePlan(routine.body) : []
    return location.hash === '#import' || days.length > 1 || days.some(d => d.unparsed.length) ? 'paste' : 'build'
  })
  const [text, setText] = useState(routine ? `${routine.name}:\n${routine.body}` : '')
  // The text box shows when there's text to edit (a routine, or the intro's Paste a plan); otherwise Paste from clipboard
  // does it in one tap, with "Type it yourself" for the box.
  const [showText, setShowText] = useState(() => !!routine || location.hash === '#import')
  // "Tweak before saving": a pasted single day opens in DIY as rows. A new key remounts the builder with it.
  const [seed, setSeed] = useState<{ name: string; body: string; key: number } | null>(null)
  const [built, setBuilt] = useState(0) // rows in DIY, so Tweak asks before replacing them
  // Paste from clipboard: only a plan replaces what's here. Anything else (nothing, a link, chat): keep the text, open the
  // box and say so. No clipboard access (refused, or not a secure page): open the box to paste by hand.
  const pasteClip = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!parsePlan(t).length) return (setShowText(true), setError('Nothing that looks like a plan in the clipboard. Copy ChatGPT\'s reply (or your plan) and try again, or paste it in the box.'))
      setText(t)
      setTitles({})
      setError(null)
    } catch {
      setShowText(true)
    }
  }
  const [rename, setRename] = useState<Record<string, string>>({}) // plan name (lower case) -> existing exercise
  // `${index}:${parsed name}` -> name typed in the preview. Editing the day's line in the text drops it: the text wins.
  const [titles, setTitles] = useState<Record<string, string>>({})
  const title = (r: { name: string }, i: number) => titles[`${i}:${r.name}`] ?? r.name
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => parsePlan(text), [text])
  const nameFor = (raw: string) => rename[raw.toLowerCase()] ?? matchExercise(raw, data.exercises, data.aliases)?.name ?? null

  const save = async () => {
    const out = parsed.map((r, i) => ({ name: title(r, i).trim() || r.name, body: r.items.map(p => formatLine({ ...p, name: nameFor(p.name) ?? p.name })).join('\n') }))
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

  const tabs = <Tabs full value={mode} onChange={setMode} options={[{ value: 'build', label: tabLabel(PENCIL, routine ? 'Edit here' : 'DIY') }, { value: 'paste', label: tabLabel(SPARKLES, routine ? 'Edit as text' : 'AI or paste') }]} />
  const unmatched = parsed.flatMap(d => d.items).filter(p => !nameFor(p.name)).length
  // Both stay mounted (one hidden), so flicking between the tabs never throws away cards or text already typed.
  return (
    <div className="space-y-4 pt-6">
      <button className="text-sm text-muted" onClick={close}>← Back</button>
      <h1 className="text-3xl font-bold tracking-tight">{routine ? `Edit ${routine.name}` : mode === 'build' ? "What's in it?" : 'Get a plan'}</h1>
      {tabs}
      <div hidden={mode !== 'build'}><RoutineBuilder key={seed?.key} routine={routine} seed={seed} close={close} onCount={setBuilt} /></div>
      <div hidden={mode !== 'paste'} className="space-y-4">
      {routine ? (
        <button className="btn-ghost w-full" onClick={async () => { await navigator.clipboard.writeText(planPrompt(data.exercises.map(e => e.name), { goals: data.profile.goals, age: data.profile.age, weight_kg: data.profile.weight_kg }) /* not sex: it defaults to male, so it may never have been said */); setCopied(true) }}>
          {copied ? 'Copied: paste it into ChatGPT and answer its questions' : 'Copy a prompt for ChatGPT'}
        </button>
      ) : <AskChatGPT />}
      {!routine && (
        <button type="button" className="relative btn-ghost min-h-[3.25rem] w-full border-dashed text-accent" onClick={() => void pasteClip()}>
          <Tap /><Icon d={COPY} className="h-4 w-4" />Paste from clipboard
        </button>
      )}
      {!showText ? (
        <button type="button" className="mx-auto block text-sm font-medium text-accent" onClick={() => setShowText(true)}>{text ? 'Edit the text' : 'Type it yourself'}</button>
      ) : (
        <p className="text-xs text-muted">Each day's name on its own line, then one exercise per line, like <code className="text-ink">Bicep Curl – 3x8-10 @ 12kg, rest 60s</code>.</p>
      )}
      <textarea hidden={!showText} className="input min-h-48 font-mono text-[13px]" placeholder={'Arm day:\nEZ-bar Curl – 3x10-12 @ 19kg, rest 75s\n…'} value={text} onChange={e => { setText(e.target.value); if (!e.target.value.trim()) setTitles({}) /* a fresh paste doesn't inherit names typed for the last one */ }} aria-label="Plan text" />

      {parsed.length > 0 && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Found {plural(parsed.length, 'day')} · {plural(parsed.reduce((n, d) => n + d.items.length, 0), 'exercise')}{' '}
          <span className={`normal-case tracking-normal ${unmatched ? 'text-pb' : 'text-good'}`}>· {unmatched ? `${unmatched} new` : 'all matched'}</span>
        </p>
      )}
      {parsed.map((r, i) => (
        <section key={i} className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <input className="input min-w-0 flex-1 py-1.5 text-base font-bold" aria-label={`Name of routine ${i + 1}`} placeholder={r.name} enterKeyHint="done" onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} value={title(r, i)} onChange={e => setTitles({ ...titles, [`${i}:${r.name}`]: e.target.value })} />
            <span className="shrink-0 text-sm font-normal text-muted">· {plural(r.items.length, 'exercise')}</span>
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {r.items.map((p, j) => {
              const matched = nameFor(p.name)
              return (
                <li key={j}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={matched ? '' : 'text-pb'}>{matched ?? p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{targetText(p)}{p.weight !== null ? ` · ${kg(p.weight, matched ?? p.name)}` : ''}{p.restS ? ` · ${p.restS}s` : ''}</span>
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
      {!routine && parsed.length === 1 && (
        <button type="button" className="relative btn-ghost w-full" onClick={async () => {
          if (built && !await ask(`Replace the ${plural(built, 'exercise')} you've started in DIY with this plan?`, 'Replace')) return
          const d = parsed[0]
          setSeed({ name: title(d, 0), body: d.items.map(p => formatLine({ ...p, name: nameFor(p.name) ?? p.name })).join('\n'), key: Date.now() })
          setMode('build')
        }}><Tap />Tweak before saving</button>
      )}
      <button className={`btn w-full py-3 ${busy ? 'busy' : ''}`} disabled={busy || !parsed.length} aria-busy={busy} onClick={save}>
        {routine ? 'Save routine' : parsed.length ? `Save ${plural(parsed.length, 'routine')}` : 'Paste a plan to preview it'}
      </button>
      </div>
      {routine && <button className="w-full py-2 text-sm text-bad" onClick={remove}>Delete routine</button>}
    </div>
  )
}
