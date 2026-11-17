// One-line hype for each session and for the overall picture. Everything is computed from the data,
// so the lines change as new sessions land. Each session gets a line no earlier session has used.
import { LIFT_NAMES, standing } from './standards.ts'
import { e1rm, longestWeekStreak, type Model, type Session } from './stats.ts'
import { daysBetween, kg, num, weekStart } from './format.ts'

// Rough weights, for "that's about N of these" comparisons.
export const THINGS: [string, string, number][] = [
  ['a grand piano', 'grand pianos', 450],
  ['a horse', 'horses', 500],
  ['a classic Mini', 'classic Minis', 650],
  ['a dairy cow', 'dairy cows', 700],
  ['a hippo', 'hippos', 1500],
  ['a London black cab', 'London black cabs', 2000],
  ['a white rhino', 'white rhinos', 2300],
  ['an African elephant', 'African elephants', 6000],
  ['a Routemaster', 'Routemasters', 7400],
  ['a T. rex', 'T. rexes', 8000],
  ['a double-decker bus', 'double-decker buses', 12000],
  ['a Tube carriage', 'Tube carriages', 30000],
  ['a Boeing 737', 'Boeing 737s', 41000],
  ['a blue whale', 'blue whales', 150000],
]
// Straight-line distances from London, for running totals.
const PLACES: [string, number][] = [
  ['Brighton', 76], ['Oxford', 82], ['Bristol', 171], ['Paris', 344], ['Manchester', 262], ['Amsterdam', 358], ['Edinburgh', 534], ['Berlin', 930], ['Rome', 1435],
]

const pickThing = (total: number, used?: Set<string>) => {
  const fits = THINGS.filter(([, , w]) => total / w >= 1 && total / w <= 12)
  const fresh = fits.filter(([one]) => !used?.has(one))
  return (fresh.length ? fresh : fits).at(-1) ?? null
}
const times = (total: number, [one, many, w]: [string, string, number]) => {
  const n = total / w
  return n < 1.15 ? one : `${num(n, n < 10 ? 1 : 0)} ${many}`
}

type Candidate = { kind: string; key: string; text: string }

function candidates(m: Model, s: Session, prevSame: Session | undefined, usedThings: Set<string>): Candidate[] {
  const out: Candidate[] = []
  const w = s.workout
  if (!w) {
    const mins = Math.round((s.durationS ?? 0) / 60)
    out.push({ kind: 'strava', key: `strava:${s.key}`, text: `${mins} minutes on the clock. The details live in your head, not the log.` })
    return out
  }
  const name = (id: number) => m.exById.get(id)?.name ?? 'that'

  // PBs first: they're the best news.
  const pbSets = w.sets.filter(x => m.pbs.has(x.id))
  if (pbSets.length) {
    const top = pbSets.reduce((a, x) => ((e1rm(x) ?? x.weight_kg ?? 0) > (e1rm(a) ?? a.weight_kg ?? 0) ? x : a))
    const hist = m.exHistory.get(top.exercise_id) ?? []
    const before = hist.filter(h => h.date < w.date).flatMap(h => h.sets)
    const prevBest = Math.max(0, ...before.map(x => x.weight_kg ?? 0))
    const kinds = m.pbs.get(top.id)!
    const what = kinds.includes('weight') && prevBest
      ? `${kg(top.weight_kg)} × ${num(top.reps ?? 0)}, ${kg((top.weight_kg ?? 0) - prevBest)} up on your old best`
      : kinds.includes('reps') ? `${num(top.reps ?? 0)} reps, a new high` : `${kg(top.weight_kg)} × ${num(top.reps ?? 0)}, your strongest set yet`
    const more = pbSets.length > 1 ? ` (and ${pbSets.length - 1} more PB${pbSets.length > 2 ? 's' : ''})` : ''
    out.push({ kind: 'pb', key: `pb:${w.id}`, text: `New PB on ${name(top.exercise_id)}: ${what}${more}.` })
  }

  // Strength standards, for the big barbell lifts.
  for (const x of w.sets) {
    const ex = m.exById.get(x.exercise_id)
    const est = e1rm(x)
    if (!ex?.lift || !est) continue
    const st = standing(ex.lift, est, m.data.profile)
    if (!st) continue
    out.push({
      kind: 'standard',
      key: `std:${ex.lift}:${Math.round(st.pct / 5)}`,
      text: `That ${kg(x.weight_kg)} × ${num(x.reps ?? 0)} ${LIFT_NAMES[ex.lift]} (≈${kg(Math.round(est))} 1RM) beats roughly ${st.pct}% of men your weight who lift.`,
    })
    break
  }

  if (prevSame && prevSame.volume > 0 && s.volume > 0) {
    const diff = Math.round((s.volume / prevSame.volume - 1) * 100)
    if (diff >= 5) out.push({ kind: 'compare', key: `cmp:${w.id}`, text: `${diff}% more volume than your last ${s.title.toLowerCase()} session. Progress, in writing.` })
  }

  if (s.volume > 0) {
    const thing = pickThing(s.volume, usedThings)
    if (thing) out.push({ kind: 'thing', key: `thing:${thing[0]}`, text: `You moved ${kg(Math.round(s.volume))} today. That's about ${times(s.volume, thing)}.` })
  }

  const firsts = [...new Set(w.sets.map(x => x.exercise_id))].filter(id => m.exHistory.get(id)?.[0]?.workoutId === w.id)
  const earliest = m.chronological[0]?.id === w.id
  if (firsts.length && !earliest) out.push({ kind: 'first', key: `first:${firsts[0]}`, text: `First ${name(firsts[0])} on record. Welcome to the rota.` })

  const muscles = new Map<string, number>()
  for (const x of w.sets) {
    const mu = m.exById.get(x.exercise_id)?.muscle ?? 'other'
    muscles.set(mu, (muscles.get(mu) ?? 0) + 1)
  }
  const [focus, n] = [...muscles].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const share = Math.round((n / w.sets.length) * 100)
  if (focus && focus !== 'other' && share >= 50) out.push({ kind: 'focus', key: `focus:${focus}:${share}`, text: `${share}% of today's sets went on ${focus}. Subtle.` })

  const sameWeek = m.sessions.filter(o => o.date <= s.date && weekStart(o.date) === weekStart(s.date)).length
  if (sameWeek >= 3) out.push({ kind: 'week', key: `week:${weekStart(s.date)}:${sameWeek}`, text: `Session ${sameWeek} this week. Consistency is doing the heavy lifting.` })

  if (s.reps > 0) out.push({ kind: 'reps', key: `reps:${s.reps}`, text: `${num(s.reps)} reps logged. Every single one of them counted.` })
  out.push({ kind: 'sets', key: `sets:${w.id}`, text: `${s.sets} sets in the bank. Turning up is most of the job.` })
  return out
}

