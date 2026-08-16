import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { fetchMarket, type MarketData, type SentimentSeriesPoint } from '@/lib/api'
import { formatPct, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'

// ----------------------------------------------------------------------
// Fear & Greed
// ----------------------------------------------------------------------

// CNN's five bands. Kept as one table so the gauge arc, the needle colour
// and the text label can never disagree about where a boundary sits.
const FG_BANDS = [
  { from: 0,  to: 25,  label: 'EXTREME FEAR',  color: '#FF3B3B' },
  { from: 25, to: 45,  label: 'FEAR',          color: '#FF8C00' },
  { from: 45, to: 55,  label: 'NEUTRAL',       color: '#FFD700' },
  { from: 55, to: 75,  label: 'GREED',         color: '#00FF88' },
  { from: 75, to: 100, label: 'EXTREME GREED', color: '#00E5FF' },
]

function fgBand(value: number) {
  return FG_BANDS.find(b => value <= b.to) ?? FG_BANDS[FG_BANDS.length - 1]
}

// Dial geometry. Everything below is derived from these -- no hand-placed
// coordinates -- so the needle, the lit band and the tick labels can't
// drift out of agreement.
const D = {
  cx: 200, cy: 198,
  ri: 116, ro: 168,      // band ring inner/outer radius
  rLabel: 143,           // band name runs along this arc
  rOuterLabel: 182,      // ...unless the band is too narrow to hold it
  rNum: 99, rDot: 86,    // tick numbers / tick dots
  rNeedle: 108,
  hubY: 216, hubR: 37,   // readout bubble, sits low like CNN's
  gap: 0.7,              // gap between bands, in index units
}

/**
 * A curved label only fits if the band's arc is longer than the text.
 * NEUTRAL spans just 10 index units (~18deg, ~45px of arc), which clips
 * mid-word -- those bands get a horizontal label outside the ring instead,
 * which is what CNN does with the same band.
 */
function bandLabelFits(from: number, to: number, text: string, fontSize: number) {
  const arcLen = ((to - from) / 100) * Math.PI * D.rLabel
  // Monospace advance is ~0.6em, plus the 0.14em tracking applied below.
  return text.length * fontSize * 0.74 <= arcLen
}

/** 0 -> PI (left), 100 -> 0 (right). SVG y grows downward, hence the flip. */
function dialPoint(v: number, radius: number) {
  const a = Math.PI * (1 - v / 100)
  return [D.cx + radius * Math.cos(a), D.cy - radius * Math.sin(a)] as const
}

/** Arc from v0 to v1 at one radius, travelling left -> right over the top. */
function dialArc(v0: number, v1: number, radius: number) {
  const [x0, y0] = dialPoint(v0, radius)
  const [x1, y1] = dialPoint(v1, radius)
  return `M ${x0.toFixed(2)},${y0.toFixed(2)} A ${radius},${radius} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

/** Filled ring segment: out along the outer radius, back along the inner. */
function dialSegment(v0: number, v1: number) {
  const [x1i, y1i] = dialPoint(v1, D.ri)
  const [x0i, y0i] = dialPoint(v0, D.ri)
  return `${dialArc(v0, v1, D.ro)} L ${x1i.toFixed(2)},${y1i.toFixed(2)} A ${D.ri},${D.ri} 0 0 0 ${x0i.toFixed(2)},${y0i.toFixed(2)} Z`
}

/**
 * Moving-average lines sit deliberately outside the five band colours.
 * Using a band colour here collides whenever the indicator happens to be in
 * that band -- Market Volatility at NEUTRAL drew both the VIX and its
 * 50-day average in the same gold, so the two lines were indistinguishable.
 */
const MA_LINE_COLOR = '#9D8CFF'

// Longer names need to fit inside narrower slices, so size per band.
const FG_LABEL_SIZE: Record<string, number> = {
  'EXTREME FEAR': 11, FEAR: 13, NEUTRAL: 9, GREED: 13, 'EXTREME GREED': 11,
}

/**
 * CNN-style segmented dial, rendered in the terminal's phosphor palette:
 * band names curve along the ring, the live band is lit while the rest sit
 * back as dim outlines, and the reading drops into a bubble at the pivot.
 */
function FearGreedGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const band = fgBand(clamped)

  // Needle as a tapered wedge from the pivot; the hub is drawn over its
  // base so the tail disappears behind the readout bubble.
  const a = Math.PI * (1 - clamped / 100)
  const [tipX, tipY] = dialPoint(clamped, D.rNeedle)
  const perp = a + Math.PI / 2
  const hw = 5.5
  const bx = hw * Math.cos(perp)
  const by = hw * Math.sin(perp)
  const needle = [
    `${tipX.toFixed(2)},${tipY.toFixed(2)}`,
    `${(D.cx + bx).toFixed(2)},${(D.cy - by).toFixed(2)}`,
    `${(D.cx - bx).toFixed(2)},${(D.cy + by).toFixed(2)}`,
  ].join(' ')

  return (
    <svg viewBox="0 0 400 262" width="100%" style={{ display: 'block', margin: '0 auto', maxWidth: 420 }}>
      <defs>
        {FG_BANDS.map(b => (
          <path
            key={b.label}
            id={`fg-lbl-${b.from}`}
            d={dialArc(
              b.from === 0 ? D.gap : b.from + D.gap,
              b.to === 100 ? 100 - D.gap : b.to - D.gap,
              D.rLabel,
            )}
            fill="none"
          />
        ))}
      </defs>

      {FG_BANDS.map(b => {
        const live = b.label === band.label
        const v0 = b.from === 0 ? D.gap : b.from + D.gap
        const v1 = b.to === 100 ? 100 - D.gap : b.to - D.gap
        const size = FG_LABEL_SIZE[b.label] ?? 12
        const fits = bandLabelFits(v0, v1, b.label, size)
        const [ox, oy] = dialPoint((b.from + b.to) / 2, D.rOuterLabel)
        const labelStyle = {
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: size,
          letterSpacing: '0.14em',
          filter: live ? `drop-shadow(0 0 6px ${b.color})` : undefined,
        }
        return (
          <g key={b.label}>
            <path
              d={dialSegment(v0, v1)}
              fill={b.color}
              fillOpacity={live ? 0.22 : 0.05}
              stroke={b.color}
              strokeOpacity={live ? 1 : 0.22}
              strokeWidth={live ? 1.75 : 1}
              style={live ? { filter: `drop-shadow(0 0 7px ${b.color}aa)` } : undefined}
            />
            {fits ? (
              <text fill={live ? b.color : '#2D6644'} style={labelStyle}>
                <textPath href={`#fg-lbl-${b.from}`} startOffset="50%" textAnchor="middle">
                  {b.label}
                </textPath>
              </text>
            ) : (
              <text
                x={ox} y={oy} textAnchor="middle" dominantBaseline="central"
                fill={live ? b.color : '#2D6644'} style={labelStyle}
              >
                {b.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Tick dots every 5, numbers on the quarters. */}
      {Array.from({ length: 21 }, (_, i) => i * 5)
        .filter(v => v % 25 !== 0)
        .map(v => {
          const [x, y] = dialPoint(v, D.rDot)
          return <circle key={v} cx={x} cy={y} r={1.4} fill="#1D4A30" />
        })}
      {[0, 25, 50, 75, 100].map(v => {
        const [x, y] = dialPoint(v, D.rNum)
        return (
          <text
            key={v} x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#2D6644"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
          >
            {v}
          </text>
        )
      })}

      <polygon points={needle} fill={band.color} style={{ filter: `drop-shadow(0 0 5px ${band.color})` }} />

      <circle
        cx={D.cx} cy={D.hubY} r={D.hubR}
        fill="#060E18" stroke={band.color} strokeOpacity={0.55} strokeWidth={1.5}
      />
      <text
        x={D.cx} y={D.hubY} textAnchor="middle" dominantBaseline="central" fill={band.color}
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 34, fontWeight: 600,
          filter: `drop-shadow(0 0 9px ${band.color}bb)`,
        }}
      >
        {Math.round(clamped)}
      </text>
    </svg>
  )
}

