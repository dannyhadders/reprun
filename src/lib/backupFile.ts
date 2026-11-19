// Saving a backup file (Settings → Backup, and the nudge after a workout on phone-only copies).
import { toBackup } from '../../shared/backup.ts'
import type { Data } from '../../shared/types.ts'
import { daysBetween, localISO, today } from './format.ts'

const LAST = 'reprun.lastBackup' // this device only: when it last saved a backup file
export const lastBackup = () => { try { return localStorage.getItem(LAST) } catch { return null } }
/** Whole days since the last backup on this device, or null if never. */
export const backupAge = () => { const t = lastBackup(); return t ? daysBetween(localISO(new Date(t)), today()) : null }

/**
 * iPhone: the share sheet (Save to Files). Elsewhere: a download. False if the share sheet was closed.
 * Always the same name, so saving into the same folder offers Replace and there's only ever one file (the newest is the
 * only one worth keeping: each is a complete copy). A web app can't overwrite a file by itself on iPhone.
 */
export async function saveBackup(data: Data): Promise<boolean> {
  const file = new File([JSON.stringify(toBackup(data))], 'reprun-backup.json', { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return false
    throw e
  }
  try { localStorage.setItem(LAST, new Date().toISOString()) } catch { /* just no reminder */ }
  return true
}
