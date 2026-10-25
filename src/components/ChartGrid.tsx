// Shared y-axis + gridlines for every hand-rolled SVG line chart.
//
// Both use the same tick fractions, so labels line up with the lines they
// describe. AxisLabels sits in an HTML column beside the SVG (text in a
// preserveAspectRatio="none" SVG would stretch); GridLines draws inside the
// chart's own viewBox.

import { goldA } from '@/lib/theme'

/** 0 = top (max), 1 = bottom (min). Five ticks: max, 3 between, min. */
const TICKS = [0, 0.25, 0.5, 0.75, 1]

export function AxisLabels({
  min, max, height, minWidth = 56, format,
}: {
  min: number
  max: number
  height: number
  minWidth?: number
  format: (v: number) => string
}) {
  // A flat series has one meaningful value -- print it once, not five times.
  const ticks = max === min ? [0] : TICKS
  return (
    <div style={{
      position: 'relative', height, minWidth, flexShrink: 0,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: '11px',
      color: '#8C7A9E', textAlign: 'right', whiteSpace: 'nowrap',
    }}>
      {ticks.map(f => {
        const v = max - (max - min) * f
        return (
          <span key={f} style={{
            position: 'absolute', right: 0, top: f * height,
            // Ends sit inside the box rather than straddling its edge.
            transform: `translateY(${f === 0 ? '0' : f === 1 ? '-100%' : '-50%'})`,
          }}>
            {format(v)}
          </span>
        )
      })}
    </div>
  )
}

export function GridLines({ w, h }: { w: number; h: number }) {
  return (
    <g aria-hidden="true">
      {TICKS.map(f => (
        <line
          key={f}
          x1={0} x2={w} y1={f * h} y2={f * h}
          stroke={goldA(f === 1 ? 0.18 : 0.07)}
          strokeWidth={1}
          strokeDasharray={f === 1 ? undefined : '3,4'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}
