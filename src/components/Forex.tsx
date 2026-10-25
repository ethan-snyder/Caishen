import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { fetchFx, fetchFxHistory, type FxPair, type FxRange, type FxHistoryPoint } from '@/lib/api'
import { formatPct, formatLargeNum, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'
import { AxisLabels, GridLines } from './ChartGrid'
import { Flag } from './Flag'

const border = '1px solid rgba(212,175,55,0.12)'

function rateDecimals(rate: number | null) {
  if (rate === null) return 4
  return rate > 10 ? 2 : 4
}

const RANGES: { key: FxRange; label: string }[] = [
  { key: '1h', label: '1H' }, { key: '12h', label: '12H' }, { key: '24h', label: '24H' },
  { key: '3mo', label: '3M' }, { key: '1y', label: '1Y' }, { key: '3y', label: '3Y' },
  { key: '5y', label: '5Y' }, { key: '10y', label: '10Y' }, { key: 'all', label: 'ALL' },
]

function formatHistoryDate(iso: string, range: FxRange) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  if (range === '1h' || range === '12h' || range === '24h') {
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Interactive rate chart: hover crosshair + tooltip, y-axis min/max,
 * x-axis start/end. Hand-rolled SVG, same approach as Crypto.tsx's
 * PriceChart -- no charting library in this app. */
function RateChart({ points, range, decimals, height = 130 }: {
  points: FxHistoryPoint[]
  range: FxRange
  decimals: number
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#7A6A8E',
      }}>
        not enough history for this range
      </div>
    )
  }

  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range_ = max - min || 1
  const w = 600
  const h = height
  const step = w / (points.length - 1)

  const xAt = (i: number) => i * step
  const yAt = (v: number) => h - ((v - min) / range_) * h
  const coords = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')

  const first = points[0].value
  const last = points[points.length - 1].value
  const up = last >= first
  const lineColor = up ? '#3DDC84' : '#FF4D4D'
  const fillId = `fx-fill-${up ? 'up' : 'down'}-${range}`

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const idx = Math.round(frac * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hoverPoint = hover !== null ? points[hover] : null
  const tooltipPct = hover !== null ? (xAt(hover) / w) * 100 : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10 }}>
        <AxisLabels min={min} max={max} height={h} minWidth={66} format={v => v.toFixed(decimals)} />
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair', display: 'block', overflow: 'visible' }}
          >
            <GridLines w={w} h={h} />
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#${fillId})`} />
            <polyline points={coords} fill="none" stroke={lineColor} strokeWidth={1.5} opacity={0.9} vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <line x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h} stroke={lineColor} strokeWidth={0.75} strokeDasharray="2,2" opacity={0.5} />
            )}
          </svg>
          {/* Hover dot is a CSS circle, not an SVG <circle> -- the SVG's
              preserveAspectRatio="none" stretches x and y by different
              factors to fill a wide, short container, which turns a
              true SVG circle into a visible oval. Positioning a real
              div circle by percentage (same trick already used for the
              tooltip below) keeps it round regardless of that stretch. */}
          {hover !== null && (
            <div style={{
              position: 'absolute',
              left: `${(xAt(hover) / w) * 100}%`,
              top: `${(yAt(points[hover].value) / h) * 100}%`,
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: lineColor, border: '1px solid #130B1B',
              transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            }} />
          )}
          {hoverPoint && (
            <div style={{
              position: 'absolute', top: -6,
              left: `${tooltipPct}%`,
              transform: tooltipPct > 65 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: '#1C1226', border: `1px solid ${lineColor}`, padding: '5px 10px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#FFFFFF',
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ color: lineColor, fontWeight: 600 }}>{hoverPoint.value.toFixed(decimals)}</div>
              <div style={{ fontSize: 13, color: '#8C7A9E', marginTop: 1 }}>{formatHistoryDate(hoverPoint.date, range)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 76,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E', marginTop: 6,
      }}>
        <span>{formatHistoryDate(points[0].date, range)}</span>
        <span>{formatHistoryDate(points[points.length - 1].date, range)}</span>
      </div>
    </div>
  )
}

/** Range-toggle chart panel, shown inside a tile only once expanded.
 * Each tile owns its own range/history state, so several can be expanded
 * (and on different ranges) at the same time without interfering. */
