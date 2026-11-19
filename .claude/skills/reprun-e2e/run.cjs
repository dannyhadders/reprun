// RepRun end to end: drives the phone-only build in an iPhone-shaped WebKit (or desktop Chromium), one fresh browser
// per check, screenshotting every step. Options and how to read the result are in SKILL.md next to this file.
// ponytail: one file, no test runner. A check is a function in CHECKS; add one there.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync, spawn } = require('child_process')
let pw
try { pw = require(path.join(os.homedir(), '.cache/reprun-e2e/node_modules/playwright-core')) } catch { console.error('playwright-core missing, install once (SKILL.md): npm i --prefix ~/.cache/reprun-e2e playwright-core && (cd ~/.cache/reprun-e2e && npx playwright-core install webkit chromium)'); process.exit(2) }

const REPO = path.resolve(__dirname, '../../..')
const PORT = 4317
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/$/, '')
const DEVICES = (process.env.DEVICE || 'iphone').split(',')
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const OUT = path.resolve(process.env.OUT || path.join(os.homedir(), 'reprun-e2e-runs', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))) + '/'

const TABS = [['/', 'Home'], ['/workouts', 'Workouts'], ['/exercises', 'Exercises'], ['/runs', 'Runs'], ['/year', 'Year'], ['/settings', 'Settings']]
const PLAN = 'Arm day:\nEZ-bar Curl – 3x10-12 @ 20kg, rest 75s\nTricep Pushdown – 3x12 @ 25kg, rest 60s'

// --- helpers every check uses -------------------------------------------------------------------------------------
async function begin(t, sample, open = true) {
  if (open) await t.page.goto(BASE + '/')
  await t.page.getByRole('button', { name: sample ? 'Try it with sample data first' : 'Start fresh' }).click()
  await t.page.getByRole('button', { name: 'Skip' }).click()
  await t.page.locator('dialog').getByRole('button', { name: 'Skip' }).click() // "Skip the intro?"
  await t.page.getByRole('dialog', { name: 'Welcome to RepRun' }).waitFor({ state: 'detached' })
}
const tab = async (t, route) => { await t.page.goto(BASE + route); await t.page.locator('main h1').first().waitFor() }
// The planner sheet: the bottom bar's round button on a phone, the sidebar's link on a desktop.
const planner = t => t.page.getByRole(t.device === 'iphone' ? 'button' : 'link', { name: 'Start workout', exact: true }).click()
const finish = async t => { await t.page.getByRole('button', { name: 'Finish' }).click(); await t.page.getByRole('heading', { level: 1, name: / done$/ }).waitFor() }
const topWorkout = t => t.page.getByRole('article').first()
// The PB celebration (PbMoment.tsx) comes in several styles: some play through and close, some wait for "Nice".
// Taps through whichever showed; does nothing if none did.
async function pbThrough(t) {
  const moment = t.page.getByRole('dialog', { name: /new PB/ })
  for (let i = 0; i < 6 && await moment.count(); i++) {
    const nice = moment.getByRole('button', { name: 'Nice' })
    await (await nice.isVisible() ? nice : moment).click({ timeout: 2000 }).catch(() => {})
    await t.page.waitForTimeout(300)
  }
}
// From Home: an empty workout with one exercise and one ticked set, finished. Leaves the done screen up.
async function logOneSet(t, exercise, kg, reps) {
  await planner(t)
  await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
  await t.page.getByRole('textbox', { name: 'Exercise name' }).fill(exercise)
  await t.page.getByRole('button', { name: 'Add', exact: true }).click()
  await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).fill(String(kg))
  await t.page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill(String(reps))
  await t.page.getByRole('button', { name: 'Set 1 done' }).click()
  await finish(t)
}

