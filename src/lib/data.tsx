import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../../shared/types.ts'
import { sessionLines } from './motivation.ts'
import { buildModel, type Model } from './stats.ts'

type Ctx = { data: Data; model: Model; lines: Map<string, string>; reload: () => Promise<void> }
const DataCtx = createContext<Ctx | null>(null)
const CACHE = 'reprun.data'

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `Request failed (${res.status})`)
  return out as T
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const d = await api<Data>('GET', 'data')
      setData(d)
      setError(null)
      try { localStorage.setItem(CACHE, JSON.stringify(d)) } catch { /* full or blocked: just no offline copy */ }
    } catch (e) {
      // Offline at the gym (or Access session expired): carry on with the last copy so the logger still works.
      const cached = (() => { try { return localStorage.getItem(CACHE) } catch { return null } })()
      if (cached) setData(d => d ?? (JSON.parse(cached) as Data))
      else setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(() => {
    if (!data) return null
    const model = buildModel(data)
    return { data, model, lines: sessionLines(model), reload }
  }, [data, reload])

  if (error && !data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Couldn't load your data</p>
          <p className="mt-1 text-muted">{error}</p>
          <button className="btn mt-4" onClick={reload}>Try again</button>
        </div>
      </div>
    )
  }
  if (!value) return <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export const useData = () => {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData outside DataProvider')
  return c
}
