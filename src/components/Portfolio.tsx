import { useEffect, useState } from 'react'
import { fetchPortfolio, addPortfolioHolding, removePortfolioHolding, type PortfolioData } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'
const COLORS = ['#D4AF37', '#9B59B6', '#E8C65A', '#6B2A7A', '#B48CDB', '#A67C2E', '#C9B8D9', '#4B1F5A']

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)
  const [sortBy, setSortBy] = useState<'value' | 'gain_pct' | 'gain'>('value')
  const [tickerIn, setTickerIn] = useState('')
  const [qtyIn, setQtyIn] = useState('')
  const [costIn, setCostIn] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setError(null)
    fetchPortfolio().then(setData).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(qtyIn)
    if (!tickerIn.trim() || isNaN(qty)) return
    const avgCost = costIn.trim() ? parseFloat(costIn) : undefined
    setSubmitting(true)
    addPortfolioHolding(tickerIn.trim().toUpperCase(), qty, avgCost)
      .then(d => { setData(d); setTickerIn(''); setQtyIn(''); setCostIn('') })
      .catch(e => setError(e.message))
      .finally(() => setSubmitting(false))
  }

  const handleRemove = (ticker: string) => {
    removePortfolioHolding(ticker).then(setData).catch(e => setError(e.message))
  }

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING PORTFOLIO" />

  const validHoldings = data.holdings.filter(h => h.value !== null)
  const holdings = [...validHoldings].sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity))
  const hasCostBasis = data.total_cost_basis !== null

  return (
    <div>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)', display: 'block', marginBottom: 16 }}>
        PORTFOLIO
      </span>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {data.errors.length > 0 && (
        <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(242,201,76,0.05)', border: '1px solid rgba(242,201,76,0.2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#F2C94C' }}>
          {data.errors.map((e, i) => <div key={i}>{'// '}{e}</div>)}
        </div>
      )}

      {/* Add holding form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={tickerIn} onChange={e => setTickerIn(e.target.value.toUpperCase())} placeholder="TICKER" style={{
          backgroundColor: '#130B1B', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#D4AF37', letterSpacing: '0.08em', outline: 'none', width: 100, caretColor: '#D4AF37',
        }} />
        <input value={qtyIn} onChange={e => setQtyIn(e.target.value)} placeholder="QTY" type="number" style={{
          backgroundColor: '#130B1B', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#FFFFFF', outline: 'none', width: 90, caretColor: '#D4AF37',
        }} />
        <input value={costIn} onChange={e => setCostIn(e.target.value)} placeholder="AVG COST (optional)" type="number" style={{
          backgroundColor: '#130B1B', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#FFFFFF', outline: 'none', width: 150, caretColor: '#D4AF37',
        }} />
        <button type="submit" disabled={submitting} style={{
          backgroundColor: 'rgba(212,175,55,0.1)', color: '#D4AF37', fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11, border: '1px solid rgba(212,175,55,0.3)', padding: '7px 14px',
          cursor: submitting ? 'default' : 'pointer', letterSpacing: '0.06em', opacity: submitting ? 0.5 : 1,
        }}>{submitting ? 'ADDING...' : 'ADD HOLDING'}</button>
      </form>

      {holdings.length === 0 ? (
        <div style={{ backgroundColor: '#130B1B', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8C7A9E' }}>
          No holdings yet — add one above.
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: hasCostBasis ? 'repeat(4, 1fr)' : 'repeat(1, 1fr)', gap: 6, marginBottom: 16 }}>
            {[
              { label: 'TOTAL VALUE', node: <span>{formatMoney(data.total_value, 0)}</span>, show: true },
              { label: 'TOTAL COST', node: <span>{formatMoney(data.total_cost_basis, 0)}</span>, show: hasCostBasis },
              { label: 'TOTAL GAIN', node: <Delta value={data.total_gain} format={v => formatMoney(v, 0)} size={20} weight={600} />, show: hasCostBasis },
              { label: 'TOTAL RETURN', node: <Delta value={data.total_gain_pct} format={v => `${v.toFixed(2)}%`} size={20} weight={600} />, show: hasCostBasis },
            ].filter(s => s.show).map(s => (
              <div key={s.label} style={{ backgroundColor: '#130B1B', border, padding: '14px 16px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E', letterSpacing: '0.12em', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#FFFFFF', textShadow: '0 0 8px rgba(255,255,255,0.22)' }}>{s.node}</div>
              </div>
            ))}
          </div>

          {!hasCostBasis && (
            <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
              {'// Add an AVG COST when adding a holding to unlock gain/loss tracking'}
            </div>
          )}

          {/* Sort controls */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70', alignSelf: 'center', marginRight: 6 }}>SORT:</span>
            {(['value', 'gain', 'gain_pct'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                color: sortBy === s ? '#D4AF37' : '#8C7A9E',
                background: sortBy === s ? 'rgba(107,42,122,0.35)' : 'transparent',
                border: `1px solid ${sortBy === s ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.1)'}`,
                padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                              }}>
                {s === 'value' ? 'VALUE' : s === 'gain' ? 'GAIN $' : 'GAIN %'}
              </button>
            ))}
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px 90px 90px 100px 40px', gap: 6, padding: '0 14px 8px' }}>
            {['TICKER', 'NAME', 'QTY', 'AVG COST', 'CURRENT', 'VALUE', 'GAIN', 'RETURN', ''].map(h => (
              <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5E4D70', letterSpacing: '0.1em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {holdings.map(h => (
              <div key={h.ticker} {...chartRowProps(() => setChart({ kind: 'stock', id: h.ticker, sub: h.name ?? undefined }))} style={{
                cursor: 'pointer', display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px 90px 90px 100px 40px', gap: 6,
                alignItems: 'center', backgroundColor: '#130B1B', border, padding: '11px 14px', transition: 'border-color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
              >
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, fontWeight: 700, color: '#D4AF37' }}>{h.ticker}</div>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#C9B8D9' }}>{h.name ?? '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF' }}>{h.qty}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF' }}>{h.avg_cost !== null ? `$${h.avg_cost.toFixed(2)}` : '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF' }}>{h.price !== null ? `$${h.price.toFixed(2)}` : '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>{formatMoney(h.value, 0)}</div>
                <div><Delta value={h.gain} format={v => formatMoney(v, 0)} size={13} /></div>
                <div><Delta value={h.gain_pct} format={v => `${v.toFixed(2)}%`} size={12} badge /></div>
                <button onClick={e => { e.stopPropagation(); handleRemove(h.ticker) }} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5E4D70',
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FF4D4D')}
                onMouseLeave={e => (e.currentTarget.style.color = '#5E4D70')}
                >✕</button>
              </div>
            ))}
          </div>

          {/* Allocation bar (by sector when known, else by ticker) */}
          <div style={{ marginTop: 14, backgroundColor: '#130B1B', border, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 600, color: '#D4AF37', letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.35)', marginBottom: 12 }}>
              {'◆ ALLOCATION'}
            </div>
            <div style={{ display: 'flex', height: 12, gap: 1, borderRadius: 1, overflow: 'hidden', marginBottom: 10 }}>
              {holdings.map((h, i) => (
                <div key={h.ticker} style={{ width: `${((h.value ?? 0) / data.total_value) * 100}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.8 }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {holdings.map((h, i) => (
                <div key={h.ticker} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, backgroundColor: COLORS[i % COLORS.length] }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#F4EFE6' }}>{h.ticker}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#FFFFFF' }}>
                    {(((h.value ?? 0) / data.total_value) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 10, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: yfinance · positions saved to portfolio.txt on the backend'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