// --- the checks -----------------------------------------------------------------------------------------------
const CHECKS = {
  'first-run': ['First open: welcome, Start fresh, empty Home', async t => {
    await t.page.goto(BASE + '/')
    await t.expect(t.page.getByRole('button', { name: 'Start fresh' }), 'Welcome offers Start fresh')
    await t.shot('Welcome screen')
    await begin(t, false)
    await t.expect(t.page.locator('main'), 'Home renders with nothing logged')
    await t.shot('Empty Home')
  }],

  'sample-tour': ['Sample data: every tab loads, nothing wider than the screen', async t => {
    await begin(t, true)
    await t.expect(t.page.getByText('Next up'), 'Home shows the routine due next')
    for (const [route, name] of TABS) {
      await tab(t, route)
      await t.noOverflow(name)
      await t.shot(name, true)
    }
  }],

  'log-routine': ['Start the routine due next, tick sets (rest timer), finish, see it in Workouts', async t => {
    await begin(t, true)
    const routine = await t.page.locator('main h2').first().innerText() // "Next up" card's name
    await t.page.getByRole('button', { name: 'Start', exact: true }).click()
    await t.page.getByRole('button', { name: 'Finish' }).waitFor()
    await t.shot('Logger opened, exercises folded')
    await t.page.locator('button[aria-expanded]').first().click()
    await t.page.getByRole('button', { name: 'Set 1 done' }).first().click()
    await t.expect(t.page.getByRole('button', { name: 'Skip', exact: true }), 'Ticking a set starts the rest timer')
    await t.shot('Set 1 ticked, resting')
    await t.page.getByRole('button', { name: 'Skip', exact: true }).click()
    await t.page.getByRole('button', { name: 'Set 2 kg up' }).first().click()
    await t.page.getByRole('button', { name: 'Set 2 done' }).first().click()
    await t.expect(t.page.getByText(/· 2 sets ·/), 'Header counts 2 sets')
    await finish(t)
    // Set 2 went up 2.5 kg on last time's best, so finishing is a PB: the celebration comes first.
    await t.expect(t.page.getByRole('dialog', { name: '1 new PB' }), 'A PB celebration shows (set 2 beat last time)')
    await t.shot('PB celebration')
    await pbThrough(t)
    await t.shot('Summary')
    await t.page.getByRole('button', { name: 'Done' }).click()
    await t.page.waitForURL(/\/workouts/)
    await t.expect(topWorkout(t).getByRole('heading', { name: routine }), `Top of Workouts is today's ${routine}`)
    await t.expect(topWorkout(t).getByText('2 sets'), '...with 2 sets')
    await t.shot('Workouts')
  }],

  'milestones': ['The done screen lists milestones a workout unlocks, once each', async t => {
    await begin(t, false)
    await logOneSet(t, 'Bench Press', 60, 5)
    await pbThrough(t)
    const list = t.page.getByRole('list', { name: 'Milestones reached' })
    await t.expect(list.getByText('Milestone: First workout'), 'First workout unlocks')
    await t.expect(list.getByText('Milestone: First 60 kg lift'), 'First 60 kg lift unlocks (the highest step reached, not 20 to 50)')
    await t.expect(list.getByText(/First (20|30|40|50) kg lift/), 'Lower weight steps are folded into the 60 kg one', 0)
    await t.shot('Done screen with milestones')
    await t.page.getByRole('button', { name: 'Done' }).click()
    await t.page.waitForURL(/\/workouts/)
    // The same again. It may unlock something else (total-lifted ones, like "Lifted a horse in total"), never these.
    await logOneSet(t, 'Bench Press', 60, 5)
    await pbThrough(t)
    await t.expect(t.page.getByText(/Milestone: First (workout|60 kg lift)/), 'First workout and First 60 kg lift do not show again', 0)
    await t.shot('Second workout')
  }],

  'log-empty': ['Fresh copy: empty workout, add an exercise, type a set, finish; it shows up everywhere', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
    await t.page.getByRole('textbox', { name: 'Exercise name' }).fill('Bench Press')
    await t.page.getByRole('button', { name: 'Add', exact: true }).click()
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).fill('60')
    await t.page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('5')
    await t.page.getByRole('button', { name: 'Set 1 done' }).click()
    await t.shot('Typed and ticked')
    await finish(t)
    await t.page.getByRole('button', { name: 'Done' }).click()
    await t.expect(topWorkout(t).getByText('1 set'), 'Workouts lists it with 1 set')
    await tab(t, '/exercises')
    await t.page.getByRole('link', { name: /Bench Press/ }).click()
    await t.expect(t.page.getByText('60 kg').first(), 'Bench Press page shows 60 kg heaviest')
    await t.shot('Exercise page')
  }],

  'pb': ['Beating a best shows the trophy', async t => {
    await begin(t, true)
    await planner(t)
    await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
    await t.page.getByRole('textbox', { name: 'Exercise name' }).fill('Bench Press')
    await t.page.getByRole('button', { name: 'Add', exact: true }).click()
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).fill('100')
    await t.page.getByRole('spinbutton', { name: 'Set 1 reps' }).fill('5')
    await t.page.getByRole('button', { name: 'Set 1 done' }).click()
    await t.expect(t.page.getByRole('img', { name: 'PB' }), '100 kg × 5 bench gets a PB trophy')
    await t.shot('PB')
  }],

  'resume': ['A running workout survives a reload and leaving the logger', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).click()
    await t.page.locator('button[aria-expanded]').first().click()
    await t.page.getByRole('button', { name: 'Set 1 done' }).first().click()
    await t.page.reload()
    await t.expect(t.page.getByRole('button', { name: 'Set 1 done', pressed: true }).first(), 'After a reload set 1 is still ticked')
    await t.page.getByRole('link', { name: 'Back to the menu, workout keeps running' }).click()
    await t.expect(t.page.locator('a[href="/log"].animate-glow'), 'Home shows the bar back into the workout')
    await t.shot('Home with the workout bar')
    await t.page.locator('a[href="/log"].animate-glow').click()
    await t.expect(t.page.getByRole('button', { name: 'Finish' }), 'The bar opens the same workout')
  }],

  'discard': ['Discarding a workout saves nothing', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
    await t.page.getByRole('textbox', { name: 'Exercise name' }).fill('Squat')
    await t.page.getByRole('button', { name: 'Add', exact: true }).click()
    await t.page.getByRole('button', { name: 'Discard workout' }).click()
    await t.shot('Discard asks first')
    await t.page.getByRole('button', { name: 'Discard', exact: true }).click()
    await tab(t, '/workouts')
    await t.expect(t.page.getByRole('article'), 'Workouts is still empty', 0)
  }],

  'popular-lifts': ['Fresh copy: searching finds popular lifts never logged, and picking one adds it', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
    await t.page.getByRole('textbox', { name: 'Exercise name' }).fill('hip')
    const pick = t.page.getByRole('list', { name: 'Matching exercises' }).getByRole('button', { name: /^Hip Thrust/ })
    await t.expect(pick, 'Typing "hip" offers Hip Thrust on a copy with nothing logged')
    await t.shot('Popular lifts in search')
    await pick.click()
    await t.expect(t.page.getByRole('heading', { name: 'Hip Thrust' }), 'Hip Thrust is added to the workout')
  }],

  'plan-import': ['Paste a plan: preview, save, it becomes a routine', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill(PLAN)
    const name = t.page.getByRole('textbox', { name: 'Name of routine 1' })
    if (await name.inputValue() !== 'Arm day') throw new Error('Preview should name the routine Arm day')
    await t.expect(t.page.getByText('· 2 exercises'), 'Preview reads 1 day, 2 exercises')
    await t.shot('Plan preview')
    await name.fill('Big arms') // the name can be changed in the preview
    await t.page.getByRole('button', { name: 'Save 1 routine' }).click()
    await t.page.goto(BASE + '/')
    await planner(t)
    await t.expect(t.page.getByText('Big arms').first(), 'The routine is saved under the name typed in the preview')
    await t.shot('Planner with the routine')
  }],

  'plan-chatty': ['Paste a whole chatty ChatGPT reply: only the workout comes in', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill([
      "Great choice! Since you ran 10 km yesterday, here's a legs session that won't overcook you.", '',
      '**Legs:**', '', 'Warm-up: 5 minutes on the bike, then 2 sets of 10 bodyweight squats.', '',
      '1. Back Squat – 4x6 @ 100kg, rest 120s', '2. Romanian Deadlift – 3x8-10 @ 80kg', '3. Walking Lunge – 3x12', '',
      '**Why this works:**', '- If 4x6 feels easy at 100kg, go to 102.5kg next time.', '', 'Want me to make an upper body day too?',
    ].join('\n'))
    await t.expect(t.page.getByText('· 3 exercises'), 'Preview reads 1 day, 3 exercises')
    await t.expect(t.page.getByRole('button', { name: 'Save 1 routine' }), 'Only one routine to save: the tips are not a second day')
    await t.shot('Chatty reply preview')
  }],

  'intro-read': ['Intro: Next fills before it lights up; Skip asks first and Keep going stays', async t => {
    await t.page.goto(BASE + '/')
    await t.page.getByRole('button', { name: 'Start fresh' }).click()
    const intro = t.page.getByRole('dialog', { name: 'Welcome to RepRun' })
    const next = intro.getByRole('button', { name: 'Next' })
    await t.expect(next.and(t.page.locator('[disabled]')), 'Next starts dimmed on a new page')
    await t.shot('Next filling')
    await t.expect(next.and(t.page.locator(':not([disabled])')), 'Next lights up after a moment')
    await intro.getByRole('button', { name: 'Skip' }).click()
    await t.page.locator('dialog').getByRole('button', { name: 'Keep going' }).click()
    await t.expect(intro, 'Keep going stays in the intro')
  }],

  'intro-paste': ["Intro's Paste a plan: save it and land back in the intro, then Let's go", async t => {
    await t.page.goto(BASE + '/')
    await t.page.getByRole('button', { name: 'Start fresh' }).click()
    const intro = t.page.getByRole('dialog', { name: 'Welcome to RepRun' })
    const go = intro.getByRole('button', { name: "Let's go" })
    for (let i = 0; i < 12 && !(await go.isVisible()); i++) { await intro.getByRole('button', { name: 'Next' }).click(); await t.page.waitForTimeout(500) }
    await t.page.getByRole('button', { name: 'Paste a plan' }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill(PLAN)
    await t.page.getByRole('button', { name: 'Save 1 routine' }).click()
    await t.expect(go, "Back on the intro's last page after saving")
    await t.shot('Back in the intro')
    await go.click()
    await intro.waitFor({ state: 'detached' })
    await planner(t)
    await t.expect(t.page.getByText('Arm day').first(), 'The pasted routine is in the planner, and the paste box is closed')
  }],

  'timed': ['A held exercise (Plank – 2x5s): seconds box, ✓ starts the countdown, which ticks the set and starts rest', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill('Core:\nPlank – 2x5s, rest 30s')
    await t.page.getByRole('button', { name: 'Save 1 routine' }).click()
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    await t.page.locator('button[aria-expanded]').first().click()
    await t.expect(t.page.getByText('Secs', { exact: true }), 'The column says Secs, not Reps')
    await t.expect(t.page.getByRole('spinbutton', { name: 'Set 1 seconds' }), 'The box is for seconds')
    await t.page.getByRole('button', { name: 'Set 1 done' }).click()
    await t.expect(t.page.getByRole('timer', { name: 'Hold' }), 'The hold countdown starts')
    await t.shot('Holding')
    await t.expect(t.page.getByRole('button', { name: 'Set 1 done', pressed: true }), 'Its end ticks the set')
    await t.expect(t.page.getByRole('button', { name: 'Skip' }), 'and rest starts')
    await t.shot('Ticked, resting')
  }],

  'body-weight': ['Log body weight on Home', async t => {
    await begin(t, true)
    await t.page.getByRole('spinbutton', { name: 'Body weight in kg' }).fill('77.4')
    await t.page.getByRole('button', { name: 'Log', exact: true }).click()
    await t.expect(t.page.getByText('77.4 kg').first(), 'Home shows 77.4 kg')
  }],

  'backup-restore': ['Save a backup, start over, restore it: everything comes back', async t => {
    await begin(t, true)
    await tab(t, '/workouts')
    const before = await t.page.locator('main h1 + p').innerText() // "33 gym sessions, …"
    await tab(t, '/settings')
    await t.page.evaluate(() => { navigator.canShare = () => false }) // iPhone opens the share sheet; take the download path
    const [dl] = await Promise.all([t.page.waitForEvent('download'), t.page.getByRole('button', { name: 'Save a backup' }).click()])
    const file = OUT + `${t.id}-backup.json`
    await dl.saveAs(file)
    await t.expect(null, `Backup saved (${fs.statSync(file).size} bytes)`, fs.statSync(file).size > 1000)
    await t.page.getByRole('button', { name: 'Start over' }).click()
    await t.shot('Start over asks first')
    await t.page.getByRole('dialog').last().getByRole('button', { name: /Start over|Delete|Wipe/ }).click()
    await begin(t, false, false) // Start over reloads into the welcome screen by itself
    await tab(t, '/settings')
    await t.page.getByLabel('Restore from a file').setInputFiles(file)
    await t.shot('Restored message')
    await tab(t, '/workouts')
    await t.expect(t.page.locator('main h1 + p'), `Workouts back to "${before}"`, before)
    await t.shot('Restored')
  }],

  'logger-tools': ['Mid-workout: + / − Set, rest time, set note, swap an exercise', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    const first = t.page.locator('button[aria-expanded]').first()
    const name = (await first.locator('h2').innerText()).trim()
    await first.click()
    await t.page.getByRole('button', { name: '+ Set' }).first().click()
    await t.expect(first.getByText('0/4'), '+ Set makes it 4 sets')
    await t.page.getByRole('button', { name: 'Remove last set' }).first().click()
    await t.expect(first.getByText('0/3'), '− Set takes it back to 3')
    await t.page.getByRole('button', { name: /^Rest between sets: .*Change$/ }).first().click()
    await t.shot('Rest picker')
    await t.page.getByRole('button', { name: '1:30', exact: true }).click()
    await t.expect(t.page.getByRole('button', { name: /^Rest between sets: / }).first(), 'Rest is now 1:30', '1:30')
    await t.page.getByRole('button', { name: 'Add note for set 1' }).first().click()
    await t.page.getByRole('textbox', { name: 'Set 1 note' }).first().fill('wide grip')
    await t.expect(null, 'Set 1 keeps its note', (await t.page.getByRole('textbox', { name: 'Set 1 note' }).first().inputValue()) === 'wide grip')
    await t.page.getByRole('button', { name: `Swap ${name} for another exercise` }).click()
    await t.page.getByRole('textbox', { name: 'Search exercises' }).fill('Floor Press')
    await t.shot('Swap sheet')
    await t.page.getByRole('button', { name: 'Use "Floor Press"' }).click()
    await t.expect(t.page.getByRole('heading', { level: 2, name: 'Floor Press' }), `${name} swapped for Floor Press`)
    await t.expect(t.page.getByRole('heading', { level: 2, name, exact: true }), `${name} is gone from the workout`, 0)
    await t.shot('After the swap')
  }],

  'workout-edit': ['Edit a past workout (rename, drop a set), then delete it', async t => {
    await begin(t, true)
    await tab(t, '/workouts')
    const top = topWorkout(t)
    const title = await top.getByRole('heading', { level: 3 }).innerText()
    await top.getByRole('button').first().click()
    await top.getByRole('button', { name: 'Edit', exact: true }).click()
    await t.page.getByRole('textbox', { name: 'Workout name' }).fill('Edited day')
    await t.page.getByRole('button', { name: 'Remove set 1' }).first().click()
    await t.shot('Editor')
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(topWorkout(t).getByRole('heading', { level: 3, name: 'Edited day' }), `"${title}" renamed to Edited day`)
    await t.expect(topWorkout(t).getByText('14 sets'), 'with one set fewer (14)')
    await topWorkout(t).getByRole('button', { name: 'Edit', exact: true }).click()
    await t.page.getByRole('button', { name: 'Delete workout' }).click()
    await t.page.getByRole('dialog').last().getByRole('button', { name: /Delete/ }).click()
    await t.expect(t.page.getByRole('heading', { level: 3, name: 'Edited day' }), 'It is gone from Workouts', 0)
  }],

  'exercise-edit': ['Rename an exercise; its history follows', async t => {
    await begin(t, true)
    await tab(t, '/exercises')
    await t.page.getByRole('textbox', { name: 'Search exercises' }).fill('bench')
    await t.page.getByRole('link', { name: /^BE Bench Press/ }).click()
    const sessions = (await t.page.getByText(/\d+ sessions/).first().innerText()).match(/\d+ sessions/)[0]
    await t.page.getByRole('button', { name: 'Edit' }).click()
    await t.page.getByLabel('Name', { exact: true }).filter({ visible: true }).fill('Flat Bench')
    await t.shot('Exercise editor')
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(t.page.getByRole('heading', { level: 1, name: 'Flat Bench' }), 'The page is now Flat Bench')
    await t.expect(t.page.getByText(sessions).first(), `with its ${sessions}`)
  }],

  'run-delete': ['Delete a run', async t => {
    await begin(t, true)
    await tab(t, '/runs')
    const del = t.page.getByRole('button', { name: /^Delete / })
    const before = await del.count()
    await del.first().click()
    await t.shot('Delete asks first')
    await t.page.getByRole('dialog').last().getByRole('button', { name: 'Delete', exact: true }).click()
    await t.expect(del, `One run fewer (${before - 1})`, before - 1)
  }],

  'settings-profile': ['Profile saves and survives a reload; the intro can be shown again', async t => {
    await begin(t, true)
    await tab(t, '/settings')
    await t.page.getByRole('spinbutton', { name: 'Age' }).fill('41')
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(t.page.getByText('Saved', { exact: true }), 'It says Saved')
    await t.page.reload()
    await t.expect(null, 'Age is still 41 after a reload', (await t.page.getByRole('spinbutton', { name: 'Age' }).inputValue()) === '41')
    await t.page.getByRole('button', { name: 'Show the intro again' }).click()
    await t.expect(t.page.getByRole('dialog', { name: 'Welcome to RepRun' }), 'The intro opens again')
    await t.shot('Intro again')
  }],

  'offline': ['Opened once, the app still opens with no signal', async t => {
    await begin(t, true)
    await t.page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await t.page.reload() // the service worker controls the page from here, and caches what it loads
    await t.page.locator('main h1').first().waitFor()
    t.offline = true // offline, failed font and network requests are expected; only what's on screen counts
    await t.ctx.setOffline(true)
    await t.page.reload()
    await t.expect(t.page.locator('main h1').first(), 'Home opens offline')
    await tab(t, '/workouts')
    await t.expect(t.page.getByRole('article').first(), 'Workouts lists the history offline')
    await t.shot('Offline')
  }],
}

