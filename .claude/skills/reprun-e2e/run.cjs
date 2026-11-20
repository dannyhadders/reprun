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
// E2E_PORT=4327 (any free port) for a second run alongside another session's: its own port and build folder, so they can't clash.
const PORT = +process.env.E2E_PORT || 4317
const BUILD = PORT === 4317 ? 'node_modules/.reprun-e2e' : `node_modules/.reprun-e2e-${PORT}`
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/$/, '')
const DEVICES = (process.env.DEVICE || 'iphone').split(',')
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const OUT = path.resolve(process.env.OUT || path.join(os.homedir(), 'reprun-e2e-runs', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))) + '/'

const TABS = [['/', 'Home'], ['/workouts', 'Workouts'], ['/exercises', 'Exercises'], ['/runs', 'Runs'], ['/year', 'Year'], ['/settings', 'Settings']]
const PLAN = 'Arm day:\nEZ-bar Curl – 3x10-12 @ 20kg, rest 75s\nTricep Pushdown – 3x12 @ 25kg, rest 60s'

// --- helpers every check uses -------------------------------------------------------------------------------------
// Settings is a list: open it, then the row's own page.
async function settings(t, row) {
  await tab(t, '/settings')
  await t.page.getByRole('link', { name: new RegExp(`^${row}`) }).first().click()
  await t.page.getByRole('heading', { name: row, exact: true }).waitFor()
}
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
// Taps through whichever showed (or the no-PB "done" card); does nothing if none did.
async function pbThrough(t) {
  // No PB: a "Smashed it" card shows for ~2 s instead. Tap it away.
  await t.page.getByRole('status', { name: 'Workout done' }).click({ timeout: 1500 }).catch(() => {})
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

  'button-contrast': ['Main button: white text on the deeper indigo reads at 4.5:1 or better', async t => {
    await t.page.goto(BASE + '/')
    const [ratio, fg, bgc] = await t.page.getByRole('button', { name: 'Start fresh' }).evaluate(async el => {
      // mid-fade it reads 1.45:1. Only animations that end: the welcome screen's glow loops forever and would hang this.
      await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
      const s = getComputedStyle(el)
      const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      const [x, y] = [lum(s.color), lum(s.backgroundColor)].sort((a, b) => b - a)
      return [(x + 0.05) / (y + 0.05), s.color, s.backgroundColor]
    })
    await t.expect(null, `Start fresh contrast is ${ratio.toFixed(2)}:1 (${fg} on ${bgc})`, ratio >= 4.5)
    // The Strava buttons only show with Strava set up (never in this build), so check their fill colour itself.
    const strava = await t.page.evaluate(() => {
      const el = Object.assign(document.createElement('b'), { style: 'background: var(--color-strava-deep)' })
      document.body.append(el)
      const [r, g, b] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      el.remove()
      return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05)
    })
    await t.expect(null, `White on the Strava buttons' orange is ${strava.toFixed(2)}:1`, strava >= 4.5)
  }],

  'light-theme': ['Appearance: Light turns the app light, survives a reload, and Dark turns it back', async t => {
    await begin(t, true) // sample data, so Home's charts show in light
    await tab(t, '/settings')
    const bg = () => t.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const dark = await bg()
    await t.page.getByRole('button', { name: 'Light', exact: true }).click()
    await t.expect(null, `Light: the page turns light (${await bg()})`, (await bg()) === 'rgb(245, 246, 250)')
    await t.shot('Settings in light')
    await t.page.reload()
    await t.expect(null, 'Light is kept after a reload', (await bg()) === 'rgb(245, 246, 250)')
    await tab(t, '/')
    await t.shot('Home in light')
    await tab(t, '/settings')
    await t.page.getByRole('button', { name: 'Dark', exact: true }).click()
    await t.expect(null, 'Dark: back to how it was', (await bg()) === dark)
  }],

  'update-check': ['Self-update: index.html carries the build for the open app to compare, and a plain open shows no update pop-up', async t => {
    await begin(t, false)
    await t.expect(null, 'index.html says which build it is', await t.page.locator('meta[name="reprun-build"]').count() === 1)
    await t.page.waitForTimeout(6000) // past the 5 s retry, which once fired on the first install's passing worker
    if (await t.page.getByRole('alertdialog').count()) throw new Error('An update pop-up showed with no new version')
    await tab(t, '/settings')
    await t.page.getByRole('button', { name: 'Check for updates' }).click()
    await t.expect(t.page.getByRole('status').filter({ hasText: "You're on the latest" }), 'Check for updates: on the latest')
    await t.shot('Settings: Check for updates', true)
  }],

  'crash-screen': ['A crash while drawing shows Something went wrong with Reload, not a blank screen, and Reload recovers', async t => {
    await begin(t, false)
    const good = await t.page.evaluate(() => localStorage.getItem('reprun.local'))
    await t.page.evaluate(() => localStorage.setItem('reprun.local', JSON.stringify({ profile: null }))) // loads fine, but nothing can draw without a profile
    t.crashing = true
    await t.page.reload()
    await t.expect(t.page.getByText('Something went wrong'), 'The crash screen shows instead of a blank page')
    await t.expect(null, 'Phone-only: no Reload from the server (it would have nothing to reload from)', await t.page.getByRole('button', { name: 'Reload from the server' }).count() === 0)
    await t.shot('Crash screen')
    await t.page.evaluate(v => localStorage.setItem('reprun.local', v), good)
    await t.page.getByRole('button', { name: 'Reload' }).click()
    await t.expect(t.page.locator('main'), 'Reload opens the app again')
    t.crashing = false
  }],

  'settings-list': ['Settings is a grouped list: rows show their status and open their own page, Back returns', async t => {
    await begin(t, true)
    await tab(t, '/settings')
    await t.expect(t.page.getByRole('link', { name: /^Backup/ }), 'Backup row shows it has never been saved', 'Not saved yet')
    await t.noOverflow('Settings list')
    await t.shot('Settings list')
    await settings(t, 'Body weight')
    await t.shot('Body weight page')
    await t.page.getByRole('link', { name: 'Settings' }).first().click()
    await t.expect(t.page.getByRole('link', { name: /^Profile/ }), 'Back to the list')
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

  'small-phone': ['A 360px phone: Home\'s stat cards show their numbers in full', async t => {
    await t.page.setViewportSize({ width: 360, height: 780 })
    await begin(t, true)
    await t.page.locator('main h1').first().waitFor()
    await t.page.waitForTimeout(1500) // the numbers count up first
    const cut = await t.page.evaluate(() => [...document.querySelectorAll('main .grid .truncate')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent))
    await t.expect(null, `No stat cut off${cut.length ? ` (cut: ${cut.join(', ')})` : ''}`, cut.length === 0)
    await t.shot('Home at 360px')
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
    const list = t.page.getByRole('list', { name: 'Highlights' })
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

  'build-routine': ['DIY routine: chips and search, edit a row, reorder, Done names it; start it; edit it', async t => {
    await begin(t, true)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.expect(t.page.getByRole('heading', { name: "What's in it?" }), 'Opens on DIY')
    // "What are you working on?" narrows the chips.
    await t.page.getByRole('button', { name: 'legs', exact: true }).click()
    await t.expect(t.page.getByText('Popular for legs'), 'Picking legs shows popular leg lifts')
    await t.shot('DIY: what are you working on', true)
    const chipBtn = t.page.getByRole('button', { name: /^Add (?!Squat)/ }).first() // whichever leg lift shows first
    const first = (await chipBtn.getAttribute('aria-label')).slice(4)
    await chipBtn.click()
    const search = t.page.getByRole('textbox', { name: 'Add an exercise' })
    await search.fill('squat')
    await t.page.getByRole('list', { name: 'Matching exercises' }).getByRole('button', { name: /^Squat/ }).first().click()
    await search.fill('Sled Push') // a name of your own
    await t.page.getByRole('button', { name: 'Add', exact: true }).click()
    await t.expect(t.page.locator('[data-sort]'), 'Three rows in the table', 3)
    await t.expect(t.page.getByText(/In this routine · 3 exercises · 9 sets · ~\d+ min/), 'Totals and a rough time on screen')
    // Tap a row to open its card.
    await t.page.getByRole('button', { name: /^Squat/, expanded: false }).click()
    await t.page.getByRole('spinbutton', { name: 'Squat sets' }).fill('') // clear and retype: no "1" sneaking back
    await t.page.getByRole('spinbutton', { name: 'Squat sets' }).fill('3')
    await t.page.getByRole('button', { name: 'Squat sets up' }).click()
    await t.page.getByRole('textbox', { name: 'Squat reps' }).fill('lots')
    await t.page.getByRole('button', { name: /^Done · / }).click()
    await t.expect(t.page.getByRole('alert'), 'Bad reps get a plain-words message, not a broken routine', 'Squat: reps should look like')
    await t.page.getByRole('textbox', { name: 'Squat reps' }).fill('5')
    await t.expect(t.page.getByRole('alert'), 'Fixing it clears the message', 0)
    await t.page.getByRole('button', { name: /^Sled Push/ }).click()
    await t.page.getByRole('button', { name: 'Remove Sled Push' }).click()
    await t.page.getByRole('button', { name: 'Move Squat: drag, or use the arrow keys' }).focus()
    await t.page.keyboard.press('ArrowUp') // Squat first
    await t.shot('DIY routine, Squat open', true)
    await t.page.getByRole('button', { name: /^Done · / }).click()
    await t.page.getByRole('textbox', { name: 'Routine name' }).fill('Garage legs')
    await t.shot('Name it')
    await t.page.getByRole('button', { name: 'Save routine', exact: true }).click()
    const row = t.page.locator('li').filter({ hasText: 'Garage legs' })
    await t.expect(row.getByText(/· 2 exercises ·/), 'Garage legs is on Start a workout with 2 exercises')
    await row.getByRole('button', { name: 'Start', exact: true }).click()
    await t.page.getByRole('button', { name: 'Finish' }).waitFor()
    const names = await t.page.locator('section[data-ex] h2').allInnerTexts()
    if (names.join() !== `Squat,${first}`) throw new Error(`Starts in the built order, got: ${names}`)
    await t.page.getByRole('button', { name: 'Discard workout' }).click()
    await t.page.getByRole('button', { name: 'Discard', exact: true }).click()
    // Edit it again (Discard lands back on Start a workout): the rows come back as saved.
    await t.page.getByRole('button', { name: 'Edit Garage legs' }).click()
    await t.page.getByRole('button', { name: /^Squat/, expanded: false }).click()
    if (await t.page.getByRole('textbox', { name: 'Squat reps' }).inputValue() !== '5') throw new Error('Squat reps come back as 5')
    if (await t.page.getByRole('spinbutton', { name: 'Squat sets' }).inputValue() !== '4') throw new Error('Squat sets come back as 4')
    await t.page.getByRole('button', { name: /^Done · / }).click()
    await t.page.getByRole('textbox', { name: 'Routine name' }).fill('Garage legs B')
    await t.page.getByRole('button', { name: 'Save routine', exact: true }).click()
    await t.expect(t.page.locator('li').filter({ hasText: /^Garage legs B/ }).getByRole('button', { name: 'Start', exact: true }), 'Renamed in place', 1)
    await t.expect(t.page.locator('li').filter({ hasText: /^Garage legs(?! B)/ }), 'No copy left under the old name', 0)
  }],

  'paste-tweak': ['AI or paste: Paste from clipboard, the preview, Tweak before saving opens it in DIY', async t => {
    await begin(t, true)
    await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('button', { name: 'AI or paste', exact: true }).click()
    await t.page.evaluate(plan => navigator.clipboard.writeText(plan), PLAN).catch(() => {})
    await t.page.getByRole('button', { name: 'Paste from clipboard' }).click()
    // WebKit may refuse to read the clipboard in tests: then it opens the text box, as on a phone that says no. Wait
    // for whichever happens, then fill the box if that's what came up.
    const found = t.page.getByText(/Found 1 day · 2 exercises/), box = t.page.getByRole('textbox', { name: 'Plan text' })
    await found.or(box).first().waitFor()
    if (await box.isVisible()) await box.fill(PLAN)
    await t.expect(t.page.getByText(/Found 1 day · 2 exercises/), 'Found 1 day · 2 exercises')
    await t.shot('AI or paste: the preview')
    await t.page.getByRole('button', { name: 'Tweak before saving' }).click()
    await t.expect(t.page.getByRole('heading', { name: "What's in it?" }), 'Tweak opens DIY')
    await t.expect(t.page.locator('[data-sort]'), 'With the pasted exercises as rows', 2)
    await t.page.getByRole('button', { name: /^Done · / }).click()
    if (await t.page.getByRole('textbox', { name: 'Routine name' }).inputValue() !== 'Arm day') throw new Error('The pasted name comes along')
  }],

  'plan-import': ['Paste a plan: preview, save, it becomes a routine', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('button', { name: 'AI or paste', exact: true }).click() // the screen opens on DIY
    await t.page.getByRole('button', { name: 'Type it yourself' }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill(PLAN)
    const name = t.page.getByRole('textbox', { name: 'Name of routine 1' })
    if (await name.inputValue() !== 'Arm day') throw new Error('Preview should name the routine Arm day')
    await t.expect(t.page.locator('section h2').getByText('· 2 exercises'), 'Preview reads 1 day, 2 exercises')
    await t.shot('Plan preview')
    await name.fill('Big arms') // the name can be changed in the preview
    await t.page.getByRole('button', { name: 'Save 1 routine' }).click()
    await t.page.goto(BASE + '/')
    await planner(t)
    await t.expect(t.page.getByText('Big arms').first(), 'The routine is saved under the name typed in the preview')
    await t.shot('Planner with the routine')
  }],

  'plates': ['Plate calculator: the line under the current barbell set, its sheet, and the bar remembered', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    const first = t.page.locator('button[aria-expanded]').first()
    const name = (await first.locator('h2').innerText()).trim()
    await first.click()
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).first().fill('100')
    await t.expect(t.page.getByRole('button', { name: /^Plates for 100 kg: 25 \+ 15 each side, 20 kg bar/ }), `${name}: 100 kg is 25 + 15 a side on a 20 kg bar`)
    await t.shot('Plate line')
    await t.page.getByRole('button', { name: /^Plates for 100 kg/ }).click()
    await t.expect(t.page.getByRole('dialog', { name: `Plates for ${name}` }), 'Tapping it opens the plate sheet')
    await t.page.getByRole('button', { name: '15 kg', exact: true }).click()
    await t.expect(t.page.getByText('25 + 2.5 + 15 each side').or(t.page.getByText('25 + 15 + 2.5 each side')).first(), 'On a 15 kg bar it works the plates out again')
    await t.shot('Plate sheet, 15 kg bar')
    await t.page.keyboard.press('Escape')
    await t.expect(t.page.getByRole('button', { name: /^Plates for 100 kg: .*15 kg bar/ }), 'The 15 kg bar is remembered for this exercise')
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).first().fill('101')
    await t.expect(t.page.getByRole('button', { name: /can't be loaded exactly: 100 or 102\.5/ }), '101 kg on a 15 kg bar: nearest 100 or 102.5')
  }],

  'last-note': ['"Last time you wrote": a workout note shows at the top next time, and hides with ✕', async t => {
    await begin(t, true)
    const routine = await t.page.locator('main h2').first().innerText()
    await t.page.getByRole('button', { name: 'Start', exact: true }).click()
    await t.page.locator('button[aria-expanded]').first().click()
    await t.page.getByRole('button', { name: 'Set 1 done' }).first().click()
    await t.page.getByRole('textbox', { name: 'Workout notes' }).fill('Go lighter on incline')
    await finish(t)
    await pbThrough(t)
    await t.page.getByRole('button', { name: 'Done' }).click()
    await t.page.goto(BASE + '/')
    await planner(t)
    await t.page.getByRole('button', { name: /^Start an empty workout/ }).click()
    await t.page.getByRole('textbox', { name: 'Workout name' }).fill(routine)
    await t.expect(t.page.getByText('Go lighter on incline'), `Starting ${routine} again shows last time's note`)
    await t.shot('Last time you wrote')
    await t.page.getByRole('button', { name: "Hide last time's note" }).click()
    await t.expect(t.page.getByText('Go lighter on incline'), '✕ hides it', 0)
  }],

  'setup-note': ['Setup note: add one in the logger, it shows on the exercise page too, edit and clear it', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    const first = t.page.locator('button[aria-expanded]').first()
    const name = (await first.locator('h2').innerText()).trim()
    await first.click()
    await t.page.getByRole('button', { name: 'Add setup note (stays every time)' }).first().click()
    await t.page.getByRole('textbox', { name: `Setup note for ${name}` }).fill('Seat 4 · grip on the rings')
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(t.page.getByText('Seat 4 · grip on the rings').first(), `${name} shows its setup note`)
    await t.shot('Setup note in the logger')
    await t.page.goto(BASE + '/exercises')
    await t.page.getByRole('link').filter({ hasText: name }).first().click() // a row's name starts with its initials
    await t.expect(t.page.getByText('Seat 4 · grip on the rings').first(), 'The exercise page shows it too')
    await t.page.getByRole('button', { name: `Edit the setup note for ${name}` }).click()
    await t.page.getByRole('button', { name: 'Clear', exact: true }).click()
    await t.expect(t.page.getByRole('button', { name: 'Add setup note (stays every time)' }), 'Clear takes it away')
  }],

  'warmup': ['Warm-ups: + Warm-up adds a ramp, a ticked one rests 60 s, a set can be made a warm-up, Remove warm-up, saved as W', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    const first = t.page.locator('button[aria-expanded]').first()
    await first.click()
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).first().fill('100')
    await t.page.getByRole('button', { name: /^Add 4 warm-up sets up to 100 kg/ }).click()
    for (const [n, w] of [[1, '20'], [2, '50'], [3, '70'], [4, '85']]) await t.expect(null, `Warm-up ${n} is ${w} kg`, (await t.page.getByRole('spinbutton', { name: `Warm-up ${n} kg` }).inputValue()) === w)
    await t.shot('Warm-up sets added')
    await t.page.getByRole('button', { name: 'Warm-up 1 done' }).click()
    await t.expect(t.page.getByText(/^(1:00|0:59|0:58)$/).first(), 'A ticked warm-up rests 60 s')
    await t.page.getByRole('button', { name: 'Skip', exact: true }).click()
    await t.page.getByRole('button', { name: 'Set 1: note or warm-up' }).first().click()
    await t.page.getByRole('button', { name: 'Make it a warm-up' }).click()
    await t.expect(t.page.getByRole('spinbutton', { name: 'Warm-up 5 kg' }), 'Set 1 is now warm-up 5')
    await t.page.getByRole('button', { name: 'Remove warm-up' }).click()
    await t.expect(t.page.getByRole('spinbutton', { name: /^Warm-up \d kg$/ }), 'Remove warm-up keeps only the ticked one', 1)
    await t.page.getByRole('button', { name: 'Set 1 done' }).first().click()
    await finish(t)
    await pbThrough(t)
    await t.page.getByRole('button', { name: 'Done' }).click()
    await topWorkout(t).click()
    await t.expect(topWorkout(t).getByTitle('Warm-up').first(), 'Workouts lists the warm-up as W')
    await t.shot('Workout with a warm-up')
  }],

  'plan-lb': ['A pasted plan in lb: "@ 220lb" comes in as 99.8 kg', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('button', { name: 'AI or paste', exact: true }).click()
    await t.page.getByRole('button', { name: 'Type it yourself' }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill('Leg day:\nHack Squat – 3x10 @ 220lb, rest 90s')
    await t.expect(t.page.getByText(/99\.8 kg/).first(), 'Preview shows 220 lb as 99.8 kg (default unit)')
    await t.shot('Plan in lb, previewed in kg')
  }],

  'plan-chatty': ['Paste a whole chatty ChatGPT reply: only the workout comes in', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: /^\+ Import/ }).click()
    await t.page.getByRole('button', { name: 'AI or paste', exact: true }).click() // the screen opens on DIY
    await t.page.getByRole('button', { name: 'Type it yourself' }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill([
      "Great choice! Since you ran 10 km yesterday, here's a legs session that won't overcook you.", '',
      '**Legs:**', '', 'Warm-up: 5 minutes on the bike, then 2 sets of 10 bodyweight squats.', '',
      '1. Back Squat – 4x6 @ 100kg, rest 120s', '2. Romanian Deadlift – 3x8-10 @ 80kg', '3. Walking Lunge – 3x12', '',
      '**Why this works:**', '- If 4x6 feels easy at 100kg, go to 102.5kg next time.', '', 'Want me to make an upper body day too?',
    ].join('\n'))
    await t.expect(t.page.locator('section h2').getByText('· 3 exercises'), 'Preview reads 1 day, 3 exercises')
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
    await t.page.getByRole('button', { name: 'AI or paste', exact: true }).click() // the screen opens on DIY
    await t.page.getByRole('button', { name: 'Type it yourself' }).click()
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

  'lb-everywhere': ['lb as the default: body weight on Home and in Settings, and a past workout added in lb', async t => {
    await begin(t, true)
    await settings(t, 'Profile')
    const kgVal = +(await t.page.getByRole('spinbutton', { name: 'Body weight (kg)' }).inputValue())
    await t.page.getByRole('group', { name: 'Weights in' }).getByRole('button', { name: 'lb' }).click()
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(t.page.getByText('Saved', { exact: true }), 'lb saved as the default')
    const lbBox = t.page.getByRole('spinbutton', { name: 'Body weight (lb)' })
    const want = String(Math.round(kgVal * 2.20462 * 10) / 10)
    await t.expect(null, `Profile's body weight converts: ${kgVal} kg shows as ${want} lb`, (await lbBox.inputValue()) === want)
    await t.page.getByRole('button', { name: 'Save', exact: true }).click() // saving again must not shrink it
    await t.page.reload()
    await t.expect(null, 'Saved twice, it is still the same weight', (await t.page.getByRole('spinbutton', { name: 'Body weight (lb)' }).inputValue()) === want)
    await t.page.goto(BASE + '/')
    await t.page.getByRole('spinbutton', { name: 'Body weight in lb' }).fill('180')
    await t.page.getByRole('button', { name: 'Log', exact: true }).click()
    await t.expect(t.page.getByText('180 lb').first(), 'Home shows 180 lb')
    if (t.device === 'iphone') await t.page.getByRole('button', { name: 'More', exact: true }).click() // on a phone it's in the More sheet
    await t.page.getByRole('button', { name: 'Log a workout' }).filter({ visible: true }).first().click()
    const form = t.page.locator('dialog[open]') // the sidebar has its own copy for desktop
    await form.getByRole('combobox', { name: 'Exercise' }).or(form.getByRole('textbox', { name: 'Exercise' })).first().fill('Squat')
    await form.getByRole('spinbutton', { name: 'Reps' }).fill('5')
    await form.getByRole('spinbutton', { name: 'Weight in lb' }).fill('225')
    await t.shot('Add past workout in lb')
    await form.getByRole('button', { name: 'Save', exact: true }).click()
    await tab(t, '/workouts')
    await t.expect(t.page.getByText(/225 lb/).first(), 'Workouts shows 225 lb, not 225 kg')
  }],

  'backup-restore': ['Save a backup, start over, restore it: everything comes back', async t => {
    await begin(t, true)
    await tab(t, '/workouts')
    const before = await t.page.locator('main h1 + p').innerText() // "33 gym sessions, …"
    await settings(t, 'Backup')
    await t.page.evaluate(() => { navigator.canShare = () => false }) // iPhone opens the share sheet; take the download path
    const [dl] = await Promise.all([t.page.waitForEvent('download'), t.page.getByRole('button', { name: 'Save a backup' }).click()])
    const file = OUT + `${t.id}-backup.json`
    await dl.saveAs(file)
    await t.expect(null, `Backup saved (${fs.statSync(file).size} bytes)`, fs.statSync(file).size > 1000)
    await settings(t, 'This phone')
    await t.page.getByRole('button', { name: 'Start over' }).click()
    await t.shot('Start over asks first')
    await t.page.getByRole('dialog').last().getByRole('button', { name: /Start over|Delete|Wipe/ }).click()
    await begin(t, false, false) // Start over reloads into the welcome screen by itself
    await settings(t, 'Backup')
    await t.page.getByLabel('Restore from a file').setInputFiles(file)
    await t.shot('Restored message')
    await tab(t, '/workouts')
    await t.expect(t.page.locator('main h1 + p'), `Workouts back to "${before}"`, before)
    await t.shot('Restored')
  }],

  'save-routine': ['Finish screen: a new workout can be saved as a routine; that routine\'s own workout can\'t', async t => {
    await begin(t, true)
    await logOneSet(t, 'Hip Thrust', 80, 10)
    // A first Hip Thrust is the baseline, not a PB: the "done" card shows instead of the PB moment.
    await t.expect(t.page.getByRole('status', { name: 'Workout done' }), 'No PB: a big tick and a few words first')
    await t.shot('Done card (no PB)')
    await pbThrough(t)
    await t.expect(t.page.getByRole('status', { name: 'Workout done' }), 'A tap clears it', 0)
    const save = t.page.getByRole('button', { name: /^Save ".+" as a routine$/ })
    await t.expect(save, 'A new workout offers Save as a routine')
    const name = (await save.getAttribute('aria-label')).match(/"(.+)"/)[1] // untitled: "Thursday workout"
    await save.click()
    await t.expect(t.page.getByRole('button', { name: 'Saved as a routine ✓' }), 'It says Saved')
    await t.shot('Saved as a routine')
    await t.page.getByRole('button', { name: 'Done' }).click()
    await planner(t)
    const row = t.page.locator('li').filter({ hasText: name })
    await t.expect(row.getByText(/· 1 exercise ·/), `"${name}" is on Start a workout, with its one exercise`)
    // Do that routine: same exercises as a routine now, so no button.
    await row.getByRole('button', { name: 'Start', exact: true }).click()
    await t.expect(t.page.locator('section[data-ex] h2'), 'It starts with Hip Thrust', 'Hip Thrust')
    await t.page.locator('section[data-ex] button[aria-expanded]').first().click()
    await t.page.getByRole('button', { name: 'Set 1 done' }).first().click()
    await finish(t)
    await pbThrough(t)
    await t.expect(t.page.getByRole('button', { name: /as a routine/ }), 'The saved routine\'s own workout has no Save as a routine', 0)
  }],

  'share-looks': ['Finish screen: the picture is the page, four looks to swipe through, Share saves the one on screen', async t => {
    await begin(t, true)
    await logOneSet(t, 'Bench Press', 100, 5)
    await pbThrough(t)
    await t.page.evaluate(() => { navigator.canShare = () => false }) // iPhone opens the share sheet; take the download path
    await t.expect(t.page.locator('figure img'), 'Four looks on the finish screen', 4)
    await t.expect(t.page.getByRole('list', { name: 'Highlights' }).getByText('PB: Bench Press'), 'Highlights list the PB under the picture')
    await t.shot('Finish screen', true)
    const styles = t.page.getByRole('tablist', { name: 'Picture style' })
    for (const look of ['Full', 'Bold', 'Story', 'Sticker']) {
      await styles.getByRole('tab', { name: look }).click()
      await t.expect(styles.getByRole('tab', { name: look, selected: true }), `${look} is the one on screen`)
      const [dl] = await Promise.all([t.page.waitForEvent('download'), t.page.getByRole('button', { name: 'Share as a picture' }).click()])
      const file = OUT + `${t.id}-${look.toLowerCase()}.png`
      await dl.saveAs(file)
      await t.expect(null, `${look} saves a picture (${Math.round(fs.statSync(file).size / 1024)} KB)`, fs.statSync(file).size > 10_000)
    }
    await t.shot('Finish screen on Sticker')
  }],

  'reorder': ['Mid-workout: drag an exercise by its ☰ (or arrow keys), the order sticks; a finished one has no ☰', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).click()
    await t.page.getByRole('button', { name: 'Finish' }).waitFor()
    const names = () => t.page.locator('section[data-ex] h2').allInnerTexts()
    const before = await names()
    const handle = n => t.page.getByRole('button', { name: `Move ${n}: drag, or use the arrow keys` })
    await t.expect(handle(before[0]), 'Folded, unfinished exercises have a ☰')
    // Drag the first one down past the next two cards.
    const from = await handle(before[0]).boundingBox()
    const target = await t.page.locator('section[data-ex]').nth(2).boundingBox()
    await t.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await t.page.mouse.down()
    await t.page.mouse.move(from.x + from.width / 2, target.y + target.height * 0.75, { steps: 12 })
    await t.expect(t.page.locator('[data-ghost]'), 'Mid-drag, a copy of the card follows the finger', 1)
    await t.shot('Mid-drag: the ghost and the dashed drop spot')
    await t.page.mouse.up()
    await t.expect(t.page.locator('[data-ghost]'), 'Let go: the copy is gone', 0)
    const dragged = await names()
    if (dragged.indexOf(before[0]) !== 2) throw new Error(`Dragged ${before[0]} to the 3rd place, got: ${dragged.join(', ')}`)
    await t.expect(t.page.locator('section[data-ex] button[aria-expanded="true"]'), 'Dragging opens nothing: every card is still folded', 0)
    await t.shot('After dragging the first exercise down')
    await handle(before[0]).focus()
    await t.page.keyboard.press('ArrowUp')
    if ((await names()).indexOf(before[0]) !== 1) throw new Error('ArrowUp moves it up one')
    await t.page.reload()
    await t.page.getByRole('button', { name: 'Finish' }).waitFor()
    if ((await names()).indexOf(before[0]) !== 1) throw new Error('The new order survives a reload')
    // Finish the top exercise: it folds with a tick and loses its ☰.
    const top = t.page.locator('section[data-ex]').first()
    const topName = await top.locator('h2').innerText()
    await top.locator('button[aria-expanded]').click()
    const open = top.getByRole('button', { name: /^Set \d+ done$/, pressed: false })
    while (await open.count()) await open.first().click()
    await t.expect(t.page.getByRole('img', { name: `${topName} done` }), `${topName} shows its tick`)
    await t.expect(handle(topName), 'A finished exercise has no ☰', 0)
    await t.shot('Finished exercise: tick, no handle')
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
    if (await t.page.evaluate(() => getComputedStyle(document.documentElement).overflow) !== 'hidden') throw new Error('The page behind the swap sheet can still scroll')
    await t.page.getByRole('button', { name: 'Use "Floor Press"' }).click()
    await t.expect(t.page.getByRole('heading', { level: 2, name: 'Floor Press' }), `${name} swapped for Floor Press`)
    if (await t.page.evaluate(() => getComputedStyle(document.documentElement).overflow) === 'hidden') throw new Error('The page stays locked after the swap sheet closes')
    await t.expect(t.page.getByRole('heading', { level: 2, name, exact: true }), `${name} is gone from the workout`, 0)
    await t.shot('After the swap')
  }],

  'units': ['kg / lb: switch one exercise to lb in the logger (numbers convert), see it in Settings, back to kg; lb as the default', async t => {
    await begin(t, true)
    await t.page.getByRole('button', { name: 'Start', exact: true }).first().click()
    const first = t.page.locator('button[aria-expanded]').first()
    const name = (await first.locator('h2').innerText()).trim()
    await first.click()
    await t.page.getByRole('spinbutton', { name: 'Set 1 kg' }).first().fill('100')
    await t.page.getByRole('button', { name: `Weights in kg for ${name}. Switch to lb` }).click()
    await t.expect(null, '100 kg becomes 220.5 lb', (await t.page.getByRole('spinbutton', { name: 'Set 1 lb' }).first().inputValue()) === '220.5')
    await t.shot('Exercise in lb')
    await t.page.getByRole('link', { name: /Back to the menu/ }).click()
    await settings(t, 'Profile')
    await t.expect(t.page.getByText(name, { exact: true }), `${name} is listed under In lb`)
    await t.page.getByRole('button', { name: 'Back to kg' }).click()
    await t.expect(t.page.getByRole('button', { name: 'Back to kg' }), 'Back to kg empties the list', 0)
    await t.page.getByRole('group', { name: 'Weights in' }).getByRole('button', { name: 'lb' }).click()
    await t.page.getByRole('button', { name: 'Save', exact: true }).click()
    await t.expect(t.page.getByText('Saved', { exact: true }), 'lb saved as the default')
    await t.shot('Profile in lb')
    await tab(t, '/exercises')
    await t.expect(t.page.locator('main').getByText(/ lb$/).first(), 'Exercises show lb')
  }],

  'body-map': ['Home body map: the anatomy figure lights the muscles trained, with ranked bars', async t => {
    await begin(t, true)
    await t.expect(t.page.getByRole('img', { name: 'Front: muscles shaded by sets' }), 'The front figure is drawn')
    await t.expect(t.page.getByRole('img', { name: 'Back: muscles shaded by sets' }), 'and the back one')
    await t.expect(null, 'Muscles are lit (more than one colour)', (await t.page.locator('svg[aria-label="Front: muscles shaded by sets"] g[fill]').evaluateAll(gs => new Set(gs.map(g => g.getAttribute('fill'))).size)) > 1)
    await t.page.getByRole('img', { name: 'Front: muscles shaded by sets' }).scrollIntoViewIfNeeded()
    await t.shot('Body map')
  }],

  'units-pending': ['kg / lb: a switch still waiting on the phone (no signal) is listed in Settings, and Back to kg clears it', async t => {
    await begin(t, true)
    await t.page.evaluate(() => localStorage.setItem('reprun.units', JSON.stringify({ 'bench press': 'lb' }))) // what a switch with no signal leaves
    await settings(t, 'Profile')
    await t.expect(t.page.getByRole('button', { name: 'Back to kg' }), 'The waiting switch is listed under In lb', 1)
    await t.page.getByRole('button', { name: 'Back to kg' }).click()
    await t.expect(t.page.getByRole('button', { name: 'Back to kg' }), 'Back to kg empties the list', 0)
    await t.expect(null, 'and nothing is left waiting', (await t.page.evaluate(() => localStorage.getItem('reprun.units'))) === null)
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
    await settings(t, 'Profile')
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
  page.on('pageerror', e => !t.offline && !t.crashing && errors.push(e.message)) // crashing: the crash-screen check breaks it on purpose
  page.on('console', m => m.type() === 'error' && !t.offline && !t.crashing && errors.push(m.text()))
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
      // Too wide for a moment doesn't count: straight after the intro closes, Home's charts draw once at full width, then
      // fit (longer on a busy machine). A page that stays wider than the screen for 2 s does.
      const extra = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      let w = await extra()
      for (let i = 0; i < 8 && w > 0; i++) (await page.waitForTimeout(250), w = await extra())
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
    execSync(`npx vite build --outDir ${BUILD}`, { cwd: REPO, env, stdio: 'ignore' })
    server = spawn('npx', ['vite', 'preview', '--outDir', BUILD, '--port', String(PORT), '--strictPort'], { cwd: REPO, env, stdio: 'ignore', detached: true })
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
