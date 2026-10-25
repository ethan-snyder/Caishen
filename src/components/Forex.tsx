import { useEffect, useState } from 'react'
import { fetchFx, type FxPair } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'

function rateDecimals(rate: number | null) {
  if (rate === null) return 4
  return rate > 10 ? 2 : 4
}

export default function Forex() {
  const [pairs, setPairs] = useState<FxPair[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)

  const load = () => {
    setError(null)
    setPairs(null)
    fetchFx().then(setPairs).catch(e => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div>
      <span style={{ fontFamily: "'Twemoji Country Flags', 'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 20 }}>
        FOREX
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !pairs && <Loading label="PULLING MAJOR PAIRS" />}

      {pairs && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr 1fr', gap: 6, padding: '0 14px 8px', marginBottom: 4 }}>
            {['PAIR', 'RATE', 'CHANGE', 'BID', 'ASK', '24H'].map(h => (
              <div key={h} style={{ fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 9, color: '#5E4D70', letterSpacing: '0.12em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pairs.map(p => {
              const dec = rateDecimals(p.rate)
              return (
                <div key={p.pair} {...chartRowProps(() => setChart({ kind: 'fx', id: `${p.base}/${p.quote}`, sub: 'Currency pair' }))} style={{
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 1fr 1fr 1fr 1fr',
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
                    <div style={{ fontFamily: "'Twemoji Country Flags', 'Share Tech Mono', monospace", fontSize: 14, color: '#FFFFFF', marginBottom: 2 }}>
                      {p.base_flag && <span style={{ marginRight: 5 }}>{p.base_flag}</span>}
                      {p.base}/{p.quote_flag && <span style={{ margin: '0 3px' }}>{p.quote_flag}</span>}{p.quote}
                    </div>
                    <div style={{ fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E', letterSpacing: '0.08em' }}>
                      {p.base} · {p.quote}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)' }}>
                    {p.rate !== null ? p.rate.toFixed(dec) : '—'}
                  </div>
                  <div><Delta value={p.change} format={v => v.toFixed(dec)} size={13} /></div>
                  <div style={{ fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 13, color: '#FFFFFF' }} title={p.bid_ask_is_estimate ? 'Estimated (no live bid/ask from this data source)' : undefined}>
                    {p.bid !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.bid.toFixed(dec)}` : '—'}
                  </div>
                  <div style={{ fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 13, color: '#FFFFFF' }} title={p.bid_ask_is_estimate ? 'Estimated (no live bid/ask from this data source)' : undefined}>
                    {p.ask !== null ? `${p.bid_ask_is_estimate ? '~' : ''}${p.ask.toFixed(dec)}` : '—'}
                  </div>
                  <div><Delta value={p.change_pct} format={v => `${v.toFixed(2)}%`} size={12} badge /></div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'Twemoji Country Flags', 'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: yfinance · rate/change are live · bid/ask marked with ~ are estimated (no free live spread source)'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