// --- runner -------------------------------------------------------------------------------------------------------
async function run(id, device, browser) {
  const [title, fn] = CHECKS[id]
  const ctx = await browser.newContext(device === 'iphone' ? { ...pw.devices['iPhone 15'] } : { viewport: { width: 1280, height: 900 } })
  // Behave like the installed home-screen app (no "add to home screen" page), which is how it's used.
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => !t.offline && errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !t.offline && errors.push(m.text()))
  page.setDefaultTimeout(8000)
  const res = { id, title, device, steps: [], status: 'PASS' }
  let n = 0
  const t = {
    id: `${id}-${device}`, page, ctx, device,
    async shot(label, full = false) {
      const shot = `${id}-${device}-${String(++n).padStart(2, '0')}.png`
      await page.waitForTimeout(400) // let an opening card or sheet settle: a half-open frame reads as a layout bug
      await page.screenshot({ path: OUT + shot, fullPage: full, animations: 'disabled' }).catch(() => {})
      res.steps.push({ step: label, ok: true, shot })
    },
    // locator visible, or (count) exactly that many, or (string) has that text; locator null: a plain boolean.
    async expect(loc, label, want) {
      let ok
      if (loc === null) ok = !!want
      else if (typeof want === 'number') { // the list may still be refreshing: give it the usual 8 seconds
        for (let i = 0; i < 16 && !(ok = (await loc.count()) === want); i++) await page.waitForTimeout(500)
      }
      else if (typeof want === 'string') ok = await loc.filter({ hasText: want }).waitFor().then(() => true, () => false)
      else ok = await loc.waitFor().then(() => true, () => false)
      res.steps.push({ step: label, ok })
      if (!ok) throw new Error(`Expected: ${label}`)
    },
    async noOverflow(name) {
      const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      res.steps.push({ step: `${name}: no sideways scroll`, ok: w <= 0, note: w > 0 ? `${w}px too wide` : undefined })
      if (w > 0) res.status = 'FAIL'
    },
  }
  try {
    await fn(t)
  } catch (e) {
    res.status = 'FAIL'
    res.error = e.message.split('\n')[0]
    const shot = `${id}-${device}-FAIL.png`
    await page.screenshot({ path: OUT + shot }).catch(() => {})
    res.steps.push({ step: `Broke: ${res.error}`, ok: false, shot })
  }
  if (errors.length) { res.status = 'FAIL'; res.errors = errors; res.steps.push({ step: `Page errors: ${errors.join(' | ')}`, ok: false }) }
  await ctx.close()
  return res
}

