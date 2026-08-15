import { useEffect, useState, type MouseEvent } from 'react'
import { fetchMarket, type MarketData } from '@/lib/api'
import { formatPct, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'

const border = '1px solid rgba(0,255,136,0.12)'

function FearGreedGauge({ value }: { value: number }) {
  const angle = (value / 100) * 180 - 90
  const color =
    value <= 25 ? '#FF3B3B'
    : value <= 45 ? '#FF8C00'
    : value <= 55 ? '#FFD700'
    : value <= 75 ? '#00FF88'
    : '#00FF88'
  const label =
    value <= 25 ? 'EXTREME FEAR'
    : value <= 45 ? 'FEAR'
    : value <= 55 ? 'NEUTRAL'
    : value <= 75 ? 'GREED'
    : 'EXTREME GREED'

  const nx = 90 + 60 * Math.cos(((angle - 90) * Math.PI) / 180)
  const ny = 90 + 60 * Math.sin(((angle - 90) * Math.PI) / 180)

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <svg width={180} height={100} viewBox="0 0 180 100">
        {[
          { color: '#FF3B3B', d: 'M 10,90 A 80,80 0 0,1 45,25' },
          { color: '#FF8C00', d: 'M 45,25 A 80,80 0 0,1 90,10' },
          { color: '#FFD700', d: 'M 90,10 A 80,80 0 0,1 135,25' },
          { color: '#00FF88', d: 'M 135,25 A 80,80 0 0,1 170,90' },
        ].map((seg, i) => (
          <path key={i} d={seg.d} stroke={seg.color} strokeWidth={8} fill="none" opacity={0.2} strokeLinecap="butt" />
        ))}
        <line x1={90} y1={90} x2={nx} y2={ny} stroke={color} strokeWidth={2} strokeLinecap="square" />
        <rect x={87} y={87} width={6} height={6} fill={color} style={{ boxShadow: `0 0 6px ${color}` }} />
        <text x={90} y={72} textAnchor="middle" fill={color}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600 }}>
          {value}
        </text>
      </svg>
      <div style={{ fontFamily: "'VT323', monospace", fontSize: 16, color, textShadow: `0 0 8px ${color}`, marginTop: -4 }}>
        {label}
      </div>
    </div>
  )
}

function putCallLabel(ratio: number) {
  if (ratio < 0.7) return { label: 'BULLISH', color: '#00FF88' }
  if (ratio > 1.0) return { label: 'BEARISH', color: '#FF3B3B' }
  return { label: 'NEUTRAL', color: '#FFD700' }
}

