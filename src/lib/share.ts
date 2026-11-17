// A finished workout as a 1080×1350 picture (Instagram's portrait size) for the share sheet.
// ponytail: hand-drawn on a canvas. An HTML-to-image library would be a dependency for one card.
import type { ImportWorkout } from '../../shared/types'
import { date, duration, num, plural, setText } from './format'

const W = 1080, H = 1350, PAD = 90
const C = { bg: '#0a0c11', surface: '#12151d', line: '#242a38', ink: '#e8eaf0', muted: '#8b93a7', accent: '#818cf8', accent2: '#22d3ee', pb: '#fbbf24' }
const font = (weight: number, px: number) => `${weight} ${px}px Inter, ui-sans-serif, system-ui, sans-serif`

/** Cut text to fit `max` px, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

export function drawCard(w: ImportWorkout, pbs: number): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')!
  const grad = (x0: number, x1: number) => ctx.createLinearGradient(x0, 0, x1, 0)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  // Soft glow top-right, the app's two accents.
  const glow = ctx.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 700)
  glow.addColorStop(0, 'rgba(129,140,248,0.35)')
  glow.addColorStop(0.5, 'rgba(34,211,238,0.10)')
  glow.addColorStop(1, 'rgba(10,12,17,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.ink
  ctx.font = font(800, 44)
  ctx.fillText('Rep', PAD, PAD + 30)
  const rep = ctx.measureText('Rep').width
  const g = grad(PAD + rep, PAD + rep + 90)
  g.addColorStop(0, C.accent)
  g.addColorStop(1, C.accent2)
  ctx.fillStyle = g
  ctx.fillText('Run', PAD + rep, PAD + 30)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 34)
  ctx.textAlign = 'right'
  ctx.fillText(date(w.date, { weekday: 'short', day: 'numeric', month: 'short' }), W - PAD, PAD + 30)
  ctx.textAlign = 'left'

  ctx.fillStyle = C.ink
  ctx.font = font(800, 96)
  ctx.fillText(fit(ctx, w.title || 'Workout', W - PAD * 2), PAD, 330)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 40)
  ctx.fillText('done 💪', PAD, 395)

  // Three stats in a band.
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  const stats: [string, string][] = [[duration(w.duration_s ?? null), 'Time'], [String(w.sets.length), 'Sets'], [`${num(volume)} kg`, 'Volume']]
  ctx.fillStyle = C.surface
  ctx.beginPath()
  ctx.roundRect(PAD, 460, W - PAD * 2, 200, 36)
  ctx.fill()
  stats.forEach(([value, label], i) => {
    const x = PAD + ((W - PAD * 2) / 3) * (i + 0.5)
    ctx.textAlign = 'center'
    const vg = grad(x - 140, x + 140)
    vg.addColorStop(0, C.accent)
    vg.addColorStop(1, C.accent2)
    ctx.fillStyle = vg
    ctx.font = font(800, 64)
    ctx.fillText(value, x, 570)
    ctx.fillStyle = C.muted
    ctx.font = font(500, 30)
    ctx.fillText(label, x, 620)
  })
  ctx.textAlign = 'left'

  let y = 740
  if (pbs > 0) {
    ctx.fillStyle = C.pb
    ctx.font = font(700, 44)
    ctx.fillText(`🏆 ${plural(pbs, 'PB')}`, PAD, y)
    y += 80
  }

  // Each exercise with its heaviest set, in the order done.
  const byEx = new Map<string, ImportWorkout['sets']>()
  for (const s of w.sets) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s])
  const rows = [...byEx].slice(0, pbs > 0 ? 6 : 7)
  for (const [name, sets] of rows) {
    const top = sets.reduce((b, s) => ((s.weight_kg ?? 0) > (b.weight_kg ?? 0) || ((s.weight_kg ?? 0) === (b.weight_kg ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b))
    const right = `${sets.length} × · ${setText(top)}`
    ctx.font = font(500, 36)
    ctx.fillStyle = C.muted
    ctx.textAlign = 'right'
    ctx.fillText(right, W - PAD, y)
    const rw = ctx.measureText(right).width
    ctx.textAlign = 'left'
    ctx.fillStyle = C.ink
    ctx.font = font(600, 38)
    ctx.fillText(fit(ctx, name, W - PAD * 2 - rw - 40), PAD, y)
    y += 70
  }
  if (byEx.size > rows.length) {
    ctx.fillStyle = C.muted
    ctx.font = font(500, 32)
    ctx.fillText(`+ ${plural(byEx.size - rows.length, 'more exercise')}`, PAD, y)
  }

  ctx.fillStyle = C.line
  ctx.fillRect(PAD, H - 150, W - PAD * 2, 2)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 30)
  ctx.fillText('Lift. Run. Repeat.', PAD, H - 90)
  return canvas
}

/** The card as a PNG file. Made ahead of the tap: iOS only lets navigator.share run straight off a tap, not after awaits. */
export async function cardFile(w: ImportWorkout, pbs: number) {
  await document.fonts?.load(font(800, 96)).catch(() => {})
  const blob = await new Promise<Blob | null>(r => drawCard(w, pbs).toBlob(r, 'image/png'))
  if (!blob) throw new Error("Couldn't make the picture")
  return new File([blob], `reprun-${w.date}.png`, { type: 'image/png' })
}

/** Share sheet with the picture where the phone supports sharing files (iOS, Android); a download everywhere else. */
export async function shareFile(file: File, title: string) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e // closing the share sheet isn't an error
    }
    return
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
