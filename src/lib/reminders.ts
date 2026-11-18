// Streak nudges and the Sunday recap. Worked out on the phone from your data: the push server only gets the time, and
// public/sw.js shows the words saved here (lib/push.tsx). Recomputed every time the data changes, so they stay true.
import { overallLine } from './motivation.ts'
import { weekCounts, weeklyTarget, weekStreak, type Model } from './stats.ts'
import { localISO, num, plural } from './format.ts'

export type Note = { kind: 'nudge' | 'recap'; at: number; title: string; body: string }

const NUDGE_HOUR = 18 // early evening: still time to get a session in
const RECAP_HOUR = 19 // Sunday evening

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
export function reminders(m: Model, next: string | null, now = new Date()): Note[] {
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

  // Nudge: on the day that still leaves one spare day for the sessions you need (one a day), or today if you're
  // already past it. None once the week's hit, or once it can't be.
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
    const runs = m.runs.filter(r => inWeek(r.date))
    const km = runs.reduce((a, r) => a + (r.distance_m ?? 0), 0) / 1000
    const pbs = gym.reduce((a, s) => a + (s.workout?.sets.filter(x => m.pbs.has(x.id)).length ?? 0), 0)
    const parts = [
      gym.length && plural(gym.length, 'gym session'),
      runs.length && `${plural(runs.length, 'run')}${km >= 0.1 ? ` (${num(km, 1)} km)` : ''}`,
      pbs && `${plural(pbs, 'PB')} 🏆`,
    ].filter(Boolean)
    // Every other week, a fact about your own totals ("… That's 3 double-decker buses.") instead of the general one.
    const own = overallLine(m, m.sessions, m.runs.reduce((a, r) => a + (r.distance_m ?? 0), 0))
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
  return out
}
