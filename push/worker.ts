// Rest alerts (push.reprun.co.uk): one Worker on the owner's account for every copy of RepRun (live, demo,
// phone-only, self-hosted). The app sends its phone's push address and when rest ends (or a reminder is due); a Durable Object per address
// holds it until then, sends an EMPTY push (no workout data, ever), and deletes everything. See docs/SETUP.md.
import { DurableObject } from 'cloudflare:workers'
import { parse, vapid, type Kind } from './rules.ts'

type Env = { REST: DurableObjectNamespace<Rest>; VAPID_PRIVATE: string }
const CORS = { 'Access-Control-Allow-Origin': '*' } // any copy of the app, on any domain

export default {
  async fetch(req, env) {
    // POST with a text/plain body: a "simple" request, so browsers skip the CORS preflight.
    if (req.method !== 'POST') return new Response('RepRun rest alerts', { headers: CORS })
    const r = parse(await req.json().catch(() => null), Date.now())
    if (!r) return new Response('Bad request', { status: 400, headers: CORS })
    // One object per phone and kind, so a phone has at most one of each waiting. Rest keeps the bare address as its
    // name, so alerts already waiting when this shipped still get cancelled.
    const name = r.kind === 'rest' ? r.endpoint : `${r.kind}:${r.endpoint}`
    await env.REST.get(env.REST.idFromName(name)).set(r.endpoint, r.at, r.kind)
    return new Response(null, { status: 204, headers: CORS })
  },
} satisfies ExportedHandler<Env>

export class Rest extends DurableObject<Env> {
  async set(endpoint: string, at: number | null, kind: Kind = 'rest') {
    if (at === null) return this.clear()
    await this.ctx.storage.put({ endpoint, kind })
    await this.ctx.storage.setAlarm(at)
  }

  async alarm() {
    const endpoint = await this.ctx.storage.get<string>('endpoint')
    const kind = (await this.ctx.storage.get<Kind>('kind')) ?? 'rest'
    await this.clear()
    if (!endpoint) return
    if (!this.env.VAPID_PRIVATE) return console.error('push failed: the VAPID_PRIVATE secret is not set (push/wrangler.jsonc)')
    // A rest alert is dropped if the phone can't be reached within a minute (no buzz long after rest is over); a
    // reminder is kept for an hour. public/sw.js matches its words by time, within that hour.
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { TTL: kind === 'rest' ? '60' : '3600', Urgency: 'high', Authorization: await vapid(endpoint, JSON.parse(this.env.VAPID_PRIVATE), Date.now()) },
      body: '',
    })
    console.log(res.ok ? 'push sent' : 'push failed', res.status, res.ok ? '' : (await res.text()).slice(0, 200)) // never the address
  }

  private async clear() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }
}
