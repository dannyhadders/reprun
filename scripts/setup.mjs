// `npm run setup`: from a clone to your own RepRun on workers.dev, from the terminal.
// Creates the database, builds, migrates, deploys and sets your secrets. Safe to re-run: it updates
// the Worker it made before (and keeps its data), and refuses to touch any Worker it didn't make.
//   npm run setup -- --email you@example.com [--name reprun] [--team x --aud y] [--update NAME] [--dry-run]
// ponytail: only edits the build output (dist/reprun/wrangler.json), never wrangler.jsonc, so pulling updates stays clean.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, team: { type: 'string' }, aud: { type: 'string' }, update: { type: 'string' }, 'dry-run': { type: 'boolean' } },
})
const dry = opt['dry-run']
const TAG = 'reprun setup' // deploy message that marks Workers this script made
const CONFIG = 'dist/reprun/wrangler.json'
// A reader per question, so it isn't holding stdin while wrangler asks its own questions.
// No terminal (e.g. run by an agent): every question takes its default; pass flags instead.
async function ask(q, def = '') {
  if (!process.stdin.isTTY) return def
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def } finally { rl.close() }
}
const say = (s = '') => console.log(s)
// Own-domain and demo build settings would point the build somewhere else (scripts/config.mjs, wrangler.jsonc env.demo).
for (const k of ['CLOUDFLARE_ENV', 'REPRUN_DOMAIN', 'REPRUN_DATABASE_ID']) delete process.env[k]
const stop = (s) => { console.error(`\n✘ ${s}`); process.exit(1) }

/** Runs a command. Output is shown live; `capture` also returns stdout; `input` is piped to stdin (and not shown). */
function run(cmd, args, { capture = false, input, quiet = false, mutates = true } = {}) {
  if (dry && mutates) { say(`  (dry run) ${cmd} ${args.join(' ')}`); return Promise.resolve({ code: 0, out: '' }) }
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32', stdio: [input === undefined ? 'inherit' : 'pipe', capture || quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'] })
    let out = '', err = ''
    p.stdout?.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d) })
    p.stderr?.on('data', (d) => (err += d))
    if (input !== undefined) p.stdin.end(input)
    p.on('error', (e) => resolve({ code: 1, out, err: String(e) }))
    p.on('close', (code) => resolve({ code, out, err }))
  })
}
const wrangler = (args, o) => run('npx', ['wrangler', ...args], o)

say('\nRepRun setup\n')

// 1. Cloudflare login
if ((await wrangler(['whoami', '--json'], { quiet: true, mutates: false })).code !== 0) {
  say('First, sign in to Cloudflare. A browser window opens.')
  if ((await wrangler(['login'], { mutates: false })).code !== 0) stop('Cloudflare login failed. Try `npx wrangler login`, then run this again.')
}

// 2. Questions
const email = opt.email ?? await ask('The email you log in to Cloudflare with (the only one allowed in)')
if (!email) stop('Add your email: npm run setup -- --email you@example.com')
if (!/^[^@\s]+@[^@\s]+$/.test(email)) stop(`"${email}" doesn't look like an email.`)
const name = opt.name ?? await ask('Name for your Worker and database', 'reprun')
if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) stop('Use lowercase letters, numbers and dashes only (not at the start or end), up to 63.')
const confirm = async (why) => {
  if (opt.update === name) return
  say(`\n${why}`)
  if ((await ask(`Type ${name} to carry on, or press Enter to stop`)) !== name) stop('Stopped. Nothing was changed. Run again with a different --name.')
}

// 3. Never touch a Worker this script didn't make (e.g. one deployed from GitHub, or someone's real site).
// Our deploys carry TAG as their version message. Secrets add untagged versions after it, hence "any".
// ponytail: wrangler lists the last 10 versions; each run adds at most 4, so ours is always in there.
const dep = await wrangler(['versions', 'list', '--name', name, '--json'], { quiet: true, mutates: false })
let exists = false
if (dep.code === 0) {
  exists = true
  if (!JSON.parse(dep.out).some((v) => v.annotations?.['workers/message'] === TAG)) {
    stop(`A Worker called "${name}" already exists on this account, and this script didn't make it. It won't touch it.\n  Run again with a different name: npm run setup -- --name ${name}-2`)
  }
  await confirm(`"${name}" was set up by this script before. Carrying on updates it to this version and keeps its data.`)
} else if (!/\[code: 10007\]/.test(dep.err)) {
  stop(`Couldn't check for an existing Worker:\n${dep.err.trim()}`)
}

