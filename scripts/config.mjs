// Own domain: swaps the workers.dev address for REPRUN_DOMAIN and pins REPRUN_DATABASE_ID, so they
// live in Cloudflare (Workers Builds → build variables) instead of in git. Does nothing when unset.
// ponytail: plain text replace on wrangler.jsonc; edit it directly if you'd rather.
import { readFileSync, writeFileSync } from 'node:fs'

const { REPRUN_DOMAIN, REPRUN_DATABASE_ID } = process.env
// Only one of them set is a typo, and could make Cloudflare create a new, empty database.
if (!REPRUN_DOMAIN !== !REPRUN_DATABASE_ID) {
  console.error('Set REPRUN_DOMAIN and REPRUN_DATABASE_ID together')
  process.exit(1)
}
if (REPRUN_DOMAIN) {
  let s = readFileSync('wrangler.jsonc', 'utf8')
  const swap = (from, to) => {
    if (!s.includes(from)) throw new Error(`wrangler.jsonc: can't find ${from}`)
    s = s.replace(from, to)
  }
  swap('"workers_dev": true,', `"workers_dev": false, "routes": [{ "pattern": ${JSON.stringify(REPRUN_DOMAIN)}, "custom_domain": true }],`)
  swap('"database_name": "reprun",', `"database_name": "reprun", "database_id": ${JSON.stringify(REPRUN_DATABASE_ID)},`)
  writeFileSync('wrangler.jsonc', s)
  console.log('wrangler.jsonc: using your domain and database')
}
