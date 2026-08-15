import { useEffect, useMemo, useState } from 'react'
import {
  fetchWatchlists, createWatchlist, addWatchlistTicker, removeWatchlistTicker,
  type WatchlistsData,
} from '@/lib/api'
import { posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'

export default function Watchlist() {
  const [data, setData] = useState<WatchlistsData | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Ticker order is saved per list, so reordering one watchlist doesn't
  // disturb another. Rows aren't layout-hideable -- the ✕ on each row is
  // the real "remove from watchlist" action against the backend.
  const rawItems = active ? (data?.[active] ?? []) : []
  const rowItems = useMemo(
    () => rawItems.map(i => ({ id: i.ticker, label: i.ticker })),
    [rawItems],
  )
  const rows = useSortableLayout(`watchlist.items.${active ?? 'none'}`, rowItems)

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING WATCHLISTS" />

  const listNames = Object.keys(data)
  const items = active ? (data[active] ?? []) : []
  const byTicker = new Map(items.map(i => [i.ticker, i]))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)' }}>
          WATCHLIST
        </span>
        <form onSubmit={handleCreateList} style={{ display: 'flex', gap: 6 }}>
          <input
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            placeholder="NEW LIST NAME"
            style={{
              backgroundColor: '#060E18', border, padding: '7px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C8FFD4',
              letterSpacing: '0.06em', outline: 'none', width: 150, caretColor: '#00FF88',
            }}
          />
          <button type="submit" style={{
            backgroundColor: 'rgba(0,255,136,0.1)', color: '#00FF88',
            fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
            border: '1px solid rgba(0,255,136,0.3)', padding: '7px 14px',
            cursor: 'pointer', letterSpacing: '0.06em',
          }}>+ NEW LIST</button>
        </form>
      </div>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {listNames.length === 0 ? (
        <div style={{ backgroundColor: '#060E18', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#2D6644' }}>
          No watchlists yet — create one above.
        </div>
      ) : (
        <>
          {/* List tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            {listNames.map(name => (
              <button key={name} type="button" onClick={() => setActive(name)} style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
                color: active === name ? '#00FF88' : '#2D6644',
                background: active === name ? 'rgba(0,255,136,0.08)' : 'transparent',
                border: `1px solid ${active === name ? 'rgba(0,255,136,0.3)' : 'rgba(0,255,136,0.1)'}`,
                padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.06em',
                textShadow: active === name ? '0 0 6px #00FF88' : 'none',
              }}>{name} <span style={{ color: '#1D4A30', marginLeft: 4 }}>{(data[name] ?? []).length}</span></button>
            ))}
          </div>

          {/* Add ticker */}
          <form onSubmit={handleAddTicker} style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase())}
              placeholder="ADD TICKER"
              style={{
                backgroundColor: '#060E18', border, padding: '7px 12px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#00FF88',
                letterSpacing: '0.08em', outline: 'none', width: 140, caretColor: '#00FF88',
              }}
            />
            <button type="submit" style={{
              backgroundColor: 'rgba(0,255,136,0.1)', color: '#00FF88',
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
              border: '1px solid rgba(0,255,136,0.3)', padding: '7px 14px',
              cursor: 'pointer', letterSpacing: '0.06em',
            }}>ADD</button>
          </form>

          {items.length === 0 ? (
            <div style={{ backgroundColor: '#060E18', border, padding: '24px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#2D6644' }}>
              This list is empty — add a ticker above. Works with stocks, indexes (^GSPC), FX (EURUSD=X), futures (GC=F), Treasury yields (^TNX), or crypto (BTC-USD).
            </div>
          ) : (
            <>
              <EditHint />
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 70px 40px', gap: 6, padding: '0 14px 8px' }}>
                {['TICKER', 'NAME', 'PRICE', 'CHANGE', 'P/E', ''].map(h => (
                  <div key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', letterSpacing: '0.1em' }}>{h}</div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.visible.map(ticker => {
                  const item = byTicker.get(ticker)
                  if (!item) return null
                  return (
                  <Draggable key={item.ticker} id={item.ticker} label={item.ticker} api={rows} allowHide={false}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 90px 90px 70px 40px', gap: 6,
                    alignItems: 'center', backgroundColor: '#060E18', border, padding: '12px 14px', transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)')}
                  >
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#00FF88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>{item.ticker}</div>
                    <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#4DCC88' }}>{item.name ?? '—'}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#C8FFD4', fontWeight: 600 }}>
                      {item.price !== null ? `$${item.price.toFixed(item.price > 10 ? 2 : 4)}` : '—'}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: posNegColor(item.change_pct), textShadow: item.change_pct !== null ? `0 0 5px ${posNegColor(item.change_pct)}` : undefined }}>
                      {item.change_pct !== null ? `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%` : '—'}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C8FFD4' }}>
                      {item.pe !== null && item.pe > 0 ? item.pe.toFixed(1) : '—'}
                    </div>
                    <button type="button" onClick={() => handleRemove(item.ticker)} style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#1D4A30',
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF3B3B')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#1D4A30')}
                    >✕</button>
                  </div>
                  </Draggable>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: yfinance · saved to watchlists.txt on the backend · P/E only applies to individual stocks'}
      </div>
    </div>
  )
}
