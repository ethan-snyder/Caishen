import { useEffect, useState } from 'react'
import { fetchCrypto, type CryptoCoin } from '@/lib/api'
import { formatCryptoPrice, formatLargeNum, formatPct, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'

const border = '1px solid rgba(0,255,136,0.12)'

export default function Crypto() {
  const [coins, setCoins] = useState<CryptoCoin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setCoins(null)
    fetchCrypto(10)
      .then(setCoins)
      .catch(e => setError(e.message))
  }

  useEffect(load, [])

  // Header totals derived from the top coin (BTC, rank 1): total market
  // cap = its market cap / its dominance fraction, since the API doesn't
  // separately expose the whole-market total.
  const btc = coins?.find(c => c.rank === 1) ?? coins?.[0]
  const totalMktCap =
    btc?.market_cap != null && btc?.dominance ? btc.market_cap / (btc.dominance / 100) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)' }}>
          CRYPTO MARKETS
        </span>
        {coins && coins.length > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#2D6644' }}>
            TOTAL MKTCAP: <span style={{ color: '#00FF88' }}>{formatLargeNum(totalMktCap, '$')}</span>
            &nbsp;·&nbsp;BTC DOM: <span style={{ color: '#FFD700' }}>{btc?.dominance != null ? `${btc.dominance.toFixed(1)}%` : '—'}</span>
          </span>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !coins && <Loading label="PULLING TOP 10 BY MARKET CAP" />}

      {coins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
          {coins.map(c => (
            <div key={c.symbol} style={{ backgroundColor: '#060E18', border, padding: '16px' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#C8FFD4', marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#2D6644', letterSpacing: '0.1em' }}>{c.symbol}/USD</div>
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: posNegColor(c.change_pct_24h),
                  backgroundColor: (c.change_pct_24h ?? 0) >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,59,59,0.07)',
                  border: `1px solid ${(c.change_pct_24h ?? 0) >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                  padding: '2px 6px',
                  textShadow: `0 0 6px ${posNegColor(c.change_pct_24h)}`,
                }}>
                  {formatPct(c.change_pct_24h)}
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#00FF88', letterSpacing: '-0.02em', textShadow: '0 0 10px rgba(0,255,136,0.4)', marginBottom: 4 }}>
                {formatCryptoPrice(c.price)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(c.change_24h), marginBottom: 10 }}>
                {c.change_24h != null ? `${c.change_24h >= 0 ? '+' : ''}$${Math.abs(c.change_24h).toLocaleString('en-US', { maximumFractionDigits: 3 })}` : '—'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {[
                  { l: 'MKT CAP', v: formatLargeNum(c.market_cap) },
                  { l: 'VOL 24H', v: formatLargeNum(c.volume) },
                  { l: 'DOMINANCE', v: c.dominance != null ? `${c.dominance.toFixed(1)}%` : '—' },
                ].map(m => (
                  <div key={m.l} style={{ backgroundColor: '#03080F', padding: '5px 7px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#1D4A30', letterSpacing: '0.1em', marginBottom: 3 }}>{m.l}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#4DCC88' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: CoinGecko (free public API) · updates on tab load'}
      </div>
    </div>
  )
}
