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
  await t.page.getByRole('dialog', { name: 'Welcome to RepRun' }).waitFor({ state: 'detached' })
}
const tab = async (t, route) => { await t.page.goto(BASE + route); await t.page.locator('main h1').first().waitFor() }
// The planner sheet: the bottom bar's round button on a phone, the sidebar's link on a desktop.
const planner = t => t.page.getByRole(t.device === 'iphone' ? 'button' : 'link', { name: 'Start workout', exact: true }).click()
const finish = async t => { await t.page.getByRole('button', { name: 'Finish' }).click(); await t.page.getByRole('heading', { level: 1, name: / done$/ }).waitFor() }
const topWorkout = t => t.page.getByRole('article').first()

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
    await t.shot('Summary')
    await t.page.getByRole('button', { name: 'Done' }).click()
    await t.page.waitForURL(/\/workouts/)
    await t.expect(topWorkout(t).getByRole('heading', { name: routine }), `Top of Workouts is today's ${routine}`)
    await t.expect(topWorkout(t).getByText('2 sets'), '...with 2 sets')
    await t.shot('Workouts')
  }],

  'log-empty': ['Fresh copy: empty workout, add an exercise, type a set, finish; it shows up everywhere', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: 'Empty workout' }).click()
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
    await t.page.getByRole('button', { name: 'Empty workout' }).click()
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
    await t.page.getByRole('button', { name: 'Empty workout' }).click()
    await t.page.getByRole('textbox', { name: 'Exercise name' }).fill('Squat')
    await t.page.getByRole('button', { name: 'Add', exact: true }).click()
    await t.page.getByRole('button', { name: 'Discard workout' }).click()
    await t.shot('Discard asks first')
    await t.page.getByRole('button', { name: 'Discard', exact: true }).click()
    await tab(t, '/workouts')
    await t.expect(t.page.getByRole('article'), 'Workouts is still empty', 0)
  }],

  'plan-import': ['Paste a plan: preview, save, it becomes a routine', async t => {
    await begin(t, false)
    await planner(t)
    await t.page.getByRole('button', { name: '+ Import plan' }).click()
    await t.page.getByRole('textbox', { name: 'Plan text' }).fill(PLAN)
    await t.expect(t.page.getByRole('heading', { name: /Arm day · 2 exercises/ }), 'Preview reads 1 day, 2 exercises')
    await t.shot('Plan preview')
    await t.page.getByRole('button', { name: 'Save 1 routine' }).click()
    await t.page.goto(BASE + '/')
    await planner(t)
    await t.expect(t.page.getByText('Arm day').first(), 'Arm day is in the planner')
    await t.shot('Planner with the routine')
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
}

// --- runner -------------------------------------------------------------------------------------------------------
async function run(id, device, browser) {
  const [title, fn] = CHECKS[id]
  const ctx = await browser.newContext(device === 'iphone' ? { ...pw.devices['iPhone 15'] } : { viewport: { width: 1280, height: 900 } })
  // Behave like the installed home-screen app (no "add to home screen" page), which is how it's used.
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.setDefaultTimeout(8000)
  const res = { id, title, device, steps: [], status: 'PASS' }
  let n = 0
  const t = {
    id: `${id}-${device}`, page, device,
    async shot(label, full = false) {
      const shot = `${id}-${device}-${String(++n).padStart(2, '0')}.png`
      await page.screenshot({ path: OUT + shot, fullPage: full }).catch(() => {})
      res.steps.push({ step: label, ok: true, shot })
    },
    // locator visible, or (count) exactly that many, or (string) has that text; locator null: a plain boolean.
    async expect(loc, label, want) {
      let ok
      if (loc === null) ok = !!want
      else if (typeof want === 'number') ok = (await loc.count()) === want
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
