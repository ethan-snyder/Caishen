import { useEffect, useState } from 'react'
import { fetchFx, type FxPair } from '@/lib/api'
import { formatPct, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'

const border = '1px solid rgba(0,255,136,0.12)'

function rateDecimals(rate: number | null) {
  if (rate === null) return 4
  return rate > 10 ? 2 : 4
}

export default function Forex() {
  const [pairs, setPairs] = useState<FxPair[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setPairs(null)
    fetchFx().then(setPairs).catch(e => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 20 }}>
        FOREX
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !pairs && <Loading label="PULLING MAJOR PAIRS" />}

      {pairs && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr 1fr', gap: 6, padding: '0 14px 8px', marginBottom: 4 }}>
            {['PAIR', 'RATE', 'CHANGE', 'BID', 'ASK', '24H'].map(h => (
              <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', letterSpacing: '0.12em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pairs.map(p => {
              const dec = rateDecimals(p.rate)
              return (
                <div key={p.pair} style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 1fr 1fr 1fr 1fr',
                  gap: 6,
                  alignItems: 'center',
                  backgroundColor: '#060E18',
                  border,
                  padding: '12px 14px',
                  transition: 'border-color 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)')}
                >
                  <div>
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#C8FFD4', marginBottom: 2 }}>
                      {p.base_flag && <span style={{ marginRight: 5 }}>{p.base_flag}</span>}
                      {p.base}/{p.quote_flag && <span style={{ margin: '0 3px' }}>{p.quote_flag}</span>}{p.quote}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.08em' }}>
                      {p.base} · {p.quote}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: '#00FF88', textShadow: '0 0 8px rgba(0,255,136,0.4)' }}>
                    {p.rate !== null ? p.rate.toFixed(dec) : '—'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: posNegColor(p.change), textShadow: `0 0 6px ${posNegColor(p.change)}` }}>
                    {p.change !== null ? `${p.change >= 0 ? '+' : ''}${p.change.toFixed(dec)}` : '—'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#4DCC88' }} title={p.bid_ask_is_estimate ? 'Estimated (no live bid/ask from this data source)' : undefined}>
                    {p.bid !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.bid.toFixed(dec)}` : '—'}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#4DCC88' }} title={p.bid_ask_is_estimate ? 'Estimated (no live bid/ask from this data source)' : undefined}>
                    {p.ask !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.ask.toFixed(dec)}` : '—'}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: posNegColor(p.change_pct),
                    backgroundColor: (p.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,59,59,0.07)',
                    border: `1px solid ${(p.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                    padding: '2px 8px',
                    display: 'inline-block',
                    textShadow: `0 0 6px ${posNegColor(p.change_pct)}`,
                  }}>
                    {formatPct(p.change_pct)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: yfinance · rate/change are live · bid/ask marked with ~ are estimated (no free live spread source)'}
      </div>
    </div>
  )
}