function ExpandedChart({ pair, decimals }: { pair: FxPair; decimals: number }) {
  const [range, setRange] = useState<FxRange>('24h')
  const [history, setHistory] = useState<FxHistoryPoint[] | null>(null)
  const [histError, setHistError] = useState<string | null>(null)
  const pairKey = `${pair.base}${pair.quote}`

  useEffect(() => {
    let cancelled = false
    setHistory(null)
    setHistError(null)
    fetchFxHistory(pairKey, range)
      .then(h => { if (!cancelled) setHistory(h.points) })
      .catch(e => { if (!cancelled) setHistError(e.message) })
    return () => { cancelled = true }
  }, [pairKey, range])

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(212,175,55,0.1)' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: '0.06em',
              padding: '3px 8px', cursor: 'pointer',
              backgroundColor: range === r.key ? 'rgba(212,175,55,0.15)' : 'transparent',
              border: `1px solid ${range === r.key ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.12)'}`,
              color: range === r.key ? '#D4AF37' : '#C9B8D9',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {histError && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#FF4D4D' }}>
          {`// couldn't load history: ${histError}`}
        </div>
      )}
      {!histError && !history && (
        <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#7A6A8E' }}>loading…</span>
        </div>
      )}
      {!histError && history && <RateChart points={history} range={range} decimals={decimals} />}
    </div>
  )
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#7A6A8E', letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#C9B8D9' }}>{value}</div>
    </div>
  )
}

export default function Forex() {
  const [pairs, setPairs] = useState<FxPair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = () => {
    setError(null)
    setPairs(null)
    fetchFx().then(setPairs).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const items = useMemo(
    () => (pairs ?? []).map(p => ({ id: p.pair, label: `${p.base}/${p.quote}` })),
    [pairs],
  )
  const rows = useSortableLayout('forex.pairs', items)
  const byPair = useMemo(
    () => new Map((pairs ?? []).map(p => [p.pair, p])),
    [pairs],
  )

  const toggleExpanded = (pairId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(pairId)) next.delete(pairId)
      else next.add(pairId)
      return next
    })
  }

  return (
    <div>
      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 26, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 20 }}>
        FOREX
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !pairs && <Loading label="PULLING MAJOR PAIRS" />}

      {pairs && (
        <>
          <EditHint />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.visible.map(pairId => {
              const p = byPair.get(pairId)
              if (!p) return null
              const dec = rateDecimals(p.rate)
              const isOpen = expanded.has(p.pair)
              return (
                <Draggable key={p.pair} id={p.pair} label={`${p.base}/${p.quote}`} api={rows}>
                  <div style={{ backgroundColor: '#130B1B', border, padding: '14px 16px' }}>
                    <div
                      onClick={() => toggleExpanded(p.pair)}
                      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
                    >
                      {/* Left: flags + pair name + rate + change */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 130 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Share Tech Mono', monospace", fontSize: 16, color: '#FFFFFF' }}>
                            <Flag code={p.base_flag_code} />
                            <span>{p.base}</span>
                            <span style={{ color: '#A391B5' }}>/</span>
                            <Flag code={p.quote_flag_code} />
                            <span>{p.quote}</span>
                          </div>
                          {p.exchange && (
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5', letterSpacing: '0.06em', marginTop: 2 }}>
                              {p.exchange}
                            </div>
                          )}
                        </div>

                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)' }}>
                          {p.rate !== null ? p.rate.toFixed(dec) : '—'}
                        </div>

                        <div><Delta value={p.change} format={v => v.toFixed(dec)} size={15} /></div>

                        <div><Delta value={p.change_pct} format={v => `${v.toFixed(2)}%`} size={15} badge /></div>
                      </div>

                      {/* Top right: symbol/symbol badge + expand chevron */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {(p.base_symbol || p.quote_symbol) && (
                          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 16, color: '#C9B8D9' }}>
                            {p.base_symbol ?? '?'}/{p.quote_symbol ?? '?'}
                          </span>
                        )}
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#C9B8D9',
                          transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s', display: 'inline-block',
                        }}>
                          ▾
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 12 }}>
                      <DataCell label="HIGH" value={p.high !== null ? p.high.toFixed(dec) : '—'} />
                      <DataCell label="LOW" value={p.low !== null ? p.low.toFixed(dec) : '—'} />
                      <DataCell label="VOLUME" value={p.volume !== null ? formatLargeNum(p.volume) : '—'} />
                      <DataCell
                        label="BID"
                        value={p.bid !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.bid.toFixed(dec)}` : '—'}
                      />
                      <DataCell
                        label="ASK"
                        value={p.ask !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.ask.toFixed(dec)}` : '—'}
                      />
                    </div>

                    {isOpen && <ExpandedChart pair={p} decimals={dec} />}
                  </div>
                </Draggable>
              )
            })}
          </div>
          <AddWidgetTray api={rows} title="HIDDEN PAIRS" />
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E' }}>
        {'// DATA SOURCE: yfinance · rate/change/high/low/history are live · bid/ask marked with ~ are estimated (no free live spread source) · volume is real but most FX tickers report none (no centralized tape for spot FX) · flags via flagcdn.com'}
      </div>
    </div>
  )
}