/**
 * Renders an indicator's raw reading the way that measure is actually
 * quoted -- a percentage, a ratio, or an index level -- rather than
 * flattening everything to CNN's 0-100 score.
 */
function fgUnitFormat(unit: 'pct' | 'ratio' | 'level') {
  if (unit === 'pct') return (v: number) => `${v.toFixed(2)}%`
  if (unit === 'ratio') return (v: number) => v.toFixed(2)
  return (v: number) =>
    v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })
}

/** One "PREVIOUS CLOSE / 41.1 fear" row beside the gauge. */
function PreviousReading({ label, value }: { label: string; value: number | null }) {
  const band = value !== null ? fgBand(value) : null
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(0,255,136,0.07)',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: band?.color ?? '#1D4A30' }}>
          {value !== null ? value.toFixed(1) : '—'}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#2D6644', minWidth: 74, textAlign: 'right' }}>
          {band?.label ?? ''}
        </span>
      </span>
    </div>
  )
}

// ----------------------------------------------------------------------
// Put/call
// ----------------------------------------------------------------------

// Bar runs 0.4 -> 1.4. Zone edges match the bullish/bearish thresholds
// below, so the lit zone always contains the marker.
const PC_MIN = 0.4
const PC_MAX = 1.4
const PC_ZONES = [
  { id: 'bull', from: 0.4, to: 0.7, color: '#00FF88', label: 'BULLISH' },
  { id: 'neutral', from: 0.7, to: 1.0, color: '#FFD700', label: 'NEUTRAL' },
  { id: 'bear', from: 1.0, to: 1.4, color: '#FF3B3B', label: 'BEARISH' },
]

