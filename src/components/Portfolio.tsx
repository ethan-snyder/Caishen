import { useEffect, useMemo, useState } from 'react'
import { fetchPortfolio, addPortfolioHolding, removePortfolioHolding, type PortfolioData } from '@/lib/api'
import { formatMoney, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'
const COLORS = ['#00FF88', '#4DFF9A', '#00CC6A', '#008F4A', '#FFD700', '#FF8C00', '#4DCC88', '#2D6644']

const PORTFOLIO_SECTIONS = [
  { id: 'add_form', label: 'ADD HOLDING FORM' },
  { id: 'summary', label: 'SUMMARY TOTALS' },
  { id: 'holdings', label: 'HOLDINGS TABLE' },
  { id: 'allocation', label: 'ALLOCATION' },
]

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Hooks must run before any early return, so this is computed from the
  // possibly-null data rather than from the post-return derived values.
  const sections = useSortableLayout('portfolio.sections', PORTFOLIO_SECTIONS)
  const summaryItems = useMemo(() => [
    { id: 'total_value', label: 'TOTAL VALUE' },
    { id: 'total_cost', label: 'TOTAL COST' },
    { id: 'total_gain', label: 'TOTAL GAIN' },
    { id: 'total_return', label: 'TOTAL RETURN' },
  ], [])
  const summaryTiles = useSortableLayout('portfolio.summary', summaryItems)

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING PORTFOLIO" />

  const validHoldings = data.holdings.filter(h => h.value !== null)
  const holdings = [...validHoldings].sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity))
  const hasCostBasis = data.total_cost_basis !== null

  const summaryByIdShown: Record<string, { label: string; value: string; color: string; show: boolean }> = {
    total_value:  { label: 'TOTAL VALUE', value: formatMoney(data.total_value, 0), color: '#C8FFD4', show: true },
    total_cost:   { label: 'TOTAL COST', value: formatMoney(data.total_cost_basis, 0), color: '#4DCC88', show: hasCostBasis },
    total_gain:   { label: 'TOTAL GAIN', value: data.total_gain !== null ? `${data.total_gain >= 0 ? '+' : ''}${formatMoney(data.total_gain, 0)}` : '—', color: posNegColor(data.total_gain), show: hasCostBasis },
    total_return: { label: 'TOTAL RETURN', value: data.total_gain_pct !== null ? `${data.total_gain_pct >= 0 ? '+' : ''}${data.total_gain_pct.toFixed(2)}%` : '—', color: posNegColor(data.total_gain_pct), show: hasCostBasis },
  }
  const visibleSummary = summaryTiles.visible.filter(id => summaryByIdShown[id]?.show)

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 16 }}>
        PORTFOLIO
      </span>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {data.errors.length > 0 && (
        <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#FFD700' }}>
          {data.errors.map((e, i) => <div key={i}>{'// '}{e}</div>)}
        </div>
      )}

      <EditHint />

      {sections.visible.map(sectionId => {
        if (sectionId === 'add_form') return (
          <Draggable key="add_form" id="add_form" label="ADD HOLDING FORM" api={sections} variant="section">
      {/* Add holding form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={tickerIn} onChange={e => setTickerIn(e.target.value.toUpperCase())} placeholder="TICKER" style={{
          backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#00FF88', letterSpacing: '0.08em', outline: 'none', width: 100, caretColor: '#00FF88',
        }} />
        <input value={qtyIn} onChange={e => setQtyIn(e.target.value)} placeholder="QTY" type="number" style={{
          backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#C8FFD4', outline: 'none', width: 90, caretColor: '#00FF88',
        }} />
        <input value={costIn} onChange={e => setCostIn(e.target.value)} placeholder="AVG COST (optional)" type="number" style={{
          backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: '#C8FFD4', outline: 'none', width: 150, caretColor: '#00FF88',
        }} />
        <button type="submit" disabled={submitting} style={{
          backgroundColor: 'rgba(0,255,136,0.1)', color: '#00FF88', fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11, border: '1px solid rgba(0,255,136,0.3)', padding: '7px 14px',
          cursor: submitting ? 'default' : 'pointer', letterSpacing: '0.06em', opacity: submitting ? 0.5 : 1,
        }}>{submitting ? 'ADDING...' : 'ADD HOLDING'}</button>
      </form>
          </Draggable>
        )

        if (holdings.length === 0) return null

        if (sectionId === 'summary') return (
          <Draggable key="summary" id="summary" label="SUMMARY TOTALS" api={sections} variant="section">
        <>
          {/* Summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, visibleSummary.length)}, 1fr)`, gap: 6, marginBottom: 16 }}>
            {visibleSummary.map(id => {
              const s = summaryByIdShown[id]
              return (
              <Draggable key={id} id={id} label={s.label} api={summaryTiles}>
              <div style={{ backgroundColor: '#060E18', border, padding: '14px 16px', height: '100%' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.12em', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: s.color, textShadow: `0 0 8px ${s.color}60` }}>{s.value}</div>
              </div>
              </Draggable>
              )
            })}
          </div>
          <AddWidgetTray api={summaryTiles} title="HIDDEN SUMMARY TILES" />

          {!hasCostBasis && (
            <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
              {'// Add an AVG COST when adding a holding to unlock gain/loss tracking'}
            </div>
          )}
        </>
          </Draggable>
        )

        if (sectionId === 'holdings') return (
          <Draggable key="holdings" id="holdings" label="HOLDINGS TABLE" api={sections} variant="section">
        <>
          {/* Sort controls */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30', alignSelf: 'center', marginRight: 6 }}>SORT:</span>
            {(['value', 'gain', 'gain_pct'] as const).map(s => (
              <button key={s} type="button" onClick={() => setSortBy(s)} style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                color: sortBy === s ? '#00FF88' : '#2D6644',
                background: sortBy === s ? 'rgba(0,255,136,0.08)' : 'transparent',
                border: `1px solid ${sortBy === s ? 'rgba(0,255,136,0.3)' : 'rgba(0,255,136,0.1)'}`,
                padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                textShadow: sortBy === s ? '0 0 6px #00FF88' : 'none',
              }}>
                {s === 'value' ? 'VALUE' : s === 'gain' ? 'GAIN $' : 'GAIN %'}
              </button>
            ))}
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px 90px 90px 100px 40px', gap: 6, padding: '0 14px 8px' }}>
            {['TICKER', 'NAME', 'QTY', 'AVG COST', 'CURRENT', 'VALUE', 'GAIN', 'RETURN', ''].map(h => (
              <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', letterSpacing: '0.1em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {holdings.map(h => (
              <div key={h.ticker} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 70px 80px 80px 90px 90px 100px 40px', gap: 6,
                alignItems: 'center', backgroundColor: '#060E18', border, padding: '11px 14px', transition: 'border-color 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)')}
              >
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#00FF88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>{h.ticker}</div>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#4DCC88' }}>{h.name ?? '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C8FFD4' }}>{h.qty}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C8FFD4' }}>{h.avg_cost !== null ? `$${h.avg_cost.toFixed(2)}` : '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C8FFD4' }}>{h.price !== null ? `$${h.price.toFixed(2)}` : '—'}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#C8FFD4', fontWeight: 600 }}>{formatMoney(h.value, 0)}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: posNegColor(h.gain), textShadow: h.gain !== null ? `0 0 6px ${posNegColor(h.gain)}` : undefined }}>
                  {h.gain !== null ? `${h.gain >= 0 ? '+' : ''}${formatMoney(h.gain, 0)}` : '—'}
                </div>
                <div>
                  {h.gain_pct !== null ? (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(h.gain_pct),
                      backgroundColor: h.gain_pct >= 0 ? 'rgba(0,255,136,0.07)' : 'rgba(255,59,59,0.07)',
                      border: `1px solid ${h.gain_pct >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                      padding: '2px 7px', display: 'inline-block', textShadow: `0 0 5px ${posNegColor(h.gain_pct)}`,
                    }}>{h.gain_pct >= 0 ? '+' : ''}{h.gain_pct.toFixed(2)}%</span>
                  ) : '—'}
                </div>
                <button type="button" onClick={() => handleRemove(h.ticker)} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#1D4A30',
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
                onMouseLeave={e => (e.currentTarget.style.color = '#1D4A30')}
                >✕</button>
              </div>
            ))}
          </div>
        </>
          </Draggable>
        )

        if (sectionId === 'allocation') return (
          <Draggable key="allocation" id="allocation" label="ALLOCATION" api={sections} variant="section">
          {/* Allocation bar (by sector when known, else by ticker) */}
          <div style={{ marginTop: 14, backgroundColor: '#060E18', border, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88', letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)', marginBottom: 12 }}>
              {'/// ALLOCATION'}
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
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4DCC88' }}>{h.ticker}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#2D6644' }}>
                    {(((h.value ?? 0) / data.total_value) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          </Draggable>
        )

        return null
      })}

      {holdings.length === 0 && (
        <div style={{ backgroundColor: '#060E18', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#2D6644' }}>
          No holdings yet — add one above.
        </div>
      )}

      <AddWidgetTray api={sections} title="HIDDEN SECTIONS" />

      <div style={{ marginTop: 10, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: yfinance · positions saved to portfolio.txt on the backend'}
      </div>
    </div>
  )
}
