// An exercise's setup note: what's true every time you do it ("seat 4 · grip on the rings"), shown under its name in
// the logger and on its page until you edit or clear it. Not for how a set felt: that's the set note. Kept on the
// profile (lower-case name → text, shared/rules.ts cleans it), so it syncs and backs up.
import { useState } from 'react'
import { api, useData } from '../lib/data'
import { Tap } from '../lib/haptic'
import { Icon } from './ui'

const PIN = 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z' // Lucide pin
const PENCIL = 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'

export function SetupNote({ name, className = '' }: { name: string; className?: string }) {
  const { data, reload } = useData()
  const key = name.toLowerCase()
  const note = (Object.hasOwn(data.profile.setup ?? {}, key) && data.profile.setup![key]) || ''
  const [draft, setDraft] = useState<string | null>(null) // null: not editing
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (text: string) => {
    setBusy(true)
    setError(null)
    if (text.trim() && !note && Object.keys(data.profile.setup ?? {}).length >= 300) return (setBusy(false), setError('That\'s 300 setup notes, the most it keeps. Clear one you don\'t need first.'))
    try {
      // Just this note, on top of what the server has (rules.ts patchProfile): a unit switch saved meanwhile stays.
      await api('PATCH', 'profile', { setup: { [key]: text.trim() ? text.trim().slice(0, 300) : null } })
      await reload()
      setDraft(null)
    } catch {
      setError("Couldn't save it. Check your signal and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (draft !== null) return (
    <div className={`rounded-xl border border-accent/40 bg-accent/10 p-2.5 ${className}`}>
      <label className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted"><Icon d={PIN} className="size-3.5 text-accent" />Setup for {name} · shown every time</label>
      <textarea className="input min-h-16" autoFocus maxLength={300} value={draft} onChange={e => setDraft(e.target.value)}
        placeholder={`Seat height, grip, pins… shown every time you do ${name}`} aria-label={`Setup note for ${name}`} />
      {error && <p className="mt-1.5 px-1 text-xs text-bad">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button className={`btn flex-1 ${busy ? 'busy' : ''}`} disabled={busy} onClick={() => void save(draft)}>Save</button>
        {note && <button className="btn-ghost" disabled={busy} onClick={() => void save('')}>Clear</button>}
        <button className="btn-ghost" disabled={busy} onClick={() => (setDraft(null), setError(null))}>Cancel</button> {/* no <Tap />: these can be disabled (CLAUDE.md) */}
      </div>
    </div>
  )

  if (!note) return (
    <button type="button" className={`press relative flex h-9 w-full items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-left text-[13px] text-muted active:bg-surface-2 ${className}`}
      onClick={() => setDraft('')}>
      <Tap /><Icon d={PIN} className="size-3.5" />Add setup note (stays every time)
    </button>
  )

  const long = note.length > 70 || note.includes('\n')
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/10 py-2 pl-3 pr-1 ${className}`}>
      <Icon d={PIN} className="mt-0.5 size-4 shrink-0 text-accent" />
      <p className={`min-w-0 flex-1 break-words text-sm leading-snug ${more ? 'whitespace-pre-line' : 'truncate'}`}>
        <span className="font-semibold text-muted">Setup · </span>{note}
      </p>
      {long && <button className="-my-1.5 h-9 shrink-0 px-1 text-xs font-semibold text-accent" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'less' : 'more'}</button>}
      <button className="icon-btn relative -my-1.5 size-9" aria-label={`Edit the setup note for ${name}`} onClick={() => setDraft(note)}><Tap /><Icon d={PENCIL} className="size-4" /></button>
    </div>
  )
}