const pcPct = (v: number) => ((v - PC_MIN) / (PC_MAX - PC_MIN)) * 100

function putCallZone(ratio: number) {
  if (ratio < 0.7) return PC_ZONES[0]
  if (ratio > 1.0) return PC_ZONES[2]
  return PC_ZONES[1]
}

// ----------------------------------------------------------------------
// Shared chart
// ----------------------------------------------------------------------

function formatAxisDate(dateStr: string) {
  const dt = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return dateStr
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface ChartLine {
  label: string
  points: SentimentSeriesPoint[]
  color: string
  /** Moving averages render dashed and dimmer than the series they track. */
  dashed?: boolean
}

/**
 * Interactive line chart supporting one or more series on a shared scale:
 * y-axis min/max labels, x-axis start/end dates, and a mouse-tracked
 * crosshair + tooltip reading out every series at the hovered date.
 */
function LineChart({
  lines, zeroLine, format, height = 90,
}: {
  lines: ChartLine[]
  zeroLine?: boolean
  format: (v: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const drawn = lines.filter(l => l.points.length > 0)
  if (!drawn.length) return null

  // The longest series defines the x-axis. Others are matched to it *by
  // date*, not by array position -- a series and its moving average can
  // legitimately cover different numbers of days, and index-aligning them
  // would silently slide one line sideways against the other.
  const base = drawn.reduce((a, b) => (b.points.length > a.points.length ? b : a))
  const baseDates = base.points.map(p => p.date)
  const n = baseDates.length
  const byDate = drawn.map(l => new Map(l.points.map(p => [p.date, p.value])))

  const all = drawn.flatMap(l => l.points.map(p => p.value))
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1
  const w = 300
  const h = height
  const step = n > 1 ? w / (n - 1) : 0

  const xAt = (i: number) => i * step
  const yAt = (v: number) => h - ((v - min) / range) * h
  const zeroY = yAt(0)

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const idx = Math.round(frac * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, idx)))
  }

  const hoverDate = hover !== null ? base.points[hover]?.date ?? null : null
  const tooltipPct = hover !== null ? (xAt(hover) / w) * 100 : 0
  const multi = drawn.length > 1

  return (
    <div>
      {multi && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 6, marginLeft: 60, flexWrap: 'wrap' }}>
          {drawn.map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={16} height={4} style={{ overflow: 'visible' }}>
                <line
                  x1={0} y1={2} x2={16} y2={2} stroke={l.color} strokeWidth={2}
                  strokeDasharray={l.dashed ? '3,2' : undefined}
                  opacity={l.dashed ? 0.75 : 1}
                />
              </svg>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4DCC88' }}>{l.label}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a5a52',
          textAlign: 'right', minWidth: 52, flexShrink: 0,
        }}>
          <span>{format(max)}</span>
          <span>{format(min)}</span>
        </div>
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair', display: 'block', overflow: 'visible' }}
          >
            {zeroLine && zeroY >= 0 && zeroY <= h && (
              <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="#2D6644" strokeWidth={0.5} strokeDasharray="2,2" />
            )}
            {drawn.map((l, li) => (
              <polyline
                key={l.label}
                points={baseDates
                  .map((d, i) => {
                    const v = byDate[li].get(d)
                    return v === undefined ? null : `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`
                  })
                  .filter(Boolean)
                  .join(' ')}
                fill="none"
                stroke={l.color}
                strokeWidth={l.dashed ? 1 : 1.5}
                strokeDasharray={l.dashed ? '4,3' : undefined}
                opacity={l.dashed ? 0.6 : 0.85}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover !== null && (
              <>
                <line
                  x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h}
                  stroke={drawn[0].color} strokeWidth={0.75} strokeDasharray="2,2" opacity={0.5}
                />
                {drawn.map((l, li) => {
                  const v = byDate[li].get(baseDates[hover])
                  if (v === undefined) return null
                  return (
                    <circle
                      key={l.label} cx={xAt(hover)} cy={yAt(v)} r={3}
                      fill={l.color} stroke="#060E18" strokeWidth={1}
                    />
                  )
                })}
              </>
            )}
          </svg>
          {hover !== null && hoverDate && (
            <div style={{
              position: 'absolute', top: -6,
              left: `${tooltipPct}%`,
              transform: tooltipPct > 65 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: '#0A1420', border: `1px solid ${drawn[0].color}`, padding: '4px 8px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#C8FFD4',
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
            }}>
              {drawn.map((l, li) => {
                const v = byDate[li].get(baseDates[hover])
                if (v === undefined) return null
                return (
                  <div key={l.label} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                    {multi && <span style={{ color: '#4a5a52', fontSize: 9 }}>{l.label}</span>}
                    <span style={{ color: l.color, fontWeight: 600 }}>{format(v)}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: 9, color: '#4a5a52', marginTop: 1 }}>{formatAxisDate(hoverDate)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 60,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 4,
      }}>
        <span>{formatAxisDate(baseDates[0])}</span>
        <span>{formatAxisDate(baseDates[n - 1])}</span>
      </div>
    </div>
  )
}

/** Single-series convenience wrapper (macro cards, F&G trend). */
function SentimentChart({
  points, color, zeroLine, format, height = 90,
}: {
  points: SentimentSeriesPoint[]
  color: string
  zeroLine?: boolean
  format: (v: number) => string
  height?: number
}) {
  return (
    <LineChart
      lines={[{ label: '', points, color }]}
      zeroLine={zeroLine}
      format={format}
      height={height}
    />
  )
}

// ----------------------------------------------------------------------
// Macro (FRED / CFTC) cards
// ----------------------------------------------------------------------

interface SentimentCardConfig {
  key:
    | 'consumer_sentiment'
    | 'financial_stress'
    | 'high_yield_spread'
    | 'futures_positioning'
    | 'policy_uncertainty'
    | 'yield_curve_spread'
    | 'ig_credit_spread'
    | 'inflation_expectations'
  title: string
  source: string
  format: (v: number) => string
  color: (v: number) => string
  zeroLine?: boolean
}

const SENTIMENT_CARDS: SentimentCardConfig[] = [
  {
    key: 'consumer_sentiment',
    title: 'CONSUMER SENTIMENT',
    source: 'FRED · UMCSENT',
    format: v => v.toFixed(1),
    color: v => (v >= 80 ? '#00FF88' : v >= 60 ? '#FFD700' : '#FF3B3B'),
  },
  {
    key: 'financial_stress',
    title: 'FINANCIAL STRESS INDEX',
    source: 'FRED · STLFSI4',
    format: v => v.toFixed(2),
    color: v => (v <= -0.5 ? '#00FF88' : v <= 0.5 ? '#FFD700' : '#FF3B3B'),
    zeroLine: true,
  },
  {
    key: 'high_yield_spread',
    title: 'HY CREDIT SPREAD',
    source: 'FRED · BAMLH0A0HYM2',
    format: v => `${v.toFixed(2)}%`,
    color: v => (v <= 4 ? '#00FF88' : v <= 6 ? '#FFD700' : '#FF3B3B'),
  },
  {
    key: 'futures_positioning',
    title: 'S&P FUTURES POSITIONING',
    source: 'CFTC · Commitments of Traders',
    format: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% OI`,
    color: v => (v >= 0 ? '#00FF88' : '#FF3B3B'),
    zeroLine: true,
  },
  {
    key: 'policy_uncertainty',
    title: 'ECONOMIC POLICY UNCERTAINTY',
    source: 'FRED · USEPUINDXD',
    format: v => v.toFixed(1),
    color: v => (v <= 100 ? '#00FF88' : v <= 200 ? '#FFD700' : '#FF3B3B'),
  },
  {
    key: 'yield_curve_spread',
    title: '10Y-2Y TREASURY SPREAD',
    source: 'FRED · T10Y2Y',
    format: v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
    color: v => (v < 0 ? '#FF3B3B' : v < 0.5 ? '#FFD700' : '#00FF88'),
    zeroLine: true,
  },
  {
    key: 'ig_credit_spread',
    title: 'IG CREDIT SPREAD',
    source: 'FRED · BAMLC0A0CM',
    format: v => `${v.toFixed(2)}%`,
    color: v => (v <= 1.2 ? '#00FF88' : v <= 2 ? '#FFD700' : '#FF3B3B'),
  },
  {
    key: 'inflation_expectations',
    title: 'INFLATION EXPECTATIONS',
    source: 'FRED · MICH (UMich)',
    format: v => `${v.toFixed(1)}%`,
    color: v => (v <= 3 ? '#00FF88' : v <= 4.5 ? '#FFD700' : '#FF3B3B'),
  },
]

const MARKET_SECTIONS = [
  { id: 'indices', label: 'MAJOR INDICES' },
  { id: 'sentiment', label: 'SENTIMENT INDICATORS' },
  { id: 'macro', label: 'MACRO SENTIMENT' },
]

const SENTIMENT_TILES = [
  { id: 'fear_greed', label: 'CNN FEAR & GREED' },
  { id: 'put_call', label: 'CBOE PUT/CALL RATIO' },
]

const MACRO_TILE_ITEMS = SENTIMENT_CARDS.map(c => ({ id: c.key, label: c.title }))
const MACRO_CARDS_BY_KEY = new Map(SENTIMENT_CARDS.map(c => [c.key as string, c]))

// Last successful payload, kept outside the component so it survives
// unmounting. Switching tabs unmounts this page entirely (App.tsx keys the
// error boundary on the active tab), and /api/market is the slowest call
// in the app -- without this, every visit back to MARKET tore the board
// down to a loading state and waited on a fresh multi-second fetch, which
// read as the page "disappearing". Now a return visit paints the previous
// board instantly and refreshes underneath it.
let lastMarketData: MarketData | null = null
// Serialized form of whatever `lastMarketData` holds, so a refresh can be
// compared against what's already on screen without walking the object by
// hand. See the fetch effect for why that comparison matters.
let lastMarketJson: string | null = null

export default function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(lastMarketData)
  const [error, setError] = useState<string | null>(null)
  const [fgExpanded, setFgExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Bumped by the RETRY button to re-run the fetch effect.
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setRefreshing(true)
    // Note what's *not* here: setData(null). Clearing first is the
    // intuitive thing to write, but it means any refresh blanks a board
    // that's already perfectly readable. Stale numbers stay up until real
    // ones replace them.
    fetchMarket()
      .then(fresh => {
        lastMarketData = fresh
        if (cancelled) return

        // The important part: if the payload is byte-identical to what's
        // already rendered, don't call setData at all.
        //
        // This board is a large tree -- two dozen index tiles plus several
        // inline SVG charts. Handing React a new object identity makes it
        // re-render and repaint all of it, which is visible as a flash even
        // though not one number on screen actually changed. And identical
        // payloads are now the *common* case, because the backend caches
        // /api/market: revisiting the tab inside the cache window returns
        // exactly what's already displayed.
        //
        // Skipping the state update makes those refreshes completely inert.
        // When something genuinely did move, the update goes through as
        // normal and React's reconciliation touches only the nodes whose
        // values differ -- numbers and charts change, the page around them
        // doesn't.
        const json = JSON.stringify(fresh)
        if (json === lastMarketJson) return
        lastMarketJson = json
        setData(fresh)
      })
      .catch(e => {
        // A failed refresh with data already on screen is a non-event --
        // keep showing it rather than replacing a working board with an
        // error. The error surfaces only when there's nothing to show.
        if (!cancelled && !lastMarketData) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => { cancelled = true }
  }, [reloadNonce])

  const pc = data?.put_call_ratio ?? null
  const pcZone = pc !== null ? putCallZone(pc) : null
  const fg = data?.fear_greed
  const sentiment = data?.sentiment

  const sections = useSortableLayout('market.sections', MARKET_SECTIONS)
  // Index tiles are keyed by symbol, which is stable across reloads. The
  // long tail of optional indexes ships hidden -- available in the edit
  // tray, off the board until asked for.
  // Keyed on the tile *identities* rather than the payload, so this array
  // keeps a stable reference when only prices moved. useSortableLayout
  // memoizes off it, and a fresh array on every refresh would pointlessly
  // recompute order/visibility for a set of tiles that hasn't changed.
  const indexKey = (data?.indexes ?? [])
    .map(i => `${i.symbol}:${i.default_hidden ? 1 : 0}`).join(',')
  const indexItems = useMemo(
    () => (data?.indexes ?? []).map(i => ({
      id: i.symbol,
      label: i.name,
      defaultHidden: i.default_hidden,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indexKey],
  )
  const indexTiles = useSortableLayout('market.indices', indexItems)
  const sentimentTiles = useSortableLayout('market.sentiment', SENTIMENT_TILES)
  const macroTiles = useSortableLayout('market.macro', MACRO_TILE_ITEMS)

  const indexBySymbol = useMemo(
    () => new Map((data?.indexes ?? []).map(i => [i.symbol, i])),
    [data?.indexes],
  )

  const fgBandNow = fg?.score != null ? fgBand(fg.score) : null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <span style={{
          fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4',
          letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)',
        }}>MARKET OVERVIEW</span>
        {/* Refreshes no longer change the page, which is the point -- but
            that also means there's no longer any sign one is happening.
            This is that sign, deliberately small enough to ignore. */}
        {refreshing && data && (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: '#2D6644', letterSpacing: '0.12em', marginLeft: 12,
          }}>
            <span className="blink">●</span> REFRESHING
          </span>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={() => setReloadNonce(n => n + 1)} />}
      {!error && !data && <Loading label="PULLING MARKET DATA" />}

      {data && (
        <>
          <EditHint />
          {sections.visible.map(sectionId => {
            if (sectionId === 'indices') return (
              <Draggable key="indices" id="indices" label="MAJOR INDICES" api={sections} variant="section">
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
                    {indexTiles.visible.map(symbol => {
                      const idx = indexBySymbol.get(symbol)
                      if (!idx) return null
                      const prefix = idx.quote === 'usd' ? '$' : ''
                      const suffix = idx.quote === 'pct' ? '%' : ''
                      return (
                        <Draggable key={idx.symbol} id={idx.symbol} label={idx.name} api={indexTiles}>
                          <div style={{ backgroundColor: '#060E18', border, padding: '14px 16px', height: '100%', transition: 'border-color 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)')}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div>
                                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#C8FFD4', marginBottom: 2 }}>{idx.name}</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.08em' }}>
                                  {idx.symbol} · {idx.region}
                                </div>
                              </div>
                              <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 10,
                                color: posNegColor(idx.change_pct),
                                backgroundColor: (idx.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,59,59,0.07)',
                                border: `1px solid ${(idx.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                                padding: '2px 6px',
                                height: 'fit-content',
                                textShadow: `0 0 6px ${posNegColor(idx.change_pct)}`,
                              }}>
                                {formatPct(idx.change_pct)}
                              </div>
                            </div>
                            <div style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#C8FFD4',
                              letterSpacing: '-0.02em', marginBottom: 3, textShadow: '0 0 8px rgba(200,255,212,0.2)',
                            }}>
                              {idx.value !== null ? `${prefix}${idx.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}` : '—'}
                            </div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(idx.change) }}>
                              {idx.change !== null
                                ? `${idx.change >= 0 ? '+' : '-'}${prefix}${Math.abs(idx.change).toFixed(2)}${suffix}`
                                : '—'}
                            </div>
                          </div>
                        </Draggable>
                      )
                    })}
                  </div>
                  <AddWidgetTray api={indexTiles} title="MORE INDEXES" />
                </div>
              </Draggable>
            )

            if (sectionId === 'sentiment') return (
              <Draggable key="sentiment" id="sentiment" label="SENTIMENT INDICATORS" api={sections} variant="section">
                <div style={{ marginBottom: 22 }}>
                  <div style={{
                    fontFamily: "'VT323', monospace", fontSize: 20, color: '#00FF88', letterSpacing: '0.1em',
                    marginBottom: 10, textShadow: '0 0 8px rgba(0,255,136,0.5)',
                  }}>{'/// SENTIMENT INDICATORS'}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 10 }}>
                    {sentimentTiles.visible.map(tileId => {
                      if (tileId === 'fear_greed') return (
                        <Draggable key="fear_greed" id="fear_greed" label="CNN FEAR & GREED" api={sentimentTiles}>
                          <div style={{ backgroundColor: '#060E18', border, padding: '16px 18px', height: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em' }}>
                                CNN FEAR {'&'} GREED INDEX
                              </span>
                              {fg?.history && fg.history.length > 0 && (
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30' }}>
                                  {fg.history[fg.history.length - 1].date}
                                </span>
                              )}
                            </div>

                            {fg?.score != null && fgBandNow ? (
                              <>
                                {/* Gauge on the left, prior readings on the right --
                                    keeps the dial optically centred in its own
                                    column instead of floating in a too-wide tile. */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.1fr) minmax(170px, 1fr)', gap: 16, alignItems: 'center' }}>
                                  <div>
                                    <FearGreedGauge value={fg.score} />
                                    <div style={{
                                      fontFamily: "'VT323', monospace", fontSize: 22, color: fgBandNow.color,
                                      textShadow: `0 0 10px ${fgBandNow.color}`, textAlign: 'center',
                                      letterSpacing: '0.08em', marginTop: -6,
                                    }}>
                                      {fgBandNow.label}
                                    </div>
                                  </div>
                                  <div>
                                    <PreviousReading label="PREVIOUS CLOSE" value={fg.previous?.close ?? null} />
                                    <PreviousReading label="1 WEEK AGO" value={fg.previous?.week ?? null} />
                                    <PreviousReading label="1 MONTH AGO" value={fg.previous?.month ?? null} />
                                    <PreviousReading label="1 YEAR AGO" value={fg.previous?.year ?? null} />
                                  </div>
                                </div>

                                {fg.history && fg.history.length > 1 && (
                                  <div style={{ marginTop: 14 }}>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.1em', marginBottom: 6 }}>
                                      1-YEAR TREND
                                    </div>
                                    <SentimentChart
                                      points={fg.history}
                                      color={fgBandNow.color}
                                      format={v => v.toFixed(0)}
                                      height={70}
                                    />
                                  </div>
                                )}

                                {fg.components && fg.components.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setFgExpanded(v => !v)}
                                    style={{
                                      marginTop: 12, width: '100%',
                                      fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                                      color: '#00FF88', background: 'rgba(0,255,136,0.06)',
                                      border: '1px solid rgba(0,255,136,0.25)', padding: '6px 12px',
                                      cursor: 'pointer', letterSpacing: '0.08em',
                                    }}
                                  >
                                    {fgExpanded ? '▲ HIDE INDICATORS' : `▼ SHOW ${fg.components.length} INDICATORS`}
                                  </button>
                                )}
                              </>
                            ) : (
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', textAlign: 'center', padding: '40px 0' }}>
                                N/A
                              </div>
                            )}
                          </div>
                        </Draggable>
                      )

                      if (tileId === 'put_call') return (
                        <Draggable key="put_call" id="put_call" label="CBOE PUT/CALL RATIO" api={sentimentTiles}>
                          <div style={{ backgroundColor: '#060E18', border, padding: '16px 18px', height: '100%' }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 12 }}>
                              CBOE PUT/CALL RATIO
                            </div>
                            {pc !== null && pcZone ? (
                              <>
                                <div style={{
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 600, color: '#C8FFD4',
                                  textAlign: 'center', textShadow: '0 0 14px rgba(200,255,212,0.3)', lineHeight: 1, marginBottom: 6,
                                }}>{pc.toFixed(2)}</div>
                                <div style={{
                                  fontFamily: "'VT323', monospace", fontSize: 22, color: pcZone.color, textAlign: 'center',
                                  textShadow: `0 0 8px ${pcZone.color}`, marginBottom: 18, letterSpacing: '0.08em',
                                }}>
                                  {pcZone.label}
                                </div>

                                {/* All three zones are always drawn, faded; the one
                                    holding the current reading lights up. */}
                                <div style={{ position: 'relative', height: 10, display: 'flex', margin: '0 6px', gap: 1 }}>
                                  {PC_ZONES.map(z => {
                                    const live = z.id === pcZone.id
                                    return (
                                      <div
                                        key={z.id}
                                        style={{
                                          width: `${pcPct(z.to) - pcPct(z.from)}%`,
                                          backgroundColor: z.color,
                                          opacity: live ? 0.85 : 0.13,
                                          boxShadow: live ? `0 0 10px ${z.color}` : 'none',
                                          transition: 'opacity 0.15s',
                                        }}
                                      />
                                    )
                                  })}
                                  <div style={{
                                    position: 'absolute',
                                    left: `${Math.min(100, Math.max(0, pcPct(pc)))}%`,
                                    top: '50%', transform: 'translate(-50%, -50%)',
                                    width: 3, height: 20,
                                    backgroundColor: '#C8FFD4',
                                    boxShadow: `0 0 8px ${pcZone.color}`,
                                  }} />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '0 6px' }}>
                                  {PC_ZONES.map(z => (
                                    <span key={z.id} style={{
                                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                                      color: z.id === pcZone.id ? z.color : '#2D6644',
                                      textShadow: z.id === pcZone.id ? `0 0 6px ${z.color}` : 'none',
                                      width: `${pcPct(z.to) - pcPct(z.from)}%`,
                                      textAlign: 'center',
                                    }}>{z.label}</span>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 6px' }}>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30' }}>{PC_MIN.toFixed(1)}</span>
                                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30' }}>{PC_MAX.toFixed(1)}</span>
                                </div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', textAlign: 'center', marginTop: 10 }}>
                                  {'< 0.70 BULLISH · > 1.00 BEARISH'}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', textAlign: 'center', padding: '30px 0' }}>
                                N/A -- source may have changed structure
                              </div>
                            )}
                          </div>
                        </Draggable>
                      )

                      return null
                    })}
                  </div>

                  {/* Expanded component breakdown lives outside the two-column
                      grid so eight charts get the full page width. */}
                  {fgExpanded && sentimentTiles.visible.includes('fear_greed') && fg?.components && fg.components.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{
                        fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88', letterSpacing: '0.1em',
                        marginBottom: 10, textShadow: '0 0 6px rgba(0,255,136,0.4)',
                      }}>{'/// FEAR & GREED INDICATORS'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
                        {fg.components.map(c => {
                          const band = c.score != null ? fgBand(c.score) : null
                          const lineColor = band?.color ?? '#4DCC88'
                          const fmt = fgUnitFormat(c.unit)
                          return (
                            <div key={c.key} style={{ backgroundColor: '#060E18', border, padding: '14px 16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#C8FFD4' }}>
                                  {c.label}
                                </span>
                                <span style={{
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                                  color: lineColor, letterSpacing: '0.08em', whiteSpace: 'nowrap',
                                }}>
                                  {c.rating ?? '—'}
                                </span>
                              </div>
                              <div style={{
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644',
                                marginTop: 3, marginBottom: 10,
                              }}>
                                {c.subtitle}
                              </div>
                              {/* Today's actual reading -- the 0-100 score is
                                  CNN's normalization and shows as the rating. */}
                              <div style={{
                                fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 600,
                                color: lineColor, marginBottom: 12, lineHeight: 1,
                                textShadow: `0 0 8px ${lineColor}55`,
                              }}>
                                {fmt(c.value)}
                              </div>
                              <LineChart
                                lines={c.series.map((s, i) => ({
                                  label: s.label,
                                  points: s.points,
                                  color: i === 0 ? lineColor : MA_LINE_COLOR,
                                  dashed: i > 0,
                                }))}
                                format={fmt}
                                height={62}
                              />
                            </div>
                          )
                        })}
                      </div>
                      <div style={{
                        marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30',
                      }}>
                        {'// Each card shows today\'s actual reading; the FEAR/GREED rating beside it is CNN\'s 0-100 normalization of that measure.'}
                      </div>
                    </div>
                  )}

                  <AddWidgetTray api={sentimentTiles} title="HIDDEN SENTIMENT TILES" />
                </div>
              </Draggable>
            )

            if (sectionId === 'macro') return (
              <Draggable key="macro" id="macro" label="MACRO SENTIMENT" api={sections} variant="section">
                <div>
                  <div style={{
                    fontFamily: "'VT323', monospace", fontSize: 20, color: '#00FF88', letterSpacing: '0.1em',
                    marginBottom: 10, textShadow: '0 0 8px rgba(0,255,136,0.5)',
                  }}>{'/// MACRO SENTIMENT'}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 20 }}>
                    {macroTiles.visible.map(tileKey => {
                      const cfg = MACRO_CARDS_BY_KEY.get(tileKey)
                      if (!cfg) return null
                      const series = sentiment?.[cfg.key] ?? null
                      const color = series ? cfg.color(series.value) : '#2D6644'
                      return (
                        <Draggable key={cfg.key} id={cfg.key} label={cfg.title} api={macroTiles}>
                          <div style={{ backgroundColor: '#060E18', border, padding: '32px', height: '100%' }}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 20 }}>
                              {cfg.title}
                            </div>
                            {series ? (
                              <>
                                <div style={{
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 52, fontWeight: 600, color,
                                  textShadow: `0 0 10px ${color}55`, marginBottom: 16, lineHeight: 1,
                                }}>
                                  {cfg.format(series.value)}
                                </div>
                                <SentimentChart points={series.history} color={color} zeroLine={cfg.zeroLine} format={cfg.format} height={90} />
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', marginTop: 14 }}>
                                  LATEST {series.date} · {cfg.source}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#1D4A30', textAlign: 'center', padding: '40px 0' }}>
                                N/A -- {cfg.source} (missing API key or fetch failed)
                              </div>
                            )}
                          </div>
                        </Draggable>
                      )
                    })}
                  </div>
                  <AddWidgetTray api={macroTiles} title="HIDDEN MACRO TILES" />
                </div>
              </Draggable>
            )

            return null
          })}
          <AddWidgetTray api={sections} title="HIDDEN SECTIONS" />
        </>
      )}

      <div style={{
        marginTop: 12, padding: '9px 12px',
        backgroundColor: 'rgba(0,255,136,0.02)',
        border: '1px solid rgba(0,255,136,0.07)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, color: '#1D4A30',
      }}>
        {'// INDICES: yfinance · SENTIMENT: CNN/CBOE scraped endpoints + FRED/CFTC APIs — may show N/A if providers change structure or FRED_API_KEY is unset'}
      </div>
    </div>
  )
}
