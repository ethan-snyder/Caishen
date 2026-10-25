import { useEffect, useState, type MouseEvent } from 'react'
import {
  fetchStock, fetchStockHistory,
  type StockData, type StockRange, type StockHistoryPoint,
} from '@/lib/api'
import { formatMoney, formatNum, formatLargeNum, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { AxisLabels, GridLines } from './ChartGrid'
import AnalystInsights from './AnalystInsights'

const G = 'rgba(212,175,55,'
const border = `1px solid ${G}0.12)`

const RANGES: { key: StockRange; label: string }[] = [
  { key: '1d', label: '1D' }, { key: '1w', label: '1W' }, { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' }, { key: '6mo', label: '6M' }, { key: '1y', label: '1Y' },
  { key: '3y', label: '3Y' }, { key: '5y', label: '5Y' }, { key: 'all', label: 'ALL' },
]

/** Intraday ranges need a time; longer ones only need the date. */
function formatHistoryDate(iso: string, range: StockRange) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  if (range === '1d' || range === '1w') {
    return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Hand-rolled SVG price chart, same construction as the Crypto/Forex/
 * Futures charts (no charting library in this app). The hover dot is a
 * CSS circle rather than an SVG <circle>: preserveAspectRatio="none"
 * scales x and y by different factors, which turns a real circle oval. */
function PriceChart({ points, range, height = 200 }: {
  points: StockHistoryPoint[]
  range: StockRange
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
  const span = max - min || 1
  const w = 800
  const h = height
  const step = w / (points.length - 1)

  const xAt = (i: number) => i * step
  const yAt = (v: number) => h - ((v - min) / span) * h
  const coords = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')

  const up = points[points.length - 1].value >= points[0].value
  const lineColor = up ? '#3DDC84' : '#FF4D4D'
  const fillId = `stock-fill-${up ? 'up' : 'down'}-${range}`
  const fmt = (v: number) => `$${v.toFixed(2)}`

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
        <AxisLabels min={min} max={max} height={h} minWidth={78} format={fmt} />
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
        display: 'flex', justifyContent: 'space-between', marginLeft: 88,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E', marginTop: 6,
      }}>
        <span>{formatHistoryDate(points[0].date, range)}</span>
        <span>{formatHistoryDate(points[points.length - 1].date, range)}</span>
      </div>
    </div>
  )
}

/** Chart + its range toggles. Owns its own range/history state so changing
 * range never re-fetches the (much heavier) main stock payload. */
function ChartPanel({ ticker }: { ticker: string }) {
  const [range, setRange] = useState<StockRange>('1y')
  const [points, setPoints] = useState<StockHistoryPoint[] | null>(null)
  const [histError, setHistError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPoints(null)
    setHistError(null)
    fetchStockHistory(ticker, range)
      .then(h => { if (!cancelled) setPoints(h.points) })
      .catch(e => { if (!cancelled) setHistError(e.message) })
    return () => { cancelled = true }
  }, [ticker, range])

  return (
    <div style={{ backgroundColor: '#130B1B', border, padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {RANGES.map(r => {
          const active = r.key === range
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                backgroundColor: active ? 'rgba(212,175,55,0.12)' : 'transparent',
                border: `1px solid ${active ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.12)'}`,
                color: active ? '#D4AF37' : '#A391B5',
              }}
            >
              {r.label}
            </button>
          )
        })}
      </div>
      {histError && <ErrorBlock message={histError} />}
      {!histError && !points && <Loading label="LOADING CHART" />}
      {!histError && points && <PriceChart points={points} range={range} />}
    </div>
  )
}

/** yfinance gives these as fractions (0.243 = 24.3%). ROE can exceed 100%
 * legitimately, so nothing is rescaled by magnitude. */
function pctOf(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function bigMoney(v: number | null): string {
  if (v == null) return '—'
  return formatLargeNum(v)
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Cinzel', serif",
      fontSize: 15,
      fontWeight: 600,
      color: '#D4AF37',
      letterSpacing: '0.2em',
      marginBottom: 10,
      marginTop: 26,
      textShadow: '0 0 10px rgba(212,175,55,0.35)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ color: '#9B59B6', fontSize: 11 }}>◆</span>
      {children}
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.3), transparent)' }} />
    </div>
  )
}

