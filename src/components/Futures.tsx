import { useEffect, useState } from 'react'
import { fetchFutures, type FuturesContract } from '@/lib/api'
import { formatLargeNum } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'

export default function Futures() {
  const [contracts, setContracts] = useState<FuturesContract[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)

  const load = () => {
    setError(null)
    setContracts(null)
    fetchFutures().then(setContracts).catch(e => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 20 }}>
        FUTURES
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !contracts && <Loading label="PULLING CONTRACT DATA" />}

      {contracts && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px 1fr 1fr 1fr', gap: 6, padding: '0 14px 8px' }}>
            {['CONTRACT', 'LAST', 'EXPIRY', 'CHANGE', 'VOLUME', '24H'].map(h => (
              <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5E4D70', letterSpacing: '0.1em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {contracts.map(f => (
              <div key={f.symbol} {...chartRowProps(() => setChart({ kind: 'future', id: f.name, sub: `${f.symbol} · front month` }))} style={{
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '160px 1fr 90px 1fr 1fr 1fr',
                gap: 6,
                alignItems: 'center',
                backgroundColor: '#130B1B',
                border,
                padding: '12px 14px',
                transition: 'border-color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
              >
                <div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: '#FFFFFF', marginBottom: 2, lineHeight: 1.2 }}>{f.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E', letterSpacing: '0.08em' }}>{f.symbol}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)' }}>
                  {f.price !== null ? f.price.toLocaleString('en-US', { maximumFractionDigits: f.price < 10 ? 3 : 2 }) : '—'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E', letterSpacing: '0.04em' }}>{f.expiry ?? '—'}</div>
                <div><Delta value={f.change} format={v => v.toFixed(f.price !== null && f.price < 10 ? 3 : 2)} size={13} /></div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF' }}>{formatLargeNum(f.volume)}</div>
                <div><Delta value={f.change_pct} format={v => `${v.toFixed(2)}%`} size={12} badge /></div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: yfinance · open interest not available via free data, omitted rather than guessed'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
