import { useEffect, useState } from 'react'
import { fetchFutures, type FuturesContract } from '@/lib/api'
import { formatPct, posNegColor, formatLargeNum } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'

const border = '1px solid rgba(0,255,136,0.12)'

export default function Futures() {
  const [contracts, setContracts] = useState<FuturesContract[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setContracts(null)
    fetchFutures().then(setContracts).catch(e => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 20 }}>
        FUTURES
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !contracts && <Loading label="PULLING CONTRACT DATA" />}

      {contracts && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 1fr 1fr 1fr', gap: 6, padding: '0 14px 8px' }}>
            {['CONTRACT', 'LAST', 'EXPIRY', 'CHANGE', 'VOLUME', '24H'].map(h => (
              <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', letterSpacing: '0.1em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {contracts.map(f => (
              <div key={f.symbol} style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr 90px 1fr 1fr 1fr',
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
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#C8FFD4', marginBottom: 2, lineHeight: 1.2 }}>{f.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.08em' }}>{f.symbol}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600, color: '#00FF88', textShadow: '0 0 8px rgba(0,255,136,0.4)' }}>
                  {f.price !== null ? f.price.toLocaleString('en-US', { maximumFractionDigits: f.price < 10 ? 3 : 2 }) : '—'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.04em' }}>{f.expiry ?? '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: posNegColor(f.change), textShadow: `0 0 5px ${posNegColor(f.change)}` }}>
                  {f.change !== null ? `${f.change >= 0 ? '+' : ''}${f.change.toFixed(f.price !== null && f.price < 10 ? 3 : 2)}` : '—'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#4DCC88' }}>{formatLargeNum(f.volume)}</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  color: posNegColor(f.change_pct),
                  backgroundColor: (f.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,59,59,0.07)',
                  border: `1px solid ${(f.change_pct ?? 0) >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                  padding: '2px 7px', display: 'inline-block',
                  textShadow: `0 0 5px ${posNegColor(f.change_pct)}`,
                }}>
                  {formatPct(f.change_pct)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: yfinance · open interest not available via free data, omitted rather than guessed'}
      </div>
    </div>
  )
}
