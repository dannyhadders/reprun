import { Chart as ChartJS, registerables, type ChartConfiguration, type ScriptableContext } from 'chart.js'
import { useEffect, useRef } from 'react'
import { getTheme } from '../lib/theme'

ChartJS.register(...registerables)
ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif'
ChartJS.defaults.plugins.legend.display = false
ChartJS.defaults.plugins.tooltip.borderWidth = 1
ChartJS.defaults.plugins.tooltip.padding = 10
ChartJS.defaults.maintainAspectRatio = false
if (matchMedia('(prefers-reduced-motion: reduce)').matches) ChartJS.defaults.animation = false

// The chart colours per theme: index.css's tokens again, because WebKit can draw a chart before the stylesheet loads.
const THEMES = {
  dark: { accent: '#818cf8', accent2: '#22d3ee', strava: '#fc4c02', line: '#242a38', ink: '#e8eaf0', muted: '#8b93a7', surface2: '#1a1f2b' },
  light: { accent: '#4f46e5', accent2: '#0e7490', strava: '#c2410c', line: '#dfe2ea', ink: '#12151d', muted: '#596175', surface2: '#eceef4' },
}
/** This theme's chart colours. Read when a config is built, so a theme change shows on the next page. */
export const C = () => THEMES[getTheme()]
function themeCharts() {
  const d = ChartJS.defaults, t = d.plugins.tooltip
  d.color = C().muted; d.borderColor = C().line
  t.backgroundColor = C().surface2; t.borderColor = C().line; t.titleColor = t.bodyColor = C().ink
}

/** Indigo -> cyan stroke, matching the site. */
export const gradientStroke = (ctx: ScriptableContext<'line'>) => {
  const { chart } = ctx
  if (!chart.chartArea) return C().accent
  const g = chart.ctx.createLinearGradient(chart.chartArea.left, 0, chart.chartArea.right, 0)
  g.addColorStop(0, C().accent)
  g.addColorStop(1, C().accent2)
  return g
}
export const gradientFill = (ctx: ScriptableContext<'line'>) => {
  const { chart } = ctx
  if (!chart.chartArea) return 'transparent'
  const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom)
  g.addColorStop(0, C().accent + '40')
  g.addColorStop(1, C().accent2 + '00')
  return g
}

/** Thin Chart.js wrapper. Pass a memoised config; a new config object rebuilds the chart. */
export function Chart({ config, height = 220, label }: { config: ChartConfiguration; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    themeCharts()
    const c = new ChartJS(ref.current!, config)
    // Measure again once the page has laid out: built while the intro was closing, a chart measured the whole 393px
    // phone instead of its card and kept it (Chart.js only re-measures when its box changes size).
    const f = requestAnimationFrame(() => c.resize())
    return () => (cancelAnimationFrame(f), c.destroy())
  }, [config])
  return (
    <div style={{ height }} className="relative w-full">
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  )
}

/** Tiny line, no axes, for list rows. */
export function sparkConfig(values: number[]): ChartConfiguration {
  return {
    type: 'line',
    data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: gradientStroke, borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true, backgroundColor: gradientFill }] },
    options: { animation: false, plugins: { tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, events: [] },
  }
}
