import { useEffect, useState } from 'react'
import {
  fetchWatchlists, createWatchlist, addWatchlistTicker, removeWatchlistTicker,
  type WatchlistsData,
} from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'

const border = '1px solid rgba(212,175,55,0.12)'

export default function Watchlist() {
  const [data, setData] = useState<WatchlistsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newTicker, setNewTicker] = useState('')

  const load = () => {
    setError(null)
    fetchWatchlists()
      .then(d => {
        setData(d)
        setActive(prev => prev && d[prev] ? prev : Object.keys(d)[0] ?? null)
      })
      .catch(e => setError(e.message))
  }

  useEffect(load, [])

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newListName.trim()) return
    createWatchlist(newListName.trim())
      .then(d => { setData(d); setActive(newListName.trim()); setNewListName('') })
      .catch(e => setError(e.message))
  }

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault()
    if (!active || !newTicker.trim()) return
    addWatchlistTicker(active, newTicker.trim())
      .then(d => { setData(d); setNewTicker('') })
      .catch(e => setError(e.message))
  }

  const handleRemove = (ticker: string) => {
    if (!active) return
    removeWatchlistTicker(active, ticker).then(setData).catch(e => setError(e.message))
  }

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING WATCHLISTS" />

  const listNames = Object.keys(data)
  const items = active ? (data[active] ?? []) : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 26, fontWeight: 600, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)' }}>
          WATCHLIST
        </span>
        <form onSubmit={handleCreateList} style={{ display: 'flex', gap: 6 }}>
          <input
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            placeholder="NEW LIST NAME"
            style={{
              backgroundColor: '#130B1B', border, padding: '7px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF',
              letterSpacing: '0.06em', outline: 'none', width: 150, caretColor: '#D4AF37',
            }}
          />
          <button type="submit" style={{
            backgroundColor: 'rgba(212,175,55,0.1)', color: '#D4AF37',
            fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
            border: '1px solid rgba(212,175,55,0.3)', padding: '7px 14px',
            cursor: 'pointer', letterSpacing: '0.06em',
          }}>+ NEW LIST</button>
        </form>
      </div>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {listNames.length === 0 ? (
        <div style={{ backgroundColor: '#130B1B', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8C7A9E' }}>
          No watchlists yet — create one above.
        </div>
      ) : (
        <>
          {/* List tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            {listNames.map(name => (
              <button key={name} onClick={() => setActive(name)} style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
                color: active === name ? '#D4AF37' : '#8C7A9E',
                background: active === name ? 'rgba(107,42,122,0.35)' : 'transparent',
                border: `1px solid ${active === name ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.1)'}`,
                padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.06em',
                              }}>{name} <span style={{ color: '#5E4D70', marginLeft: 4 }}>{(data[name] ?? []).length}</span></button>
            ))}
          </div>

          {/* Add ticker */}
          <form onSubmit={handleAddTicker} style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase())}
              placeholder="ADD TICKER"
              style={{
                backgroundColor: '#130B1B', border, padding: '7px 12px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#D4AF37',
                letterSpacing: '0.08em', outline: 'none', width: 140, caretColor: '#D4AF37',
              }}
            />
            <button type="submit" style={{
              backgroundColor: 'rgba(212,175,55,0.1)', color: '#D4AF37',
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
              border: '1px solid rgba(212,175,55,0.3)', padding: '7px 14px',
              cursor: 'pointer', letterSpacing: '0.06em',
            }}>ADD</button>
          </form>

          {items.length === 0 ? (
            <div style={{ backgroundColor: '#130B1B', border, padding: '24px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8C7A9E' }}>
              This list is empty — add a ticker above. Works with stocks, indexes (^GSPC), FX (EURUSD=X), futures (GC=F), Treasury yields (^TNX), or crypto (BTC-USD).
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 70px 40px', gap: 6, padding: '0 14px 8px' }}>
                {['TICKER', 'NAME', 'PRICE', 'CHANGE', 'P/E', ''].map(h => (
                  <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#5E4D70', letterSpacing: '0.1em' }}>{h}</div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map(item => (
                  <div key={item.ticker} {...chartRowProps(() => setChart({ kind: 'stock', id: item.ticker, sub: item.name ?? undefined }))} style={{
                    cursor: 'pointer', display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 70px 40px', gap: 6,
                    alignItems: 'center', backgroundColor: '#130B1B', border, padding: '12px 14px', transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
                  >
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, fontWeight: 700, color: '#D4AF37' }}>{item.ticker}</div>
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#C9B8D9' }}>{item.name ?? '—'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#FFFFFF', fontWeight: 600 }}>
                      {item.price !== null ? `$${item.price.toFixed(item.price > 10 ? 2 : 4)}` : '—'}
                    </div>
                    <div><Delta value={item.change_pct} format={v => `${v.toFixed(2)}%`} size={12} /></div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#FFFFFF' }}>
                      {item.pe !== null && item.pe > 0 ? item.pe.toFixed(1) : '—'}
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleRemove(item.ticker) }} style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5E4D70',
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF4D4D')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#5E4D70')}
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#5E4D70' }}>
        {'// DATA SOURCE: yfinance · saved to watchlists.txt on the backend · P/E only applies to individual stocks'}
      </div>
      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
