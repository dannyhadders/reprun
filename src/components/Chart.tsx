import { Chart as ChartJS, registerables, type ChartConfiguration, type ScriptableContext } from 'chart.js'
import { useEffect, useRef } from 'react'

ChartJS.register(...registerables)
ChartJS.defaults.color = '#8b93a7'
ChartJS.defaults.borderColor = '#242a38'
ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif'
ChartJS.defaults.plugins.legend.display = false
ChartJS.defaults.plugins.tooltip.backgroundColor = '#1a1f2b'
ChartJS.defaults.plugins.tooltip.borderColor = '#242a38'
ChartJS.defaults.plugins.tooltip.borderWidth = 1
ChartJS.defaults.plugins.tooltip.padding = 10
ChartJS.defaults.maintainAspectRatio = false
if (matchMedia('(prefers-reduced-motion: reduce)').matches) ChartJS.defaults.animation = false

export const ACCENT = '#818cf8'
export const ACCENT_2 = '#22d3ee'
export const STRAVA = '#fc4c02'

/** Indigo -> cyan stroke, matching the site. */
export const gradientStroke = (ctx: ScriptableContext<'line'>) => {
  const { chart } = ctx
  if (!chart.chartArea) return ACCENT
  const g = chart.ctx.createLinearGradient(chart.chartArea.left, 0, chart.chartArea.right, 0)
  g.addColorStop(0, ACCENT)
  g.addColorStop(1, ACCENT_2)
  return g
}
export const gradientFill = (ctx: ScriptableContext<'line'>) => {
  const { chart } = ctx
  if (!chart.chartArea) return 'transparent'
  const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom)
  g.addColorStop(0, 'rgba(129,140,248,0.25)')
  g.addColorStop(1, 'rgba(34,211,238,0)')
  return g
}

/** Thin Chart.js wrapper. Pass a memoised config; a new config object rebuilds the chart. */
export function Chart({ config, height = 220, label }: { config: ChartConfiguration; height?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = new ChartJS(ref.current!, config)
    return () => c.destroy()
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
