// Streak nudges, the Sunday recap and the monthly report. Worked out on the phone from your data: the push server only gets the time, and
// public/sw.js shows the words saved here (lib/push.tsx). Recomputed every time the data changes, so they stay true.
import { overallLine } from './motivation.ts'
import { weekCounts, weeklyTarget, weekStreak, type Model } from './stats.ts'
import { localISO, num, plural } from './format.ts'

export type Note = { kind: 'nudge' | 'recap' | 'month'; at: number; title: string; body: string }

const NUDGE_HOUR = 11 // late morning: a day left for the session (say a Sunday morning one), and time for one today
const RECAP_HOUR = 19 // Sunday evening
const MONTH_HOUR = 10 // the 1st, mid-morning

// One per week, in turn. Facts kept to things that are well established; the rest is plain encouragement.
export const LINES = [
  'Fact: muscle grows while you rest, not while you lift. Sleep counts as training.',
  'Fact: a habit takes about 66 days, on average, to feel automatic. Keep stacking weeks.',
  'Fact: the NHS suggests strength work at least twice a week, on top of 150 minutes of activity.',
  'Fact: lifting builds bone as well as muscle, and that pays off for decades.',
  "Fact: muscle you've built before comes back faster. A break isn't the end.",
  'Fact: your heart is a muscle too. Every run trains it.',
  'Consistency beats intensity. Turn up, then turn it up.',
  'A short session still counts. Twenty minutes beats zero every time.',
  "You don't need motivation. You need the next session in the diary.",
  'Nobody regrets the workout. Plenty regret skipping it.',
  "Small numbers, every week. That's how big numbers happen.",
]

/** `day` days after Monday `mon` (0 = Monday), at `hour`:00 local time. */
const on = (mon: Date, day: number, hour: number) => {
  const d = new Date(mon)
  d.setDate(d.getDate() + day)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** This week's nudge (if the streak needs one) and its Sunday recap (if it's still to come), as of `now`. */
// runs: the Runs and Strava switch (Settings → Features). Off, the recap and report leave runs out of their words.
export function reminders(m: Model, next: string | null, now = new Date(), runs = true): Note[] {
  const mon = new Date(now)
  mon.setHours(0, 0, 0, 0)
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
  const week = localISO(mon)
  const today = localISO(now)
  const dayNo = (now.getDay() + 6) % 7 // Monday 0 … Sunday 6
  const target = weeklyTarget(m.data.profile.weekly)
  const done = weekCounts(m, today).get(week) ?? 0
  const streak = weekStreak(m, m.data.profile.weekly, today).weeks // includes this week once it's hit
  const line = LINES[Math.floor(mon.getTime() / (7 * 86_400_000)) % LINES.length]
  const nextUp = next ? ` Next up: ${next}.` : ''
  const out: Note[] = []

  // Nudge: 11am on the day that still leaves one spare day for the sessions you need (one a day), so one to go means
  // Saturday 11am, with Sunday morning in hand. Already past that day: the next 11am that still leaves enough days.
  // None once the week's hit, or once it can't be.
  const need = target - done
  if (need > 0) {
    let day = Math.max(dayNo, 6 - need)
    if (on(mon, day, NUDGE_HOUR) <= now.getTime()) day++
    if (day <= 6 && need <= 7 - day) out.push({
      kind: 'nudge',
      at: on(mon, day, NUDGE_HOUR),
      title: streak ? `Keep your ${streak}-week streak going 🔥` : need === target ? 'Time for a session?' : 'Nearly there this week',
      body: `${need === 1 ? 'One more session' : `${need} more sessions`} this week ${streak ? 'keeps it alive' : `hits your target of ${target}`}.${nextUp} ${line}`,
    })
  }

  // Recap: Sunday evening, this week's numbers.
  const recapAt = on(mon, 6, RECAP_HOUR)
  if (recapAt > now.getTime()) {
    const inWeek = (d: string) => d >= week && d <= today
    const gym = m.sessions.filter(s => inWeek(s.date))
    const wr = runs ? m.runs.filter(r => inWeek(r.date)) : []
    const km = wr.reduce((a, r) => a + (r.distance_m ?? 0), 0) / 1000
    const pbs = gym.reduce((a, s) => a + (s.workout?.sets.filter(x => m.pbs.has(x.id)).length ?? 0), 0)
    const parts = [
      gym.length && plural(gym.length, 'gym session'),
      wr.length && `${plural(wr.length, 'run')}${km >= 0.1 ? ` (${num(km, 1)} km)` : ''}`,
      pbs && `${plural(pbs, 'PB')} 🏆`,
    ].filter(Boolean)
    // Every other week, a fact about your own totals ("… That's 3 double-decker buses.") instead of the general one.
    const own = overallLine(m, m.sessions, runs ? m.runs.reduce((a, r) => a + (r.distance_m ?? 0), 0) : 0)
    const extra = own.startsWith('Log a few') || Math.floor(mon.getTime() / (7 * 86_400_000)) % 2 ? line : own
    out.push(done
      ? {
          kind: 'recap', at: recapAt,
          title: `Your week: ${plural(done, 'session')}${done >= target ? ' ✅' : ''}`,
          body: `${parts.join(' · ') || plural(done, 'session')}.${streak >= 2 ? ` Streak: ${streak} weeks 🔥.` : ''} ${extra}`,
        }
      : {
          kind: 'recap', at: recapAt,
          title: 'A quiet week',
          body: `Nothing logged this week. Monday's a fresh start.${nextUp} ${line}`,
        })
  }
  out.push(monthly(m, now, runs))
  return out
}

