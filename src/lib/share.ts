// A finished workout as a picture for the share sheet, in a few looks to swipe between (like Strava's):
// Full (1080×1350, Instagram portrait), Bold (the brand gradient), Story (1080×1920, huge numbers) and Sticker (see-through,
// to lay over your own photo in a story).
// ponytail: hand-drawn on a canvas. An HTML-to-image library would be a dependency for a few cards.
/** What the card needs: an ImportWorkout fits, and so does a saved workout with its exercise names filled in. */
export type CardWorkout = {
  date: string; title: string | null; duration_s?: number | null
  sets: { exercise: string; weight_kg: number | null; reps: number | null; seconds: number | null }[]
}
import { date, duration, kg, plural, setText } from './format'

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

/** Break text into lines no wider than `max` px; past `most` lines the last one ends in an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, most: number) {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word
    if (ctx.measureText(next).width <= max || !cur) cur = next
    else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  return lines.length > most ? [...lines.slice(0, most - 1), fit(ctx, lines.slice(most - 1).join(' '), max)] : lines
}

export const LOOKS = [
  { id: 'full', name: 'Full' },
  { id: 'bold', name: 'Bold' },
  { id: 'story', name: 'Story' },
  { id: 'sticker', name: 'Sticker' },
] as const
export type Look = (typeof LOOKS)[number]['id']

/** Time, Sets, Volume, and PBs when there are any: what every look shows. */
function statsOf(w: CardWorkout, pbs: string[]): [string, string][] {
  const volume = w.sets.reduce((v, s) => v + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
  const out: [string, string][] = [[duration(w.duration_s ?? null), 'Time'], [String(w.sets.length), 'Sets'], [kg(Math.round(volume)), 'Volume']]
  if (pbs.length) out.push([`🏆 ${pbs.length}`, pbs.length === 1 ? 'PB' : 'PBs'])
  return out
}

// The RR mark (the app icon's SVG), drawn left of the wordmark. Loaded once by cardFile before any drawing; without it
// (it failed to load) the wordmark just goes on its own.
let logo: HTMLImageElement | null = null
let loading: Promise<void> | null = null
const loadLogo = () => (loading ??= new Promise<void>(done => {
  const img = new Image()
  img.onload = () => ((logo = img), done())
  img.onerror = () => done()
  img.src = '/favicon.svg'
}))
const logoSize = (px: number) => (logo ? px * 1.7 : 0)
const logoGap = (px: number) => (logo ? px * 0.36 : 0)
/** How wide the RR mark plus "RepRun" is at `px`, to centre it. */
function markWidth(ctx: CanvasRenderingContext2D, px: number) {
  ctx.font = font(800, px)
  return logoSize(px) + logoGap(px) + ctx.measureText('RepRun').width
}

/** The RR mark and "RepRun" at x, y (text baseline): "Run" in the accent gradient, or all one colour (gradient look). */
function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, solid?: string) {
  if (logo) {
    const size = logoSize(px)
    ctx.drawImage(logo, x, y - px * 0.36 - size / 2, size, size) // centred on the letters' middle
    x += size + logoGap(px)
  }
  ctx.font = font(800, px)
  const rep = ctx.measureText('Rep').width
  ctx.fillStyle = solid ?? C.ink
  ctx.fillText('Rep', x, y)
  if (!solid) {
    const g = ctx.createLinearGradient(x + rep, 0, x + rep + px * 2, 0)
    g.addColorStop(0, C.accent)
    g.addColorStop(1, C.accent2)
    ctx.fillStyle = g
  }
  ctx.fillText('Run', x + rep, y)
}

/** Biggest font from `px` down that fits `max` px wide. */
function shrink(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, max: number) {
  do ctx.font = font(weight, px)
  while (ctx.measureText(text).width > max && (px -= 2) > 24)
  return px
}

/** Title lines as big as fit in `lines` lines, from `big` down to `small` px. */
function titleLines(ctx: CanvasRenderingContext2D, text: string, big: number, small: number, max: number, lines: number) {
  let size = big, out: string[] = []
  for (; size >= small; size -= 4) {
    ctx.font = font(800, size)
    out = wrap(ctx, text, max, lines)
    if (!out.at(-1)!.endsWith('…')) break
  }
  size = Math.max(size, small)
  ctx.font = font(800, size)
  return { size, out }
}

