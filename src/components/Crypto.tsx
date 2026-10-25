import { useEffect, useState } from 'react'
import { fetchCrypto, type CryptoCoin } from '@/lib/api'
import { formatCryptoPrice, formatLargeNum } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'

export default function Crypto() {
  const [coins, setCoins] = useState<CryptoCoin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)

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
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)' }}>
          CRYPTO MARKETS
        </span>
        {coins && coins.length > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#8C7A9E' }}>
            TOTAL MKTCAP: <span style={{ color: '#FFFFFF' }}>{formatLargeNum(totalMktCap, '$')}</span>
            &nbsp;·&nbsp;BTC DOM: <span style={{ color: '#FFFFFF' }}>{btc?.dominance != null ? `${btc.dominance.toFixed(1)}%` : '—'}</span>
          </span>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !coins && <Loading label="PULLING TOP 10 BY MARKET CAP" />}

      {coins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
          {coins.map(c => (
            <div key={c.symbol} {...chartRowProps(() => setChart({ kind: 'crypto', id: c.symbol, label: c.name, sub: `${c.symbol} / USD` }))} style={{ backgroundColor: '#130B1B', border, padding: '16px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#FFFFFF', marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#8C7A9E', letterSpacing: '0.1em' }}>{c.symbol}/USD</div>
                </div>
                <Delta value={c.change_pct_24h} format={v => `${v.toFixed(2)}%`} size={11} badge />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                {formatCryptoPrice(c.price)}
              </div>
              <div style={{ marginBottom: 10 }}>
                <Delta value={c.change_24h} format={v => `$${v.toLocaleString('en-US', { maximumFractionDigits: 3 })}`} size={12} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {[
                  { l: 'MKT CAP', v: formatLargeNum(c.market_cap) },
                  { l: 'VOL 24H', v: formatLargeNum(c.volume) },
                  { l: 'DOMINANCE', v: c.dominance != null ? `${c.dominance.toFixed(1)}%` : '—' },
                ].map(m => (
                  <div key={m.l} style={{ backgroundColor: '#0A0610', padding: '5px 7px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5E4D70', letterSpacing: '0.1em', marginBottom: 3 }}>{m.l}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FFFFFF' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: CoinGecko (free public API) · updates on tab load'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
