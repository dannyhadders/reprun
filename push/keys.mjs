// Makes the rest alerts' key pair, once. The private half goes in push/.dev.vars (never committed), ready for
// `npx wrangler secret put VAPID_PRIVATE -c push/wrangler.jsonc`; the public half is printed for VAPID in src/lib/push.tsx.
// A new pair means every phone has to turn rest alerts off and on again, so keep the one you have.
import { existsSync, writeFileSync } from 'node:fs'

const file = new URL('.dev.vars', import.meta.url)
if (existsSync(file)) throw new Error('push/.dev.vars already exists: keep that key (see the comment at the top)')
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', privateKey)
writeFileSync(file, `VAPID_PRIVATE='${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })}'\n`)
console.log('Public key (VAPID in src/lib/push.tsx):', Buffer.from(await crypto.subtle.exportKey('raw', publicKey)).toString('base64url'))