/** The 1st of next month at 10am (today's, if it's the 1st before 10): the month just gone in numbers, against the one before. */
function monthly(m: Model, now: Date, withRuns: boolean): Note {
  const at = new Date(now.getFullYear(), now.getMonth(), 1, MONTH_HOUR)
  if (at.getTime() <= now.getTime()) at.setMonth(at.getMonth() + 1)
  const start = new Date(at.getFullYear(), at.getMonth() - 1, 1), before = new Date(at.getFullYear(), at.getMonth() - 2, 1)
  const name = start.toLocaleDateString('en-GB', { month: 'long' })
  const count = (from: Date, to: Date) => {
    const inMonth = (d: string) => d >= localISO(from) && d < localISO(to)
    const gym = m.sessions.filter(s => inMonth(s.date)), runs = withRuns ? m.runs.filter(r => inMonth(r.date)) : []
    return {
      gym: gym.length, runs: runs.length,
      km: runs.reduce((a, r) => a + (r.distance_m ?? 0), 0) / 1000,
      pbs: gym.reduce((a, s) => a + (s.workout?.sets.filter(x => m.pbs.has(x.id)).length ?? 0), 0),
    }
  }
  const now_ = count(start, at), was = count(before, start)
  const total = now_.gym + now_.runs, prev = was.gym + was.runs
  if (!total) return { kind: 'month', at: at.getTime(), title: `A quiet ${name}`, body: `Nothing logged in ${name}. New month, fresh start.` }
  const parts = [
    now_.gym && plural(now_.gym, 'gym session'),
    now_.runs && `${plural(now_.runs, 'run')}${now_.km >= 0.1 ? ` (${num(now_.km, 1)} km)` : ''}`,
    now_.pbs && `${plural(now_.pbs, 'PB')} 🏆`,
  ].filter(Boolean)
  const versus = !prev ? '' : total > prev ? ` Up from ${prev} the month before.` : total < prev ? ` ${prev} the month before.` : ' Same as the month before.'
  return { kind: 'month', at: at.getTime(), title: `Your ${name}: ${plural(total, 'session')}`, body: `${parts.join(' · ')}.${versus}` }
}
