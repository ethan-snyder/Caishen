import { useState } from 'react'
import { fetchStock, type StockData } from '@/lib/api'
import { formatMoney, formatNum } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'

const border = '1px solid rgba(212,175,55,0.14)'

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Cinzel', serif",
      fontSize: 14,
      textShadow: '0 0 10px rgba(212,175,55,0.35)',
      fontWeight: 600,
      color: '#D4AF37',
      letterSpacing: '0.2em',
      marginBottom: 10,
      marginTop: 26,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ color: '#9B59B6', fontSize: 10 }}>◆</span>
      {children}
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.3), transparent)' }} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      backgroundColor: '#130B1B',
      border,
      padding: '12px 14px',
      transition: 'border-color 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.14)')}
    >
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        color: '#8C7A9E',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 18,
        fontWeight: 600,
        color: '#FFFFFF',
        textShadow: '0 0 6px rgba(255,255,255,0.2)',
        letterSpacing: '-0.01em',
      }}>{value}</div>
    </div>
  )
}

export default function StockInfo() {
  const [inputVal, setInputVal] = useState('AAPL')
  const [ticker, setTicker] = useState<string | null>(null)
  const [data, setData] = useState<StockData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = (t: string) => {
    setTicker(t)
    setLoading(true)
    setError(null)
    setData(null)
    fetchStock(t)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const d = data

  return (
    <div>
      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); if (inputVal.trim()) load(inputVal.trim()) }} style={{ display: 'flex', gap: 8, maxWidth: 440, marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#8C7A9E',
          }}>$</span>
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            placeholder="TICKER"
            style={{
              width: '100%',
              backgroundColor: '#130B1B',
              border,
              padding: '9px 12px 9px 28px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              color: '#FFFFFF',
              letterSpacing: '0.08em',
              outline: 'none',
              caretColor: '#D4AF37',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.14)')}
          />
        </div>
        <button type="submit" style={{
          backgroundColor: '#D4AF37',
          color: '#0A0610',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          padding: '9px 18px',
          cursor: 'pointer',
          letterSpacing: '0.08em',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#E8C65A')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#D4AF37')}
        >
          FETCH
        </button>
      </form>

      {ticker === null && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8C7A9E' }}>
          Enter a ticker and hit FETCH to pull live metrics.
        </div>
      )}

      {loading && <Loading label={`FETCHING ${ticker}`} />}
      {error && <ErrorBlock message={error} onRetry={() => ticker && load(ticker)} />}

      {d && !loading && !error && (
        <>
          {/* Header */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 32,
                fontWeight: 600,
                color: '#F4EFE6',
                letterSpacing: '0.02em',
              }}>{d.name}</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: '#8C7A9E',
                letterSpacing: '0.1em',
              }}>{d.ticker}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 30,
                fontWeight: 600,
                color: '#FFFFFF',
                textShadow: '0 0 10px rgba(255,255,255,0.25)',
                letterSpacing: '-0.02em',
              }}>{formatMoney(d.price)}</span>
              {d.change !== null && d.changePct !== null && (
                <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                  <Delta value={d.change} format={v => v.toFixed(2)} size={14} />
                  <Delta value={d.changePct} format={v => `${v.toFixed(2)}%`} size={14} badge />
                </span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8C7A9E' }}>
                MKT CAP {d.marketCap}
              </span>
            </div>
          </div>

          <SectionHead>VALUATION</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="P/E RATIO" value={formatNum(d.pe)} />
            <Cell label="FORWARD P/E" value={formatNum(d.forwardPe)} />
            <Cell label="PEG RATIO" value={formatNum(d.peg)} />
            <Cell label="P/S RATIO" value={formatNum(d.ps)} />
            <Cell label="P/B RATIO" value={formatNum(d.pb)} />
            <Cell label="EPS (TTM)" value={d.eps !== null ? `$${d.eps.toFixed(2)}` : '—'} />
          </div>

          <SectionHead>COST OF CAPITAL</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="CAPM" value={d.capm} />
            <Cell label="WACC" value={d.wacc} />
            <Cell label="BETA" value={formatNum(d.beta)} />
            <Cell label="RISK-FREE RATE" value={d.rf} />
          </div>

          <SectionHead>PER SHARE</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}>
            <Cell label="DIVIDEND" value={d.dividend !== null ? `$${d.dividend.toFixed(2)}` : '—'} />
            <Cell label="DIV YIELD" value={d.dividendYield} />
            <Cell label="CASH/SHARE" value={d.cashPerShare !== null ? `$${d.cashPerShare.toFixed(2)}` : '—'} />
            <Cell label="52-WK HIGH" value={d.week52High !== null ? `$${d.week52High.toFixed(2)}` : '—'} />
            <Cell label="52-WK LOW" value={d.week52Low !== null ? `$${d.week52Low.toFixed(2)}` : '—'} />
          </div>

          {/* 52-week range */}
          {d.week52High !== null && d.week52Low !== null && (
            <div style={{ marginTop: 8, backgroundColor: '#130B1B', border, padding: '14px 16px' }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#8C7A9E',
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10,
              }}>52-WEEK RANGE</div>
              <div style={{ position: 'relative', height: 4, backgroundColor: 'rgba(212,175,55,0.06)' }}>
                {(() => {
                  const pct = ((d.price - d.week52Low!) / (d.week52High! - d.week52Low!)) * 100
                  return (
                    <>
                      <div style={{
                        position: 'absolute', left: 0, width: `${pct}%`, height: '100%',
                        background: 'linear-gradient(90deg, rgba(212,175,55,0.2), #D4AF37)',
                      }} />
                      <div style={{
                        position: 'absolute', left: `${pct}%`, top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 8, height: 8,
                        backgroundColor: '#D4AF37',
                        border: '2px solid #0A0610',
                        boxShadow: '0 0 8px #D4AF37',
                      }} />
                    </>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FFFFFF' }}>${d.week52Low.toFixed(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#D4AF37', fontWeight: 600 }}>${d.price.toFixed(2)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FFFFFF' }}>${d.week52High.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div style={{
            marginTop: 12, padding: '9px 12px',
            backgroundColor: 'rgba(212,175,55,0.03)',
            border: '1px solid rgba(212,175,55,0.08)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, color: '#5E4D70',
          }}>
            {'// DATA: yfinance · CAPM: Rf + β×ERP · WACC: manual · ERP default 5.5%'}
          </div>
        </>
      )}
    </div>
  )
}
