import { useState } from 'react'
import { fetchStockQuote, type StockQuote } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'

type ScenarioKey = 'bear' | 'base' | 'bull'
interface YearAssumptions { epsGrowth: string; pe: string }
interface Scenario {
  label: string; color: string; bgOpacity: string
  years: [YearAssumptions, YearAssumptions, YearAssumptions]
}

const DEFAULT_SCENARIOS: Record<ScenarioKey, Scenario> = {
  bear: {
    label: 'BEAR', color: '#FF3B3B', bgOpacity: 'rgba(255,59,59,0.05)',
    years: [{ epsGrowth: '3', pe: '24' }, { epsGrowth: '2', pe: '22' }, { epsGrowth: '2', pe: '20' }],
  },
  base: {
    label: 'BASE', color: '#00FF88', bgOpacity: 'rgba(0,255,136,0.05)',
    years: [{ epsGrowth: '9', pe: '30' }, { epsGrowth: '10', pe: '30' }, { epsGrowth: '11', pe: '31' }],
  },
  bull: {
    label: 'BULL', color: '#FFD700', bgOpacity: 'rgba(255,215,0,0.05)',
    years: [{ epsGrowth: '15', pe: '36' }, { epsGrowth: '16', pe: '38' }, { epsGrowth: '18', pe: '40' }],
  },
}

const CURRENT_YEAR = new Date().getFullYear()
const border = '1px solid rgba(0,255,136,0.12)'

function computePrices(sc: Scenario, baseEps: number): number[] {
  let eps = baseEps
  return sc.years.map(y => {
    eps = eps * (1 + parseFloat(y.epsGrowth) / 100)
    const p = eps * parseFloat(y.pe)
    return isNaN(p) ? 0 : p
  })
}

