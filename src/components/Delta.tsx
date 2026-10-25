import { C, FONT, border } from '@/lib/theme'

/**
 * A gain/loss figure: the number is always white, and a colored arrow
 * (▲ green / ▼ red) carries the direction. The sign is dropped from the
 * text since the arrow already says it — `format` receives the absolute
 * value.
 *
 *   <Delta value={-1.23} format={v => `${v.toFixed(2)}%`} />   →  ▼ 1.23%
 *   <Delta value={4.5} format={v => `$${v.toFixed(2)}`} badge />
 */
export default function Delta({
  value, format, size = 12, badge = false, weight = 400,
}: {
  value: number | null | undefined
  format: (absValue: number) => string
  size?: number
  badge?: boolean
  weight?: number
}) {
  const isNum = value !== null && value !== undefined && !Number.isNaN(value)
  const arrow = !isNum ? null : value > 0 ? '▲' : value < 0 ? '▼' : '◆'
  const arrowColor = !isNum ? C.dim : value > 0 ? C.up : value < 0 ? C.down : C.muted

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.35),
      fontFamily: FONT.mono, fontSize: size, fontWeight: weight, color: C.number,
      whiteSpace: 'nowrap', lineHeight: 1.2,
      ...(badge ? { backgroundColor: C.inset, border, padding: '2px 7px', height: 'fit-content' } : {}),
    }}>
      {arrow && (
        <span aria-label={value! > 0 ? 'up' : value! < 0 ? 'down' : 'unchanged'} style={{
          color: arrowColor, fontSize: Math.round(size * 0.72), lineHeight: 1,
        }}>{arrow}</span>
      )}
      {isNum ? format(Math.abs(value)) : '—'}
    </span>
  )
}
