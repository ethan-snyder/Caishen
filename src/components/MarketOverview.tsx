import { useEffect, useState } from 'react'
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
            {filtered.map(idx => (
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
                  {idx.value !== null ? idx.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(idx.change) }}>
                  {idx.change !== null ? `${idx.change >= 0 ? '+' : ''}${idx.change.toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Sentiment */}
          <div style={{
            fontFamily: "'VT323', monospace", fontSize: 20, color: '#00FF88', letterSpacing: '0.1em',
            marginBottom: 10, textShadow: '0 0 8px rgba(0,255,136,0.5)',
          }}>{'/// SENTIMENT INDICATORS'}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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

            {/* AAII */}
            <div style={{ backgroundColor: '#060E18', border, padding: '16px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 12 }}>
                AAII INVESTOR SENTIMENT
              </div>
              {data.aaii ? (
                <>
                  {[
                    { label: 'BULLISH', value: data.aaii.bullish, color: '#00FF88' },
                    { label: 'NEUTRAL', value: data.aaii.neutral, color: '#FFD700' },
                    { label: 'BEARISH', value: data.aaii.bearish, color: '#FF3B3B' },
                  ].map(item => (
                    <div key={item.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: item.color, letterSpacing: '0.06em' }}>
                          {item.label}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: item.color, textShadow: `0 0 6px ${item.color}` }}>
                          {item.value.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 4, backgroundColor: 'rgba(0,255,136,0.05)' }}>
                        <div style={{ width: `${item.value}%`, height: '100%', backgroundColor: item.color, opacity: 0.65, boxShadow: `0 0 4px ${item.color}` }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 4 }}>
                    {data.aaii.week_ending ? `WEEK ENDING ${data.aaii.week_ending}` : ''}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#1D4A30', textAlign: 'center', padding: '30px 0' }}>
                  N/A -- source may have changed structure
                </div>
              )}
            </div>
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
        {'// INDICES: yfinance · SENTIMENT: CNN/CBOE/AAII scraped endpoints — may show N/A if providers change structure'}
      </div>
    </div>
  )
}