;(async () => {
  const unknown = (ONLY ?? []).filter(id => !CHECKS[id])
  if (unknown.length) { console.error(`Unknown check(s): ${unknown}. Known: ${Object.keys(CHECKS)}`); process.exit(2) }
  const badDevice = DEVICES.filter(d => !['iphone', 'desktop'].includes(d))
  if (badDevice.length) { console.error('DEVICE is iphone, desktop or iphone,desktop'); process.exit(2) }
  // No BASE: build the phone-only copy of the working tree into its own folder (never dist/, which other sessions
  // rebuild under you) and serve it for this run only.
  let server
  if (!process.env.BASE) {
    const env = { ...process.env, CLOUDFLARE_ENV: 'local' }
    execSync('npx vite build --outDir node_modules/.reprun-e2e', { cwd: REPO, env, stdio: 'ignore' })
    server = spawn('npx', ['vite', 'preview', '--outDir', 'node_modules/.reprun-e2e', '--port', String(PORT), '--strictPort'], { cwd: REPO, env, stdio: 'ignore', detached: true })
    process.on('exit', () => { try { process.kill(-server.pid) } catch {} })
    for (let i = 0; i < 60 && !(await fetch(BASE + '/').then(r => r.ok, () => false)); i++) await new Promise(r => setTimeout(r, 500))
  }
  const up = await fetch(BASE + '/').then(r => r.ok, () => false)
  if (!up) { console.error(`Nothing answering at ${BASE}${server ? ` (is port ${PORT} taken?)` : ''}`); process.exit(2) }
  fs.mkdirSync(OUT, { recursive: true })
  const results = []
  for (const device of DEVICES) {
    const browser = await (device === 'iphone' ? pw.webkit : pw.chromium).launch()
    for (const id of ONLY ?? Object.keys(CHECKS)) {
      const r = await run(id, device, browser)
      results.push(r)
      console.log(`${r.status.padEnd(4)}  ${device.padEnd(7)}  ${id.padEnd(15)} ${r.error ?? ''}${r.errors ? ` [${r.errors.length} page error(s)]` : ''}`)
    }
    await browser.close()
  }
  fs.writeFileSync(OUT + 'results.json', JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2))
  const failed = results.filter(r => r.status !== 'PASS').length
  console.log(`\n${results.length - failed}/${results.length} passed. Screenshots and results.json: ${OUT}`)
  process.exit(failed ? 1 : 0)
})()
