// The push Worker's pure parts, so scripts/check-push.ts can run them in Node.

export const MAX_AHEAD = 10 * 60_000 // rest alerts at most 10 minutes ahead

// Only real push services, or anyone could use this Worker to send requests to any address.
const HOSTS = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com']
const pushHost = (h: string) => HOSTS.includes(h) || h.endsWith('.notify.windows.com')

/** The app's request: { endpoint, at } schedules the alert, { endpoint, at: null } cancels it. null if it's neither. */
export function parse(body: unknown, now: number): { endpoint: string; at: number | null } | null {
  if (!body || typeof body !== 'object') return null
  const { endpoint, at } = body as Record<string, unknown>
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return null
  let u: URL
  try { u = new URL(endpoint) } catch { return null }
  if (u.protocol !== 'https:' || !pushHost(u.hostname)) return null
  if (at === null) return { endpoint, at }
  if (typeof at !== 'number' || !Number.isFinite(at) || at < now - 5000 || at > now + MAX_AHEAD) return null
  return { endpoint, at: Math.max(at, now) }
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
type Jwk = { kty: string; crv: string; x: string; y: string; d: string } // a P-256 private key, as JSON
const text = (s: string) => new TextEncoder().encode(s)

/** The app's key (applicationServerKey): the private key's public half, as Web Push wants it. */
export const publicKey = (jwk: Jwk) => b64url(new Uint8Array([4, ...fromB64url(jwk.x), ...fromB64url(jwk.y)]))

/**
 * Authorization header for an empty push (VAPID, RFC 8292): a JWT for the push service, signed with our private key.
 * No body means nothing to encrypt; the phone's service worker writes "Rest over" itself.
 */
export async function vapid(endpoint: string, jwk: Jwk, now: number) {
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const part = (o: object) => b64url(text(JSON.stringify(o)))
  const jwt = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: 'https://reprun.co.uk' })}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(jwt)))
  return `vapid t=${jwt}.${b64url(sig)}, k=${publicKey(jwk)}`
}