function Cell({ label, value, pos, neg }: { label: string; value: string | number; pos?: boolean; neg?: boolean }) {
  const valColor = pos ? '#3DDC84' : neg ? '#FF4D4D' : '#FFFFFF'
  return (
    <div style={{
      backgroundColor: '#130B1B',
      border,
      padding: '12px 14px',
      transition: 'border-color 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
    >
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: '#A391B5',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 18,
        fontWeight: 600,
        color: valColor,
        letterSpacing: '-0.01em',
        textShadow: pos || neg ? `0 0 8px ${valColor}` : `0 0 6px rgba(255,255,255,0.3)`,
      }}>{value}</div>
    </div>
  )
}

export default function StockInfo() {
  const [inputVal, setInputVal] = useState('AAPL')
  const [ticker, setTicker] = useState<string | null>(null)
  const [data, setData] = useState<StockData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = (t: string) => {
    setTicker(t)
    setLoading(true)
    setError(null)
    setData(null)
    fetchStock(t)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const d = data

  return (
    <div>
      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); if (inputVal.trim()) load(inputVal.trim()) }} style={{ display: 'flex', gap: 8, maxWidth: 440, marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#A391B5',
          }}>$</span>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            placeholder="TICKER"
            style={{
              width: '100%',
              backgroundColor: '#130B1B',
              border,
              padding: '9px 12px 9px 28px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 16,
              color: '#FFFFFF',
              letterSpacing: '0.08em',
              outline: 'none',
              caretColor: '#D4AF37',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
          />
        </div>
        <button type="submit" style={{
          backgroundColor: '#D4AF37',
          color: '#0A0610',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 15,
          fontWeight: 700,
          border: 'none',
          padding: '9px 18px',
          cursor: 'pointer',
          letterSpacing: '0.08em',
          textShadow: 'none',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#E8C65A')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#D4AF37')}
        >
          FETCH
        </button>
      </form>

      {ticker === null && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#A391B5' }}>
          Enter a ticker and hit FETCH to pull live metrics.
        </div>
      )}

      {loading && <Loading label={`FETCHING ${ticker}`} />}
      {error && <ErrorBlock message={error} onRetry={() => ticker && load(ticker)} />}

      {d && !loading && !error && (
        <>
          {/* Header */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: "'Cinzel', serif", fontWeight: 600,
                fontSize: 32,
                color: '#F4EFE6',
                letterSpacing: '0.12em',
                textShadow: '0 0 10px rgba(212,175,55,0.35)',
              }}>{d.name}</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15,
                color: '#A391B5',
                letterSpacing: '0.1em',
              }}>{d.ticker}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 30,
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
                textShadow: '0 0 12px rgba(255,255,255,0.22)',
              }}>{formatMoney(d.price)}</span>
              {d.change !== null && d.changePct !== null && (
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                  <Delta value={d.change} format={v => v.toFixed(2)} size={16} />
                  <Delta value={d.changePct} format={v => `${v.toFixed(2)}%`} size={16} badge />
                </span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#A391B5' }}>
                MKT CAP {d.marketCap}
              </span>
            </div>
          </div>

          <SectionHead>PRICE HISTORY</SectionHead>
          <ChartPanel ticker={d.ticker} />

          <SectionHead>ANALYST INSIGHTS</SectionHead>
          <AnalystInsights ticker={d.ticker} />

          <SectionHead>VALUATION</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="P/E RATIO" value={formatNum(d.pe)} />
            <Cell label="FORWARD P/E" value={formatNum(d.forwardPe)} />
            <Cell label="PEG RATIO" value={formatNum(d.peg)} />
            <Cell label="P/S RATIO" value={formatNum(d.ps)} />
            <Cell label="P/B RATIO" value={formatNum(d.pb)} />
            <Cell label="EPS (TTM)" value={d.eps !== null ? `$${d.eps.toFixed(2)}` : '—'} />
          </div>

          <SectionHead>COST OF CAPITAL</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="CAPM" value={d.capm} />
            <Cell label="WACC" value={d.wacc} />
            <Cell label="BETA" value={formatNum(d.beta)} />
            <Cell label="RISK-FREE RATE" value={d.rf} />
          </div>

          <SectionHead>PER SHARE</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="DIVIDEND" value={d.dividend !== null ? `$${d.dividend.toFixed(2)}` : '—'} />
            <Cell label="DIV YIELD" value={d.dividendYield} />
            <Cell label="CASH/SHARE" value={d.cashPerShare !== null ? `$${d.cashPerShare.toFixed(2)}` : '—'} />
            <Cell label="52-WK HIGH" value={d.week52High !== null ? `$${d.week52High.toFixed(2)}` : '—'} />
            <Cell label="52-WK LOW" value={d.week52Low !== null ? `$${d.week52Low.toFixed(2)}` : '—'} />
          </div>

          <SectionHead>PROFITABILITY</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="PROFIT MARGIN" value={pctOf(d.profitMargin)} pos={(d.profitMargin ?? 0) > 0} neg={(d.profitMargin ?? 0) < 0} />
            <Cell label="OPER. MARGIN" value={pctOf(d.operatingMargin)} />
            <Cell label="ROA" value={pctOf(d.returnOnAssets)} />
            <Cell label="ROE" value={pctOf(d.returnOnEquity)} />
            <Cell label="REVENUE (TTM)" value={bigMoney(d.revenue)} />
            <Cell label="NET INCOME" value={bigMoney(d.netIncome)} />
          </div>

          <SectionHead>BALANCE SHEET</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="TOTAL CASH" value={bigMoney(d.totalCash)} />
            <Cell label="TOTAL DEBT" value={bigMoney(d.totalDebt)} />
            {/* yfinance reports debtToEquity percentage-style (154.5 means
                1.545x), so it's shown as a percent rather than silently
                divided by 100 into a ratio. */}
            <Cell label="DEBT/EQUITY" value={d.debtToEquity !== null ? `${d.debtToEquity.toFixed(1)}%` : '—'} />
            <Cell label="EBITDA" value={bigMoney(d.ebitda)} />
          </div>

          <SectionHead>TRADING &amp; DIVIDEND DATES</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="VOLUME" value={bigMoney(d.volume)} />
            <Cell label="AVG VOLUME" value={bigMoney(d.avgVolume)} />
            {/* Two different dates that get conflated constantly: ex-div is
                the ownership cutoff, dividend date is when cash lands. */}
            <Cell label="EX-DIVIDEND" value={d.exDividendDate ?? '—'} />
            <Cell label="DIVIDEND PAID" value={d.dividendDate ?? '—'} />
          </div>

          {/* 52-week range */}
          {d.week52High !== null && d.week52Low !== null && (
            <div style={{ marginTop: 8, backgroundColor: '#130B1B', border, padding: '14px 16px' }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5',
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10,
              }}>52-WEEK RANGE</div>
              <div style={{ position: 'relative', height: 4, backgroundColor: 'rgba(212,175,55,0.06)' }}>
                {(() => {
                  const pct = ((d.price - d.week52Low!) / (d.week52High! - d.week52Low!)) * 100
                  return (
                    <>
                      <div style={{
                        position: 'absolute', left: 0, width: `${pct}%`, height: '100%',
                        background: 'linear-gradient(90deg, rgba(212,175,55,0.2), #D4AF37)',
                      }} />
                      <div style={{
                        position: 'absolute', left: `${pct}%`, top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 8, height: 8,
                        backgroundColor: '#D4AF37',
                        border: '2px solid #0A0610',
                        boxShadow: '0 0 8px #D4AF37',
                      }} />
                    </>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#FF4D4D' }}>${d.week52Low.toFixed(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#D4AF37', textShadow: '0 0 6px #D4AF37' }}>${d.price.toFixed(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#D4AF37' }}>${d.week52High.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div style={{
            marginTop: 12, padding: '9px 12px',
            backgroundColor: 'rgba(212,175,55,0.03)',
            border: '1px solid rgba(212,175,55,0.08)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, color: '#7A6A8E',
          }}>
            {'// DATA: yfinance · CAPM: Rf + β×ERP · WACC: manual · ERP default 5.5%'}
          </div>
        </>
      )}
    </div>
  )
}
