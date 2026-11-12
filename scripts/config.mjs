// Swaps your domain and database id into wrangler.jsonc at build time, so they live in
// Cloudflare (Workers Builds → build variables) instead of in git. Does nothing when they're unset.
// ponytail: plain text replace of the two placeholders; edit wrangler.jsonc directly if you'd rather.
import { readFileSync, writeFileSync } from 'node:fs'

const { REPRUN_DOMAIN, REPRUN_DATABASE_ID } = process.env
if (REPRUN_DOMAIN || REPRUN_DATABASE_ID) {
  let s = readFileSync('wrangler.jsonc', 'utf8')
  if (REPRUN_DOMAIN) s = s.replace('"gym.example.com"', JSON.stringify(REPRUN_DOMAIN))
  if (REPRUN_DATABASE_ID) s = s.replace('"YOUR_DATABASE_ID"', JSON.stringify(REPRUN_DATABASE_ID))
  writeFileSync('wrangler.jsonc', s)
  console.log('wrangler.jsonc: filled in', [REPRUN_DOMAIN && 'domain', REPRUN_DATABASE_ID && 'database id'].filter(Boolean).join(' and '))
}
