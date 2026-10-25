import { useEffect, useState } from 'react'
import { fetchBonds, type BondYield } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'

export default function Bonds() {
  const [yields, setYields] = useState<BondYield[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)

  const load = () => {
    setError(null)
    setYields(null)
    fetchBonds().then(setYields).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const available = yields?.filter(t => t.yield !== null) ?? []
  const maxYield = available.length ? Math.max(...available.map(t => t.yield as number)) : 1

  return (
    <div>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 20 }}>
        BONDS {'&'} FIXED INCOME
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !yields && <Loading label="PULLING TREASURY YIELDS" />}

      {yields && (
        <div style={{ backgroundColor: '#130B1B', border, padding: '18px' }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 600, color: '#D4AF37', letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.35)', marginBottom: 14 }}>
            {'◆ US TREASURY YIELD CURVE'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${yields.length}, 1fr)`, gap: 6, alignItems: 'end', height: 100, marginBottom: 10 }}>
            {yields.map(t => (
              <div key={t.term} {...chartRowProps(() => setChart({ kind: 'bond', id: t.name, sub: `${t.term} U.S. Treasury` }))} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: '#FFFFFF' }}>
                  {t.yield !== null ? `${t.yield.toFixed(2)}%` : '—'}
                </div>
                <div style={{
                  width: '100%',
                  height: t.yield !== null ? `${(t.yield / maxYield) * 64}px` : '2px',
                  backgroundColor: 'rgba(107,42,122,0.35)',
                  border: '1px solid rgba(212,175,55,0.35)',
                  boxShadow: 'inset 0 0 6px rgba(212,175,55,0.1)',
                  position: 'relative',
                }}>
                  {t.yield !== null && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${(t.yield / maxYield) * 64}px`,
                      background: 'linear-gradient(0deg, rgba(212,175,55,0.25), transparent)',
                    }} />
                  )}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E', letterSpacing: '0.06em' }}>{t.term}</div>
                <Delta value={t.change} format={v => v.toFixed(2)} size={10} />
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5E4D70' }}>
            {'// U.S. Treasury curve only -- 13-week, 5-year, 10-year, 30-year are the tenors with reliable free data (yfinance). '}
            {'Other maturities and other countries\u2019 sovereign yields aren\u2019t consistently available for free, so they\u2019re left out rather than estimated.'}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, padding: '18px', backgroundColor: '#130B1B', border, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8C7A9E' }}>
        {'◆ CORPORATE BONDS'}
        <div style={{ marginTop: 8, color: '#5E4D70' }}>
          {'No free, reliable data source for individual corporate bond quotes was found -- rather than show fabricated bonds/yields, this section is left out. Open to wiring a real source if one turns up.'}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: yfinance (Treasury yield tickers)'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
