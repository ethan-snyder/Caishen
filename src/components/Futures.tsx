import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { fetchFutures, fetchFuturesHistory, type FuturesContract, type FuturesRange, type FuturesHistoryPoint } from '@/lib/api'
import { formatPct, posNegColor, formatLargeNum, fmtDate } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'
import { AxisLabels, GridLines } from './ChartGrid'

const border = '1px solid rgba(155,89,182,0.5)'

function priceDecimals(price: number | null) {
  if (price === null) return 2
  return price < 10 ? 3 : 2
}

function formatPrice(price: number | null, currencySymbol: string | null) {
  if (price === null) return '—'
  const dec = priceDecimals(price)
  const formatted = price.toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: dec })
  return currencySymbol ? `${currencySymbol}${formatted}` : formatted
}

const RANGES: { key: FuturesRange; label: string }[] = [
  { key: '1h', label: '1H' }, { key: '12h', label: '12H' }, { key: '24h', label: '24H' },
  { key: '3mo', label: '3M' }, { key: '1y', label: '1Y' }, { key: '3y', label: '3Y' },
  { key: '5y', label: '5Y' }, { key: '10y', label: '10Y' }, { key: 'all', label: 'ALL' },
]

function formatHistoryDate(iso: string, range: FuturesRange) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  if (range === '1h' || range === '12h' || range === '24h') {
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return fmtDate(dt)
}

/** Interactive price chart: hover crosshair + tooltip, y-axis min/max,
 * x-axis start/end. Hand-rolled SVG, same approach as Crypto.tsx/
 * Forex.tsx's charts -- no charting library in this app. The hover dot
 * is a CSS circle (not an SVG <circle>) since the SVG's
 * preserveAspectRatio="none" stretches x/y unevenly, turning a true SVG
 * circle into a visible oval. */
function PriceChart({ points, range, decimals, currencySymbol, height = 130 }: {
  points: FuturesHistoryPoint[]
  range: FuturesRange
  decimals: number
  currencySymbol: string | null
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

  const fmt = (v: number) => `${currencySymbol ?? ''}${v.toFixed(decimals)}`

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
  const fillId = `futures-fill-${up ? 'up' : 'down'}-${range}`

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
        <AxisLabels min={min} max={max} height={h} minWidth={70} format={fmt} />
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
              <div style={{ color: lineColor, fontWeight: 600 }}>{fmt(hoverPoint.value)}</div>
              <div style={{ fontSize: 13, color: '#8C7A9E', marginTop: 1 }}>{formatHistoryDate(hoverPoint.date, range)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 80,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E', marginTop: 6,
      }}>
        <span>{formatHistoryDate(points[0].date, range)}</span>
        <span>{formatHistoryDate(points[points.length - 1].date, range)}</span>
      </div>
    </div>
  )
}

/** Range-toggle chart panel, shown inside a tile only once expanded.
 * Each tile owns its own range/history state, so several can be
 * expanded (and on different ranges) at once without interfering. */
function ExpandedChart({ contract, decimals }: { contract: FuturesContract; decimals: number }) {
  const [range, setRange] = useState<FuturesRange>('24h')
  const [history, setHistory] = useState<FuturesHistoryPoint[] | null>(null)
  const [histError, setHistError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHistory(null)
    setHistError(null)
    fetchFuturesHistory(contract.symbol, range)
      .then(h => { if (!cancelled) setHistory(h.points) })
      .catch(e => { if (!cancelled) setHistError(e.message) })
    return () => { cancelled = true }
  }, [contract.symbol, range])

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(155,89,182,0.5)' }}>
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
      {!histError && history && (
        <PriceChart points={history} range={range} decimals={decimals} currencySymbol={contract.currency_symbol} />
      )}
    </div>
  )
}

/**
 * Volume/open-interest as an inline "LABEL value" pair rather than the
 * old stacked DataCell (label on its own line above a bigger value line).
 * That stacked form added a whole second content row to every collapsed
 * tile -- with 15+ contracts in the list, that's an extra ~30px each,
 * purely for two numbers nobody was scanning as a standalone block. Sits
 * in the same header row as price/change now, so a collapsed tile is one
 * line tall again.
 */
function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#7A6A8E', letterSpacing: '0.08em' }}>{label} </span>
      <span style={{ color: '#C9B8D9' }}>{value}</span>
    </span>
  )
}

export default function Futures() {
  const [contracts, setContracts] = useState<FuturesContract[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = () => {
    setError(null)
    setContracts(null)
    fetchFutures().then(setContracts).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const items = useMemo(
    () => (contracts ?? []).map(c => ({ id: c.symbol, label: c.name })),
    [contracts],
  )
  const rows = useSortableLayout('futures.rows', items)
  const bySymbol = useMemo(
    () => new Map((contracts ?? []).map(c => [c.symbol, c])),
    [contracts],
  )

  const toggleExpanded = (symbol: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }

  return (
    <div>
      <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 26, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 20 }}>
        FUTURES
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !contracts && <Loading label="PULLING CONTRACT DATA" />}

      {contracts && (
        <>
          <EditHint />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.visible.map(symbol => {
              const f = bySymbol.get(symbol)
              if (!f) return null
              const dec = priceDecimals(f.price)
              const isOpen = expanded.has(f.symbol)
              return (
                <Draggable key={f.symbol} id={f.symbol} label={f.name} api={rows}>
                  {/* Was 14px/16px padding plus a whole second content row
                      for volume/open interest below the header -- roughly
                      doubled the height every tile needed. Tighter padding
                      + folding those two stats into the header line (see
                      InlineStat) gets a collapsed tile back to one line. */}
                  <div style={{ backgroundColor: '#130B1B', border, padding: '9px 14px' }}>
                    <div
                      onClick={() => toggleExpanded(f.symbol)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', rowGap: 4 }}>
                        <div style={{ minWidth: 150 }}>
                          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 16, color: '#FFFFFF', lineHeight: 1.2 }}>{f.name}</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5', letterSpacing: '0.08em', marginTop: 2 }}>
                            {f.symbol}{f.expiry ? ` · ${f.expiry}` : ''}
                          </div>
                        </div>

                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)' }}>
                          {formatPrice(f.price, f.currency_symbol)}
                        </div>

                        <div><Delta value={f.change} format={v => v.toFixed(dec)} size={15} /></div>

                        <div><Delta value={f.change_pct} format={v => `${v.toFixed(2)}%`} size={15} badge /></div>

                        {f.year_change_pct !== null && (
                          <div title="1-year change" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#A391B5' }}>
                            1Y <Delta value={f.year_change_pct} format={v => `${v.toFixed(2)}%`} size={13} />
                          </div>
                        )}

                        <InlineStat label="VOL" value={formatLargeNum(f.volume)} />
                        <InlineStat label="OI" value={f.open_interest !== null ? formatLargeNum(f.open_interest) : 'N/A'} />
                      </div>

                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#C9B8D9',
                        transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s', display: 'inline-block', flexShrink: 0,
                      }}>
                        ▾
                      </span>
                    </div>

                    {isOpen && <ExpandedChart contract={f} decimals={dec} />}
                  </div>
                </Draggable>
              )
            })}
          </div>
          <AddWidgetTray api={rows} title="HIDDEN CONTRACTS" />
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(155,89,182,0.5)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E' }}>
        {'// DATA SOURCE: yfinance · price/change/volume/history are live · 1Y change is a single extra period=1y fetch, real but not shown if yfinance lacks enough history · open interest not available via free data, omitted rather than guessed · $ shown only for contracts genuinely quoted as a dollar price (equity index futures are index points, not dollars)'}
      </div>
    </div>
  )
}
