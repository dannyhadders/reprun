// Assert-based self-check for the rest alerts Worker (push/rules.ts): what it accepts, and that its signature verifies.
// npx tsx scripts/check-push.ts
import assert from 'node:assert/strict'
import { fromB64url, KINDS, MAX_AHEAD, parse, publicKey, vapid } from '../push/rules.ts'

const now = 1_800_000_000_000
const apple = 'https://web.push.apple.com/QGuQyavXut'

assert.deepEqual(parse({ endpoint: apple, at: now + 90_000 }, now), { endpoint: apple, at: now + 90_000, kind: 'rest' })
assert.deepEqual(parse({ endpoint: apple, at: null }, now), { endpoint: apple, at: null, kind: 'rest' })
assert.deepEqual(parse({ endpoint: apple, at: now - 1000 }, now), { endpoint: apple, at: now, kind: 'rest' }) // a touch late: send now
// Reminders can be days ahead; rest alerts can't, and unknown kinds are refused.
assert.deepEqual(parse({ endpoint: apple, at: now + 3 * 86_400_000, kind: 'recap' }, now), { endpoint: apple, at: now + 3 * 86_400_000, kind: 'recap' })
assert.ok(parse({ endpoint: apple, at: now + KINDS.nudge, kind: 'nudge' }, now))
assert.equal(parse({ endpoint: apple, at: now + KINDS.nudge + 1, kind: 'nudge' }, now), null)
assert.ok(parse({ endpoint: apple, at: now + 31 * 86_400_000, kind: 'month' }, now), 'monthly report: a month ahead')
assert.equal(parse({ endpoint: apple, at: now + 3 * 86_400_000 }, now), null)
assert.equal(parse({ endpoint: apple, at: now, kind: 'spam' }, now), null)
assert.equal(parse({ endpoint: apple, at: now, kind: 'toString' }, now), null)
assert.ok(parse({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', at: now }, now))
assert.ok(parse({ endpoint: 'https://wns2-par02p.notify.windows.com/w/?token=x', at: now }, now))
// Anything else is refused: other hosts, look-alikes, http, too far ahead, no time, junk.
assert.equal(parse({ endpoint: 'https://example.com/x', at: now }, now), null)
assert.equal(parse({ endpoint: 'https://web.push.apple.com.evil.com/x', at: now }, now), null)
assert.equal(parse({ endpoint: 'http://web.push.apple.com/x', at: now }, now), null)
assert.equal(parse({ endpoint: apple, at: now + MAX_AHEAD + 1 }, now), null)
assert.equal(parse({ endpoint: apple, at: now - 60_000 }, now), null)
assert.equal(parse({ endpoint: apple }, now), null)
assert.equal(parse({ endpoint: apple, at: Infinity }, now), null)
assert.equal(parse('junk', now), null)
assert.equal(parse(null, now), null)

// The header's JWT verifies with the public key it carries, and is addressed to the push service.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as { kty: string; crv: string; x: string; y: string; d: string }
const header = await vapid(apple, jwk, now)
const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)
assert.ok(m, header)
const [, h, claims, sig, k] = m
assert.equal(k, publicKey(jwk))
assert.equal(k, Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'))
const pub = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(sig), new TextEncoder().encode(`${h}.${claims}`)))
const c = JSON.parse(new TextDecoder().decode(fromB64url(claims)))
assert.equal(c.aud, 'https://web.push.apple.com')
assert.equal(c.exp, now / 1000 + 3600)

console.log('check-push: ok')