/** The brand gradient filling the card, dark text on it. PBs by name and the session's line under the title. */
function drawBold(w: CardWorkout, pbs: string[], line?: string) {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')!
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, C.accent)
  bg.addColorStop(1, C.accent2)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  wordmark(ctx, PAD, PAD + 30, 44, C.bg)
  ctx.fillStyle = C.bg
  ctx.font = font(600, 34)
  ctx.textAlign = 'right'
  ctx.fillText(date(w.date, { weekday: 'short', day: 'numeric', month: 'short' }), W - PAD, PAD + 30)
  ctx.textAlign = 'left'
  const { size, out } = titleLines(ctx, w.title || 'Workout', 128, 72, W - PAD * 2, 3)
  let y = 230
  for (const t of out) ctx.fillText(t, PAD, (y += size * 1.04))
  if (pbs.length) {
    ctx.font = font(700, 38)
    y += 70
    for (const l of wrap(ctx, `🏆 PB${pbs.length > 1 ? 's' : ''}: ${pbs.join(', ')}`, W - PAD * 2, 2)) {
      ctx.fillText(l, PAD, y)
      y += 50
    }
  }
  if (line) {
    ctx.font = font(600, 40)
    y += pbs.length ? 30 : 90
    for (const l of wrap(ctx, line, W - PAD * 2, 4)) {
      ctx.fillText(l, PAD, y)
      y += 54
    }
  }
  // Stats two by two along the bottom.
  const stats = statsOf(w, pbs), colW = (W - PAD * 2) / 2, rowH = 190
  const top = H - 150 - Math.ceil(stats.length / 2) * rowH
  stats.forEach(([value, label], i) => {
    const x = PAD + (i % 2) * colW, sy = top + Math.floor(i / 2) * rowH
    ctx.fillStyle = C.bg
    shrink(ctx, value, 800, 96, colW - 30)
    ctx.fillText(value, x, sy + 96)
    ctx.font = font(600, 32)
    ctx.fillText(label.toUpperCase(), x, sy + 144)
  })
  ctx.font = font(600, 30)
  ctx.fillText('Lift. Run. Repeat.', PAD, H - 75)
  return canvas
}

/** Instagram story size: the title, then each number huge, one under another. */
function drawStory(w: CardWorkout, pbs: string[]) {
  const SH = 1920
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: SH })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, SH)
  const glow = ctx.createRadialGradient(W / 2, 260, 0, W / 2, 260, 900)
  glow.addColorStop(0, 'rgba(129,140,248,0.30)')
  glow.addColorStop(0.5, 'rgba(34,211,238,0.08)')
  glow.addColorStop(1, 'rgba(10,12,17,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, SH)
  ctx.textAlign = 'left'
  wordmark(ctx, (W - markWidth(ctx, 56)) / 2, 230, 56)
  ctx.textAlign = 'center'
  ctx.fillStyle = C.ink
  const { size, out } = titleLines(ctx, w.title || 'Workout', 96, 64, W - PAD * 2, 2)
  let y = 330
  for (const t of out) ctx.fillText(t, W / 2, (y += size * 1.06))
  ctx.fillStyle = C.muted
  ctx.font = font(500, 38)
  ctx.fillText(date(w.date, { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, (y += 70))
  const stats = statsOf(w, pbs)
  const step = Math.min(300, (SH - 260 - (y + 120)) / stats.length)
  y += 120
  stats.forEach(([value, label], i) => {
    const vy = y + step * i + step * 0.55
    if (i === 3) ctx.fillStyle = C.pb
    else {
      const g = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
      g.addColorStop(0, C.accent)
      g.addColorStop(1, C.accent2)
      ctx.fillStyle = g
    }
    shrink(ctx, value, 800, 150, W - PAD * 2)
    ctx.fillText(value, W / 2, vy)
    ctx.fillStyle = C.muted
    ctx.font = font(600, 36)
    ctx.fillText(label.toUpperCase(), W / 2, vy + 60)
  })
  ctx.fillStyle = C.muted
  ctx.font = font(500, 34)
  ctx.fillText('Lift. Run. Repeat.', W / 2, SH - 130)
  return canvas
}

/** See-through: just the numbers and the wordmark, with a soft shadow so they read on any photo. */
function drawSticker(w: CardWorkout, pbs: string[]) {
  const stats = statsOf(w, pbs), rowH = 220
  const SH = 120 + 110 + stats.length * rowH + 150
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: SH })
  const ctx = canvas.getContext('2d')!
  Object.assign(ctx, { shadowColor: 'rgba(0,0,0,0.55)', shadowBlur: 24, shadowOffsetY: 4, textAlign: 'center', fillStyle: C.ink })
  ctx.font = font(800, shrink(ctx, w.title || 'Workout', 800, 72, W - PAD * 2))
  ctx.fillText(fit(ctx, w.title || 'Workout', W - PAD * 2), W / 2, 150)
  let y = 230
  for (const [value, label] of stats) {
    ctx.fillStyle = C.ink
    ctx.font = font(600, 34)
    ctx.fillText(label.toUpperCase(), W / 2, y + 50)
    shrink(ctx, value, 800, 120, W - PAD * 2)
    ctx.fillText(value, W / 2, y + 170)
    y += rowH
  }
  ctx.textAlign = 'left'
  wordmark(ctx, (W - markWidth(ctx, 52)) / 2, y + 90, 52, C.ink)
  return canvas
}

