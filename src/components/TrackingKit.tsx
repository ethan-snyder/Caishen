// Shared building blocks for the tracking pages (Portfolio, Watchlist):
// configurable metric columns, small charts, panels and formatters.

import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { formatLargeNum as baseFormatLargeNum, fmtDate } from '@/lib/format'
import { C, FONT, border, goldA, purpleA } from '@/lib/theme'
import { AxisLabels, GridLines } from './ChartGrid'

// ---------------------------------------------------------------------
// Formatters (null-safe; "—" for missing)
// ---------------------------------------------------------------------

const dash = '—'
const isNum = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v)

export function fmtMoney(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return dash
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function fmtSignedMoney(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return dash
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** Value already in percent units (0.75 -> "0.75%"). */
export function fmtPct(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? `${v.toFixed(decimals)}%` : dash
}

export function fmtSignedPct(v: number | null | undefined, decimals = 2): string {
  return isNum(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%` : dash
}

/** Ratios (P/E etc.). Non-positive P/E is meaningless, so it shows "—". */
export function fmtRatio(v: number | null | undefined, decimals = 1): string {
  return isNum(v) && v > 0 ? v.toFixed(decimals) : dash
}

export function formatLargeNum(v: number | null | undefined, prefix = ''): string {
  return baseFormatLargeNum(v ?? null, prefix)
}

// ---------------------------------------------------------------------
// Configurable metric columns
// ---------------------------------------------------------------------

export interface MetricDef<T> {
  id: string
  /** Long name, used in the picker. */
  label: string
  /** Column header. */
  short: string
  get: (row: T) => number | null
  format: (value: number | null, row: T) => string
  /** Gain/loss metric -- colored green/red by sign. */
  signed?: boolean
  /** Shown before the user has customized anything. */
  defaultOn?: boolean
}

/** Which metric columns are on, saved per page in localStorage. */
export function useMetricConfig<T>(storageKey: string, metrics: MetricDef<T>[]) {
  const defaults = useMemo(() => metrics.filter(m => m.defaultOn).map(m => m.id), [metrics])
  const [enabled, setEnabled] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const ids = JSON.parse(raw)
        if (Array.isArray(ids)) return ids.filter((x: unknown) => typeof x === 'string')
      }
    } catch { /* storage unavailable */ }
    return defaults
  })

  const persist = useCallback((ids: string[]) => {
    setEnabled(ids)
    try { localStorage.setItem(storageKey, JSON.stringify(ids)) } catch { /* ignore */ }
  }, [storageKey])

  const toggle = useCallback((id: string) => {
    persist(enabled.includes(id) ? enabled.filter(x => x !== id) : [...enabled, id])
  }, [enabled, persist])

  const reset = useCallback(() => {
    setEnabled(defaults)
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
  }, [defaults, storageKey])

  // Columns always render in the definition order, whatever order they
  // were switched on in -- the table shouldn't reshuffle as you click.
  const active = useMemo(() => metrics.filter(m => enabled.includes(m.id)), [metrics, enabled])

  return { active, enabled, toggle, reset }
}

export function MetricPicker<T>({ metrics, enabled, onToggle, onReset }: {
  metrics: MetricDef<T>[]
  enabled: string[]
  onToggle: (id: string) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: FONT.terminal, fontSize: 13, letterSpacing: '0.06em', cursor: 'pointer',
          color: open ? C.gold : C.textSoft, background: open ? purpleA(0.35) : 'transparent',
          border: `1px solid ${open ? goldA(0.4) : goldA(0.18)}`, padding: '4px 12px',
        }}
      >
        {open ? '▾' : '▸'} COLUMNS ({enabled.length}/{metrics.length})
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '10px 12px', backgroundColor: C.card, border,
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        }}>
          {metrics.map(m => {
            const on = enabled.includes(m.id)
            return (
              <button
                key={m.id} type="button" onClick={() => onToggle(m.id)}
                aria-pressed={on}
                style={{
                  fontFamily: FONT.mono, fontSize: 12, cursor: 'pointer',
                  color: on ? C.gold : C.muted,
                  background: on ? purpleA(0.35) : 'transparent',
                  border: `1px solid ${on ? goldA(0.4) : goldA(0.12)}`, padding: '3px 9px',
                }}
              >
                {on ? '■' : '□'} {m.label}
              </button>
            )
          })}
          <button
            type="button" onClick={onReset}
            style={{
              fontFamily: FONT.mono, fontSize: 12, cursor: 'pointer', marginLeft: 'auto',
              color: C.muted, background: 'transparent', border: 'none', textDecoration: 'underline',
            }}
          >
            reset to defaults
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------

/** ✕ that asks once ("sure?") before calling onConfirm. */
export function ConfirmRemove({ onConfirm, title }: { onConfirm: () => void; title: string }) {
  const [armed, setArmed] = useState(false)
  if (armed) {
    return (
      <span style={{ display: 'inline-flex', gap: 4 }} onMouseLeave={() => setArmed(false)}>
        <button
          type="button" onClick={onConfirm} title={`Remove ${title}`}
          style={{
            fontFamily: FONT.mono, fontSize: 11, color: C.down, cursor: 'pointer',
            background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.35)', padding: '2px 6px',
          }}
        >
          SURE?
        </button>
      </span>
    )
  }
  return (
    <button
      type="button" onClick={() => setArmed(true)} title={`Remove ${title}`} aria-label={`Remove ${title}`}
      style={{
        fontFamily: FONT.mono, fontSize: 14, color: C.dim, cursor: 'pointer',
        background: 'transparent', border: 'none', padding: '4px 8px',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = C.down)}
      onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
    >
      ✕
    </button>
  )
}

// ---------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------

/** Titled card. A leading "///" in the title (the old terminal section
 * marker) renders as the Moneta ◆ instead. */
export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const clean = title.replace(/^\/\/\/\s*/, '')
  return (
    <div style={{ backgroundColor: C.card, border, padding: '16px 18px', marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontFamily: FONT.display, fontSize: 14, fontWeight: 600, color: C.gold,
          letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.35)',
        }}>
          <span style={{ color: C.purpleBright, fontSize: 10 }}>◆</span>
          {clean}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function RangeButtons<K extends string>({ ranges, value, onChange }: {
  ranges: { key: K; label: string }[]
  value: K
  onChange: (k: K) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {ranges.map(r => {
        const on = r.key === value
        return (
          <button
            key={r.key} type="button" onClick={() => onChange(r.key)}
            style={{
              fontFamily: FONT.terminal, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer',
              color: on ? C.gold : C.muted,
              background: on ? purpleA(0.35) : 'transparent',
              border: `1px solid ${on ? goldA(0.4) : goldA(0.12)}`, padding: '3px 9px',
            }}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

export function DetailStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ backgroundColor: C.inset, border, padding: '8px 10px' }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, letterSpacing: '0.1em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 600, color: color ?? C.number }}>
        {value}
      </div>
    </div>
  )
}

/** Labeled horizontal bar, scaled to `max`. */
export function BarRow({ label, value, max, color, valueLabel }: {
  label: string; value: number; max: number; color: string; valueLabel: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
      <span style={{
        fontFamily: FONT.mono, fontSize: 13, color: C.textSoft,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={label}>
        {label}
      </span>
      <div style={{ height: 8, backgroundColor: goldA(0.06) }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, opacity: 0.85, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.number, textAlign: 'right' }}>{valueLabel}</span>
    </div>
  )
}

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------

function chartDate(iso: string, intraday: boolean) {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return intraday
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : fmtDate(d)
}

/** Value-over-time line with optional horizontal reference (cost basis). */
export function LineChart({ points, intraday = false, refLine, refLabel, formatValue, height = 200, detailed = false }: {
  points: { date: string; value: number }[]
  intraday?: boolean
  refLine?: number | null
  refLabel?: string
  formatValue: (v: number) => string
  height?: number
  /** Denser y-axis (9 labelled gridlines) and 5 date labels instead of 2. */
  detailed?: boolean
}) {
  const ticks = detailed ? 9 : 5
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) {
    return (
      <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted, padding: '30px 0', textAlign: 'center' }}>
        {'// not enough history to chart'}
      </div>
    )
  }
  const values = points.map(p => p.value)
  const lo = Math.min(...values, ...(refLine ? [refLine] : []))
  const hi = Math.max(...values, ...(refLine ? [refLine] : []))
  const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.01 || 1
  const min = lo - pad
  const max = hi + pad
  const w = 600
  const h = height
  const xAt = (i: number) => (i / (points.length - 1)) * w
  const yAt = (v: number) => h - ((v - min) / (max - min)) * h
  const coords = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')
  const up = points[points.length - 1].value >= points[0].value
  const color = up ? C.up : C.down

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }
  const hp = hover !== null ? points[hover] : null
  const tipPct = hover !== null ? (xAt(hover) / w) * 100 : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10 }}>
        <AxisLabels min={min} max={max} height={h} minWidth={72} format={formatValue} ticks={ticks} />
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}
            style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          >
            <GridLines w={w} h={h} ticks={ticks} />
            <defs>
              <linearGradient id={`tk-fill-${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#tk-fill-${up ? 'u' : 'd'})`} />
            {refLine ? (
              <line x1={0} x2={w} y1={yAt(refLine)} y2={yAt(refLine)}
                stroke={C.gold} strokeDasharray="5,4" strokeWidth={1} opacity={0.7} vectorEffect="non-scaling-stroke" />
            ) : null}
            <polyline points={coords} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <line x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={h}
                stroke={color} strokeDasharray="2,2" strokeWidth={0.75} opacity={0.5} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {refLine && refLabel ? (
            <div style={{
              position: 'absolute', right: 4, top: `${(yAt(refLine) / h) * 100}%`, transform: 'translateY(-115%)',
              fontFamily: FONT.mono, fontSize: 11, color: C.gold, pointerEvents: 'none',
            }}>
              {refLabel}
            </div>
          ) : null}
          {hp && (
            <div style={{
              position: 'absolute', top: -6, left: `${tipPct}%`,
              transform: tipPct > 65 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: C.tooltip, border: `1px solid ${color}`, padding: '4px 9px',
              fontFamily: FONT.mono, fontSize: 13, color: C.number, whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 5,
            }}>
              <div style={{ fontWeight: 600 }}>{formatValue(hp.value)}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{chartDate(hp.date, intraday)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 82, marginTop: 6,
        fontFamily: FONT.mono, fontSize: 12, color: C.dim,
      }}>
        {(detailed ? [0, 0.25, 0.5, 0.75, 1] : [0, 1]).map(f => (
          <span key={f}>{chartDate(points[Math.round(f * (points.length - 1))].date, intraday)}</span>
        ))}
      </div>
    </div>
  )
}

export interface PieSlice {
  key: string
  label: string
  value: number
  color: string
}

/** Donut chart; clicking a slice selects it. Center shows the selection. */
export function PieChart({ slices, selected, onSelect, size = 240 }: {
  slices: PieSlice[]
  selected: string | null
  onSelect: (key: string) => void
  size?: number
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const r = size / 2
  const outer = r - 6
  const inner = outer * 0.58
  if (!total) return null

  const arc = (a0: number, a1: number, ro: number, ri: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, rad: number) => `${(r + rad * Math.sin(a)).toFixed(2)},${(r - rad * Math.cos(a)).toFixed(2)}`
    return `M${p(a0, ro)} A${ro},${ro} 0 ${large} 1 ${p(a1, ro)} L${p(a1, ri)} A${ri},${ri} 0 ${large} 0 ${p(a0, ri)} Z`
  }

  let a = 0
  const sel = slices.find(s => s.key === selected) ?? null
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Allocation donut">
      {slices.map(s => {
        const frac = Math.max(0, s.value) / total
        // A single 100% slice can't be drawn as one arc -- nudge it shy of 2π.
        const a1 = a + Math.min(frac * Math.PI * 2, Math.PI * 2 - 1e-4)
        const isSel = s.key === selected
        const d = arc(a, a1, isSel ? outer + 4 : outer, inner)
        a = a1
        return (
          <path
            key={s.key} d={d} fill={s.color}
            opacity={selected && !isSel ? 0.55 : 0.92}
            stroke={C.card} strokeWidth={1.5}
            style={{ cursor: 'pointer', transition: 'opacity 0.12s' }}
            onClick={() => onSelect(s.key)}
          >
            <title>{`${s.label} — ${((frac) * 100).toFixed(1)}%`}</title>
          </path>
        )
      })}
      {sel && (
        <>
          <text x={r} y={r - 4} textAnchor="middle" fill={sel.color}
            style={{ fontFamily: FONT.terminal, fontSize: 18 }}>{sel.label}</text>
          <text x={r} y={r + 18} textAnchor="middle" fill={C.number}
            style={{ fontFamily: FONT.mono, fontSize: 14 }}>{((sel.value / total) * 100).toFixed(1)}%</text>
        </>
      )}
    </svg>
  )
}
