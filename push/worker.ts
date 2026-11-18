// Rest alerts (push.reprun.co.uk): one Worker on the owner's account for every copy of RepRun (live, demo,
// phone-only, self-hosted). The app sends its phone's push address and when rest ends; a Durable Object per address
// holds it until then, sends an EMPTY push (no workout data, ever), and deletes everything. See docs/SETUP.md.
import { DurableObject } from 'cloudflare:workers'
import { parse, vapid } from './rules.ts'

type Env = { REST: DurableObjectNamespace<Rest>; VAPID_PRIVATE: string }
const CORS = { 'Access-Control-Allow-Origin': '*' } // any copy of the app, on any domain

export default {
  async fetch(req, env) {
    // POST with a text/plain body: a "simple" request, so browsers skip the CORS preflight.
    if (req.method !== 'POST') return new Response('RepRun rest alerts', { headers: CORS })
    const r = parse(await req.json().catch(() => null), Date.now())
    if (!r) return new Response('Bad request', { status: 400, headers: CORS })
    // One object per phone, so a phone has at most one alert waiting.
    await env.REST.get(env.REST.idFromName(r.endpoint)).set(r.endpoint, r.at)
    return new Response(null, { status: 204, headers: CORS })
  },
} satisfies ExportedHandler<Env>

export class Rest extends DurableObject<Env> {
  async set(endpoint: string, at: number | null) {
    if (at === null) return this.clear()
    await this.ctx.storage.put('endpoint', endpoint)
    await this.ctx.storage.setAlarm(at)
  }

  async alarm() {
    const endpoint = await this.ctx.storage.get<string>('endpoint')
    await this.clear()
    if (!endpoint) return
    if (!this.env.VAPID_PRIVATE) return console.error('push failed: the VAPID_PRIVATE secret is not set (push/wrangler.jsonc)')
    // TTL 60: if the phone can't be reached within a minute, drop it rather than buzz long after rest is over.
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { TTL: '60', Urgency: 'high', Authorization: await vapid(endpoint, JSON.parse(this.env.VAPID_PRIVATE), Date.now()) },
      body: '',
    })
    console.log(res.ok ? 'push sent' : 'push failed', res.status, res.ok ? '' : (await res.text()).slice(0, 200)) // never the address
  }

  private async clear() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }
}