export default function Projector() {
  const [inputVal, setInputVal] = useState('AAPL')
  const [ticker, setTicker] = useState<string | null>(null)
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [manualEps, setManualEps] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState(DEFAULT_SCENARIOS)

  const load = (t: string) => {
    setTicker(t)
    setLoading(true)
    setError(null)
    setQuote(null)
    fetchStockQuote(t)
      .then(q => { setQuote(q); setManualEps(q.eps !== null ? String(q.eps) : '') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const update = (k: ScenarioKey, i: number, f: keyof YearAssumptions, v: string) => {
    setScenarios(prev => {
      const years = [...prev[k].years] as typeof prev[typeof k]['years']
      years[i] = { ...years[i], [f]: v }
      return { ...prev, [k]: { ...prev[k], years } }
    })
  }

  const keys: ScenarioKey[] = ['bear', 'base', 'bull']
  const baseEps = parseFloat(manualEps)
  const currentPrice = quote?.price ?? null
  const ready = quote !== null && !isNaN(baseEps)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4',
          letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)',
        }}>3-YEAR PRICE PROJECTOR</div>

        <form onSubmit={e => { e.preventDefault(); if (inputVal.trim()) load(inputVal.trim()) }} style={{ display: 'flex', gap: 8, maxWidth: 360, marginTop: 12 }}>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            placeholder="TICKER"
            style={{
              flex: 1, backgroundColor: '#060E18', border, padding: '8px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#00FF88',
              letterSpacing: '0.08em', outline: 'none', caretColor: '#00FF88',
            }}
          />
          <button type="submit" style={{
            backgroundColor: '#00FF88', color: '#03080F', fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12, fontWeight: 700, border: 'none', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.08em',
          }}>LOAD BASE</button>
        </form>

        {loading && <div style={{ marginTop: 12 }}><Loading label={`FETCHING ${ticker}`} /></div>}
        {error && <div style={{ marginTop: 12 }}><ErrorBlock message={error} onRetry={() => ticker && load(ticker)} /></div>}

        {quote && !loading && !error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#2D6644', marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span>CURRENT: <span style={{ color: '#C8FFD4' }}>{currentPrice !== null ? `$${currentPrice.toFixed(2)}` : '—'}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              BASE EPS (TTM):
              <input
                value={manualEps}
                onChange={e => setManualEps(e.target.value)}
                style={{
                  width: 80, backgroundColor: '#03080F', border: '1px solid rgba(0,255,136,0.15)',
                  padding: '3px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#00FF88',
                  outline: 'none',
                }}
              />
            </span>
            <span>MODEL: <span style={{ color: '#2D6644' }}>PRICE = EPS × P/E</span></span>
          </div>
        )}
        {!quote && !loading && !error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#2D6644', marginTop: 12 }}>
            Load a ticker to seed the base EPS and current price for the projection.
          </div>
        )}
      </div>

      {ready && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {keys.map(key => {
              const sc = scenarios[key]
              const prices = computePrices(sc, baseEps)
              const ret3 = currentPrice ? ((prices[2] - currentPrice) / currentPrice) * 100 : 0

              return (
                <div key={key} style={{ backgroundColor: '#060E18', border: `1px solid ${sc.color}22`, overflow: 'hidden' }}>
                  <div style={{
                    padding: '10px 14px', backgroundColor: sc.bgOpacity, borderBottom: `1px solid ${sc.color}22`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: sc.color, letterSpacing: '0.1em', textShadow: `0 0 8px ${sc.color}` }}>{sc.label} CASE</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: ret3 >= 0 ? '#00FF88' : '#FF3B3B' }}>
                      {ret3 >= 0 ? '+' : ''}{ret3.toFixed(0)}% / 3YR
                    </span>
                  </div>

                  <div style={{ padding: '14px' }}>
                    {([0, 1, 2] as const).map(i => (
                      <div key={i} style={{ marginBottom: i < 2 ? 14 : 0 }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 7 }}>
                          YEAR {i + 1} — {CURRENT_YEAR + i + 1}
                        </div>
                        <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                          {[
                            { label: 'EPS GRW %', field: 'epsGrowth' as const },
                            { label: 'EXIT P/E', field: 'pe' as const },
                          ].map(({ label, field }) => (
                            <div key={field} style={{ flex: 1 }}>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#1D4A30', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
                              <input
                                type="number"
                                value={sc.years[i][field]}
                                onChange={e => update(key, i, field, e.target.value)}
                                style={{
                                  width: '100%', backgroundColor: '#03080F', border: '1px solid rgba(0,255,136,0.1)',
                                  padding: '6px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                                  color: '#C8FFD4', outline: 'none', caretColor: '#00FF88',
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#03080F', padding: '6px 9px' }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.1em' }}>IMPLIED PRICE</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: sc.color, textShadow: `0 0 8px ${sc.color}80` }}>
                            ${prices[i].toFixed(2)}
                          </span>
                        </div>
                        {i < 2 && <div style={{ height: 1, backgroundColor: 'rgba(0,255,136,0.05)', marginTop: 14 }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div style={{ marginTop: 14, backgroundColor: '#060E18', border, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88', letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)', marginBottom: 14 }}>
              YEAR 3 TARGETS
            </div>

            {keys.map(key => {
              const sc = scenarios[key]
              const prices = computePrices(sc, baseEps)
              const p3 = prices[2]
              const maxP = Math.max(...keys.map(k => computePrices(scenarios[k], baseEps)[2]))
              const ret = currentPrice ? ((p3 - currentPrice) / currentPrice) * 100 : 0

              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 }}>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: sc.color, width: 38, letterSpacing: '0.06em', textShadow: `0 0 6px ${sc.color}80` }}>{sc.label}</span>
                  <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(0,255,136,0.05)' }}>
                    <div style={{ width: `${maxP > 0 ? (p3 / maxP) * 100 : 0}%`, height: '100%', backgroundColor: sc.color, opacity: 0.7, boxShadow: `0 0 6px ${sc.color}`, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: sc.color, width: 74, textAlign: 'right' }}>${p3.toFixed(2)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: ret >= 0 ? '#00FF88' : '#FF3B3B', width: 68, textAlign: 'right' }}>
                    {ret >= 0 ? '+' : ''}{ret.toFixed(0)}%
                  </span>
                </div>
              )
            })}

            {currentPrice !== null && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,255,136,0.06)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#2D6644' }}>TODAY:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#C8FFD4' }}>${currentPrice.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
            {'// EPS compounds YoY from base TTM (editable above) · edit fields to recalculate live · all projections are estimates'}
          </div>
        </>
      )}
    </div>
  )
}