// 4. Database: reuse ours, else create it.
async function listDbs() {
  const r = await wrangler(['d1', 'list', '--json'], { quiet: true, mutates: false })
  if (r.code !== 0) stop(`Couldn't list your databases:\n${r.err.trim()}`)
  return JSON.parse(r.out)
}
let db = (await listDbs()).find((d) => d.name === name)
if (db && !exists) await confirm(`A database called "${name}" already exists, but there's no Worker of that name. Only carry on if an earlier run of this script stopped part-way: it will use that database and its data.`) // --update skips this too
if (!db) {
  say(`\nCreating the database "${name}"…`)
  // --update-config=false: don't let wrangler offer to write the database into wrangler.jsonc.
  if ((await wrangler(['d1', 'create', name, '--update-config=false'])).code !== 0) stop('Creating the database failed (see above).')
  db = dry ? { uuid: '00000000-dry-run' } : (await listDbs()).find((d) => d.name === name)
  if (!db) stop('Created the database, but can\'t find it. Run this again.')
}

// 5. Build.
say('\nBuilding…')
if ((await run('npm', ['run', 'build'], { quiet: true, mutates: false })).code !== 0) stop('The build failed. Run `npm run build` to see why.')

// 6. Point the build output at this Worker name and database.
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
cfg.name = cfg.topLevelName = name
cfg.d1_databases[0] = { ...cfg.d1_databases[0], database_name: name, database_id: db.uuid }
if (dry) say(`  (dry run) would point ${CONFIG} at Worker ${name}, database ${db.uuid}`)
else writeFileSync(CONFIG, JSON.stringify(cfg))

// 7. Tables, then the app.
say('\nUpdating the database tables…')
if ((await wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '-c', CONFIG])).code !== 0) stop('Updating the tables failed (see above).')
say('\nDeploying…')
// Not captured: wrangler only asks its first-time "register a workers.dev subdomain" question on a real terminal.
if ((await wrangler(['deploy', '-c', CONFIG, '--message', TAG])).code !== 0) {
  stop('Deploying failed (see above). First deploy on this Cloudflare account? Pick your workers.dev subdomain at the link above, then run this again.')
}
const url = `https://${name}.<your-subdomain>.workers.dev (the address printed above)`

// 8. Secrets, piped in so they're never shown or saved.
const secret = async (k, v) => {
  if ((await wrangler(['secret', 'put', k, '-c', CONFIG], { input: v, quiet: true })).code !== 0) stop(`Setting ${k} failed. Run \`npx wrangler secret put ${k} --name ${name}\` yourself.`)
}
await secret('ALLOWED_EMAIL', email)

// 9. The login (Cloudflare Access) is a dashboard switch, so it's on the human.
let { team, aud } = opt
if (team === undefined && aud === undefined && !exists) {
  say(`
Deployed to ${url}
Last step, the login (Cloudflare Access). In the Cloudflare dashboard:
  1. Workers & Pages → ${name} → Access tab → Protect this Worker behind Access → All traffic.
  2. Authentication policy: Cloudflare account. Session duration: 7 days. Apply.
  3. Under "Application values" on the right, copy the AUD tag and the JWKS link.
Paste them below, or press Enter to skip and add them later:
  npm run setup -- --email ${email} --name ${name} --update ${name} --team … --aud …`)
  team = await ask('JWKS link (or team name)')
  aud = await ask('AUD tag')
}
if (team) await secret('ACCESS_TEAM', team)
if (aud) await secret('ACCESS_AUD', aud)

say(`\n✔ Done: ${url}`)
say(exists && !(team || aud) ? '  Updated. Your data and login settings were kept.' : team && aud
  ? '  Open it in a private window: you should get Cloudflare\'s sign-in, then your dashboard. Then add it to your phone (docs/SETUP.md step 3).'
  : '  It says "Almost there" until the login is on and its two values are added. Run this again with --update, --team and --aud (see above), or add ACCESS_TEAM and ACCESS_AUD as secrets in the dashboard.')
