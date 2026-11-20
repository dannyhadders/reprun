// Light or dark (Settings → Appearance). Saved on this phone; index.html applies it before first paint.
// Dark is the default and needs no attribute; the light tokens are in index.css.
export type Theme = 'dark' | 'light'

export const getTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function setTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'light') root.dataset.theme = 'light'
  else delete root.dataset.theme
  try { localStorage.setItem('reprun-theme', t) } catch { /* private mode: this visit only */ }
  document.querySelector<HTMLMetaElement>('meta[name=theme-color]')!.content = getComputedStyle(root).getPropertyValue('--color-bg').trim()
}