/** For a workout the model hasn't got yet (the finish screen before it uploads): the "about N hippos" line, or a plain one. */
export function workoutLine(volume: number, sets: number) {
  const thing = pickThing(volume)
  return thing ? `You moved ${kg(Math.round(volume))} today. That's about ${times(volume, thing)}.` : `${sets} sets in the bank. Turning up is most of the job.`
}

/** A unique line per session: walked oldest-first, never reusing a line and avoiding the same kind twice in a row. */
export function sessionLines(m: Model): Map<string, string> {
  const lines = new Map<string, string>()
  const used = new Set<string>()
  const usedThings = new Set<string>()
  let lastKind = ''
  const ordered = [...m.sessions].reverse()
  const lastByTitle = new Map<string, Session>()
  for (const s of ordered) {
    const list = candidates(m, s, s.workout ? lastByTitle.get(s.title.toLowerCase()) : undefined, usedThings)
    const pick = list.find(c => !used.has(c.key) && c.kind !== lastKind) ?? list.find(c => !used.has(c.key)) ?? list.at(-1)!
    used.add(pick.key)
    if (pick.kind === 'thing') usedThings.add(pick.key.slice(6))
    lastKind = pick.kind
    lines.set(s.key, pick.text)
    if (s.workout) lastByTitle.set(s.title.toLowerCase(), s)
  }
  return lines
}

/** The headline for Home / Year in Review. Rotates daily between whatever's true right now. */
export function overallLine(m: Model, sessions: Session[], runsM: number, label = 'since you started logging'): string {
  const volume = sessions.reduce((a, s) => a + s.volume, 0)
  const opts: string[] = []
  const thing = [...THINGS].reverse().find(([, , w]) => volume / w >= 1.5)
  if (thing) opts.push(`${kg(Math.round(volume))} lifted ${label}. That's ${times(volume, thing)}.`)
  const kmTotal = runsM / 1000
  const place = [...PLACES].reverse().find(([, d]) => kmTotal >= d)
  if (place) opts.push(`${num(kmTotal)} km run ${label}. London to ${place[0]} as the crow flies${kmTotal > place[1] * 1.2 ? ', and then some' : ''}.`)
  if (kmTotal >= 42.2) opts.push(`${num(kmTotal / 42.195, 1)} marathons' worth of running ${label}. In smaller, more sensible pieces.`)
  const dates = [...new Set(sessions.map(s => s.date))]
  const streak = longestWeekStreak([...dates, ...m.runs.map(r => r.date)])
  if (streak >= 3) opts.push(`Longest run of active weeks: ${streak}. Habits beat motivation every time.`)
  const pbCount = m.pbs.size
  if (pbCount) opts.push(`${num(pbCount)} PBs and counting. The log never lies.`)
  if (!opts.length) return 'Log a few sessions and this space starts talking.'
  const day = Math.abs(daysBetween('2026-01-01', new Date().toISOString().slice(0, 10)))
  return opts[day % opts.length]
}