/** One look of the card. Full is the default and the most detailed. */
export function drawCard(w: CardWorkout, pbs: string[], line?: string, look: Look = 'full'): HTMLCanvasElement {
  if (look === 'bold') return drawBold(w, pbs, line)
  if (look === 'story') return drawStory(w, pbs)
  if (look === 'sticker') return drawSticker(w, pbs)
  return drawFull(w, pbs, line)
}

/**
 * `pbs`: names of the exercises with a PB in this workout (they go first, in gold). `line`: the session's one-liner
 * (motivation.ts), so no two cards read the same. Everything below the header sizes itself to fit, so long titles wrap
 * and every exercise gets a row; past ~13 rows the rest becomes "+N more".
 */
function drawFull(w: CardWorkout, pbs: string[], line?: string): HTMLCanvasElement {
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
  wordmark(ctx, PAD, PAD + 30, 44)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 34)
  ctx.textAlign = 'right'
  ctx.fillText(date(w.date, { weekday: 'short', day: 'numeric', month: 'short' }), W - PAD, PAD + 30)
  ctx.textAlign = 'left'

  // Title: as big as fits in two lines, 84px down to 56px.
  let size = 84, title: string[] = []
  for (; size >= 56; size -= 4) {
    ctx.font = font(800, size)
    title = wrap(ctx, w.title || 'Workout', W - PAD * 2, 2)
    if (title.every(t => ctx.measureText(t).width <= W - PAD * 2) && !title.at(-1)!.endsWith('…')) break
  }
  ctx.font = font(800, Math.max(size, 56))
  ctx.fillStyle = C.ink
  let y = 210
  for (const t of title) {
    y += size * 1.08
    ctx.fillText(t, PAD, y)
  }
  y += 50
  ctx.fillStyle = C.muted
  ctx.font = font(500, 34)
  ctx.fillText('done 💪', PAD, y)

  // Stats band: Time, Sets, Volume, and PBs when there are any.
  const stats = statsOf(w, pbs)
  const bandTop = y + 40, bandH = 150, col = (W - PAD * 2) / stats.length
  ctx.fillStyle = C.surface
  ctx.beginPath()
  ctx.roundRect(PAD, bandTop, W - PAD * 2, bandH, 32)
  ctx.fill()
  stats.forEach(([value, label], i) => {
    const x = PAD + col * (i + 0.5)
    ctx.textAlign = 'center'
    // Biggest size that fits its column, so a long number shrinks instead of being cut off.
    let px = stats.length === 4 ? 52 : 58
    do ctx.font = font(800, px)
    while (ctx.measureText(value).width > col - 24 && (px -= 2) > 30)
    const isPb = i === 3
    if (isPb) ctx.fillStyle = C.pb
    else {
      const vg = grad(x - col / 2, x + col / 2)
      vg.addColorStop(0, C.accent)
      vg.addColorStop(1, C.accent2)
      ctx.fillStyle = vg
    }
    ctx.fillText(value, x, bandTop + 82)
    ctx.fillStyle = C.muted
    ctx.font = font(500, 28)
    ctx.fillText(label, x, bandTop + 122)
  })
  ctx.textAlign = 'left'
  y = bandTop + bandH + 70

  if (line) {
    ctx.font = font(600, 34)
    ctx.fillStyle = C.ink
    for (const l of wrap(ctx, line, W - PAD * 2, 3)) {
      ctx.fillText(l, PAD, y)
      y += 46
    }
    y += 34
  }

  // Each exercise with its set count and best set. PBs first, in gold; the rest in the order done.
  const byEx = new Map<string, CardWorkout['sets']>()
  for (const s of w.sets) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s])
  const all = [...byEx].sort(([a], [b]) => Number(pbs.includes(b)) - Number(pbs.includes(a))) // stable: done order kept within each group
  const room = H - 180 - y // down to just above the footer rule
  const best = (sets: CardWorkout['sets']) => sets.reduce((b, s) => ((s.weight_kg ?? 0) > (b.weight_kg ?? 0) || ((s.weight_kg ?? 0) === (b.weight_kg ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b))
  const detail = (sets: CardWorkout['sets']) => `${plural(sets.length, 'set')} · ${setText(best(sets), sets[0].exercise)}`
  if (all.length * 44 <= room) {
    // One column, name left and sets right, rows as roomy as fit (44–64px).
    const rowH = Math.min(64, room / all.length)
    for (const [name, sets] of all) {
      const pb = pbs.includes(name)
      const right = detail(sets)
      ctx.font = font(500, Math.round(rowH * 0.52))
      ctx.fillStyle = pb ? C.pb : C.muted
      ctx.textAlign = 'right'
      ctx.fillText(right, W - PAD, y)
      const rw = ctx.measureText(right).width
      ctx.textAlign = 'left'
      ctx.fillStyle = pb ? C.pb : C.ink
      ctx.font = font(pb ? 700 : 600, Math.round(rowH * 0.58))
      ctx.fillText(fit(ctx, `${pb ? '🏆 ' : ''}${name}`, W - PAD * 2 - rw - 30), PAD, y)
      y += rowH
    }
  } else {
    // Too many for one readable column: two columns, each exercise as its name with the sets underneath.
    const gap = 40, colW = (W - PAD * 2 - gap) / 2
    const cellH = Math.max(50, Math.min(84, room / Math.ceil(all.length / 2)))
    const perCol = Math.min(Math.floor(room / cellH), Math.ceil(all.length / 2))
    const shown = all.length > perCol * 2 ? perCol * 2 - 1 : all.length // the last cell says "+N more"
    const at = (i: number) => [PAD + (i < perCol ? 0 : colW + gap), y + (i % perCol) * cellH] // down the left column, then the right
    all.slice(0, shown).forEach(([name, sets], i) => {
      const pb = pbs.includes(name)
      const [x, cy] = at(i)
      ctx.fillStyle = pb ? C.pb : C.ink
      ctx.font = font(pb ? 700 : 600, Math.round(cellH * 0.4))
      ctx.fillText(fit(ctx, `${pb ? '🏆 ' : ''}${name}`, colW), x, cy)
      ctx.fillStyle = pb ? C.pb : C.muted
      ctx.font = font(500, Math.round(cellH * 0.32))
      ctx.fillText(fit(ctx, detail(sets), colW), x, cy + cellH * 0.4)
    })
    if (all.length > shown) {
      const [x, cy] = at(shown)
      ctx.fillStyle = C.muted
      ctx.font = font(500, Math.round(cellH * 0.36))
      ctx.fillText(`+ ${plural(all.length - shown, 'more exercise')}`, x, cy + cellH * 0.2)
    }
  }

  ctx.fillStyle = C.line
  ctx.fillRect(PAD, H - 130, W - PAD * 2, 2)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 30)
  ctx.fillText('Lift. Run. Repeat.', PAD, H - 75)
  return canvas
}

/** The card as a PNG file. Made ahead of the tap: iOS only lets navigator.share run straight off a tap, not after awaits. */
export async function cardFile(w: CardWorkout, pbs: string[], line?: string, look: Look = 'full') {
  await Promise.all([document.fonts?.load(font(800, 96)).catch(() => {}), loadLogo()])
  const blob = await new Promise<Blob | null>(r => drawCard(w, pbs, line, look).toBlob(r, 'image/png'))
  if (!blob) throw new Error("Couldn't make the picture")
  return new File([blob], `reprun-${w.date}${look === 'full' ? '' : `-${look}`}.png`, { type: 'image/png' })
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