function formatAxisDate(dateStr: string) {
  const dt = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return dateStr
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Interactive line chart: y-axis min/max labels, x-axis start/end date
// labels, and a mouse-tracked crosshair + tooltip showing the exact
// value/date under the cursor.
function SentimentChart({
  points, color, zeroLine, format, height = 90,
}: {
  points: { date: string; value: number }[]
  color: string
  zeroLine?: boolean
  format: (v: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (!points.length) return null

  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 300
  const h = height
  const step = points.length > 1 ? w / (points.length - 1) : 0

  const xAt = (i: number) => i * step
  const yAt = (v: number) => h - ((v - min) / range) * h
  const coords = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')
  const zeroY = yAt(0)

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
            <polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} opacity={0.85} />
            {hover !== null && (
              <>
                <line x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h} stroke={color} strokeWidth={0.75} strokeDasharray="2,2" opacity={0.5} />
                <circle cx={xAt(hover)} cy={yAt(points[hover].value)} r={3} fill={color} stroke="#060E18" strokeWidth={1} />
              </>
            )}
          </svg>
          {hoverPoint && (
            <div style={{
              position: 'absolute', top: -6,
              left: `${tooltipPct}%`,
              transform: tooltipPct > 65 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: '#0A1420', border: `1px solid ${color}`, padding: '4px 8px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#C8FFD4',
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ color, fontWeight: 600 }}>{format(hoverPoint.value)}</div>
              <div style={{ fontSize: 9, color: '#4a5a52', marginTop: 1 }}>{formatAxisDate(hoverPoint.date)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 60,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 4,
      }}>
        <span>{formatAxisDate(points[0].date)}</span>
        <span>{formatAxisDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  )
}

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

export default function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [region, setRegion] = useState<'ALL' | 'US' | 'ASIA'>('ALL')

  const load = () => {
    setError(null)
    setData(null)
    fetchMarket().then(setData).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const filtered = (data?.indexes ?? []).filter(i => {
    if (region === 'ALL') return true
    if (region === 'US') return i.region === 'US'
    return i.region !== 'US'
  })

  const pc = data?.put_call_ratio ?? null
  const pcInfo = pc !== null ? putCallLabel(pc) : null
  const fg = data?.fear_greed
  const sentiment = data?.sentiment

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <span style={{
          fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4',
          letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)',
        }}>MARKET OVERVIEW</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['ALL', 'US', 'ASIA'] as const).map(r => (
            <button key={r} onClick={() => setRegion(r)} style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              color: region === r ? '#00FF88' : '#2D6644',
              background: region === r ? 'rgba(0,255,136,0.08)' : 'transparent',
              border: `1px solid ${region === r ? 'rgba(0,255,136,0.3)' : 'rgba(0,255,136,0.1)'}`,
              padding: '4px 10px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              textShadow: region === r ? '0 0 6px #00FF88' : 'none',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !data && <Loading label="PULLING MARKET DATA" />}

      {data && (
        <>
          {/* Indices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6, marginBottom: 22 }}>
            {filtered.map(idx => {
              // VIX is a volatility reading, not a price -- everything else
              // in the US region trades as an actual dollar-denominated
              // price/index level. Foreign indices (Nikkei, KOSPI) are in
              // their local currency, not USD, so no $ there either.
              const isDollar = idx.region === 'US' && idx.symbol !== 'VIX'
              return (
                <div key={idx.symbol} style={{ backgroundColor: '#060E18', border, padding: '14px 16px', transition: 'border-color 0.1s' }}
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
                    {idx.value !== null ? `${isDollar ? '$' : ''}${idx.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(idx.change) }}>
                    {idx.change !== null
                      ? `${idx.change >= 0 ? '+' : '-'}${isDollar ? '$' : ''}${Math.abs(idx.change).toFixed(2)}`
                      : '—'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sentiment */}
          <div style={{
            fontFamily: "'VT323', monospace", fontSize: 20, color: '#00FF88', letterSpacing: '0.1em',
            marginBottom: 10, textShadow: '0 0 8px rgba(0,255,136,0.5)',
          }}>{'/// SENTIMENT INDICATORS'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {/* Fear & Greed */}
            <div style={{ backgroundColor: '#060E18', border, padding: '16px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 6 }}>
                CNN FEAR {'&'} GREED INDEX
              </div>
              {fg?.score != null ? <FearGreedGauge value={fg.score} /> : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', textAlign: 'center', padding: '30px 0' }}>N/A</div>
              )}
            </div>

            {/* Put/Call */}
            <div style={{ backgroundColor: '#060E18', border, padding: '16px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 12 }}>
                CBOE PUT/CALL RATIO
              </div>
              {pc !== null && pcInfo ? (
                <>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 600, color: '#C8FFD4',
                    textAlign: 'center', textShadow: '0 0 14px rgba(200,255,212,0.3)', lineHeight: 1, marginBottom: 6,
                  }}>{pc.toFixed(2)}</div>
                  <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: pcInfo.color, textAlign: 'center', textShadow: `0 0 8px ${pcInfo.color}`, marginBottom: 12 }}>
                    {pcInfo.label}
                  </div>
                  <div style={{ position: 'relative', height: 4, backgroundColor: 'rgba(0,255,136,0.05)', margin: '0 10px' }}>
                    <div style={{ position: 'absolute', left: '30%', width: '40%', height: '100%', backgroundColor: 'rgba(255,215,0,0.25)' }} />
                    <div style={{
                      position: 'absolute',
                      left: `${Math.min(100, Math.max(0, ((pc - 0.4) / 1.0) * 100))}%`,
                      top: '50%', transform: 'translate(-50%, -50%)',
                      width: 6, height: 6, backgroundColor: pcInfo.color, boxShadow: `0 0 6px ${pcInfo.color}`,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 10px' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#00FF88' }}>0.4</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644' }}>NEUTRAL</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#FF3B3B' }}>1.4</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', textAlign: 'center', marginTop: 8 }}>
                    {'< 0.7 BULL · > 1.0 BEAR'}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', textAlign: 'center', padding: '30px 0' }}>
                  N/A -- source may have changed structure
                </div>
              )}
            </div>

          </div>

          {/* Macro sentiment */}
          <div style={{
            fontFamily: "'VT323', monospace", fontSize: 20, color: '#00FF88', letterSpacing: '0.1em',
            marginBottom: 10, textShadow: '0 0 8px rgba(0,255,136,0.5)',
          }}>{'/// MACRO SENTIMENT'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 20 }}>
            {SENTIMENT_CARDS.map(cfg => {
              const series = sentiment?.[cfg.key] ?? null
              const color = series ? cfg.color(series.value) : '#2D6644'
              return (
                <div key={cfg.key} style={{ backgroundColor: '#060E18', border, padding: '32px' }}>
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
              )
            })}
          </div>
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
