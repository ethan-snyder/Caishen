import { useEffect, useMemo, useState } from 'react'
import {
  fetchWatchlists, createWatchlist, addWatchlistTicker, removeWatchlistTicker,
  type WatchlistsData, type WatchlistItem,
} from '@/lib/api'
import { posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import PriceChart, { chartRowProps, type ChartTarget } from './PriceChart'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, EditHint } from './LayoutKit'
import {
  useMetricConfig, MetricPicker, ConfirmRemove,
  fmtMoney, fmtPct, fmtSignedPct, fmtRatio, formatLargeNum,
  type MetricDef,
} from './TrackingKit'

const border = '1px solid rgba(212,175,55,0.12)'

/** Watchlists hold any yfinance-resolvable symbol (stocks, FX, futures,
 * indexes, crypto), so price formatting scales to the magnitude rather
 * than assuming share-like prices. */
const fmtPrice = (v: number | null) =>
  v === null ? '—' : `$${v.toFixed(v > 10 ? 2 : 4)}`

const METRICS: MetricDef<WatchlistItem>[] = [
  { id: 'price',        label: 'Price',       short: 'PRICE',   get: i => i.price,          format: v => fmtPrice(v), defaultOn: true },
  { id: 'change',       label: 'Change $',    short: 'CHG $',   get: i => i.change,         format: v => v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`, signed: true },
  { id: 'change_pct',   label: 'Change %',    short: 'CHG %',   get: i => i.change_pct,     format: v => fmtSignedPct(v), signed: true, defaultOn: true },
  { id: 'pe',           label: 'P/E (TTM)',   short: 'P/E',     get: i => i.pe,             format: v => fmtRatio(v), defaultOn: true },
  { id: 'forward_pe',   label: 'Forward P/E', short: 'FWD P/E', get: i => i.forward_pe,     format: v => fmtRatio(v), defaultOn: true },
  { id: 'dividend_yield', label: 'Div Yield', short: 'DIV %',   get: i => i.dividend_yield, format: v => fmtPct(v), defaultOn: true },
  { id: 'market_cap',   label: 'Market Cap',  short: 'MKT CAP', get: i => i.market_cap,     format: v => formatLargeNum(v, '$'), defaultOn: true },
  { id: 'dividend_rate', label: 'Div / Share', short: 'DIV/SH', get: i => i.dividend_rate,  format: v => fmtMoney(v) },
  { id: 'peg',          label: 'PEG',         short: 'PEG',     get: i => i.peg,            format: v => fmtRatio(v, 2) },
  { id: 'ps',           label: 'P/S',         short: 'P/S',     get: i => i.ps,             format: v => fmtRatio(v, 2) },
  { id: 'pb',           label: 'P/B',         short: 'P/B',     get: i => i.pb,             format: v => fmtRatio(v, 2) },
  { id: 'beta',         label: 'Beta',        short: 'BETA',    get: i => i.beta,           format: v => fmtRatio(v, 2) },
  { id: 'eps',          label: 'EPS',         short: 'EPS',     get: i => i.eps,            format: v => fmtMoney(v) },
  { id: 'week52_high',  label: '52W High',    short: '52W HI',  get: i => i.week52_high,    format: v => fmtMoney(v) },
  { id: 'week52_low',   label: '52W Low',     short: '52W LO',  get: i => i.week52_low,     format: v => fmtMoney(v) },
  { id: 'volume',       label: 'Volume',      short: 'VOL',     get: i => i.volume,         format: v => formatLargeNum(v) },
  { id: 'avg_volume',   label: 'Avg Volume',  short: 'AVG VOL', get: i => i.avg_volume,     format: v => formatLargeNum(v) },
  { id: 'sector',       label: 'Sector',      short: 'SECTOR',  get: () => null,            format: (_v, i) => i.sector ?? '—' },
]

export default function Watchlist() {
  const [data, setData] = useState<WatchlistsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [chart, setChart] = useState<ChartTarget | null>(null)
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

  const rawItems = active ? (data?.[active] ?? []) : []
  const rowItems = useMemo(
    () => rawItems.map(i => ({ id: i.ticker, label: i.ticker })),
    [rawItems],
  )
  const rows = useSortableLayout(`watchlist.items.${active ?? 'none'}`, rowItems)
  // One shared metric config across every list -- switching tabs keeps
  // the same columns rather than resetting per list.
  const metricCfg = useMetricConfig('watchlist.metrics', METRICS)

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING WATCHLISTS" />

  const listNames = Object.keys(data)
  const items = active ? (data[active] ?? []) : []
  const byTicker = new Map(items.map(i => [i.ticker, i]))

  // Aggregate dividend view for the active list. This is a simple average
  // of each holding's yield -- a watchlist has no share counts, so there
  // are no weights to apply and no dollar income to compute (unlike the
  // Portfolio page, where both are real).
  const withYield = items.filter(i => i.dividend_yield !== null)
  const avgYield = withYield.length
    ? withYield.reduce((s, i) => s + (i.dividend_yield ?? 0), 0) / withYield.length
    : null
  const totalDivPerShare = withYield.reduce((s, i) => s + (i.dividend_rate ?? 0), 0) || null

  const gridCols = `84px minmax(90px, 1fr) ${metricCfg.active.map(() => 'minmax(72px, 92px)').join(' ')} 52px`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 26, color: '#F4EFE6', letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)' }}>
          WATCHLIST
        </span>
        <form onSubmit={handleCreateList} style={{ display: 'flex', gap: 6 }}>
          <input
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            placeholder="NEW LIST NAME"
            style={{
              backgroundColor: '#130B1B', border, padding: '7px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#FFFFFF',
              letterSpacing: '0.06em', outline: 'none', width: 150, caretColor: '#D4AF37',
            }}
          />
          <button type="submit" style={{
            backgroundColor: 'rgba(212,175,55,0.1)', color: '#D4AF37',
            fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
            border: '1px solid rgba(212,175,55,0.3)', padding: '7px 14px',
            cursor: 'pointer', letterSpacing: '0.06em',
          }}>+ NEW LIST</button>
        </form>
      </div>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {listNames.length === 0 ? (
        <div style={{ backgroundColor: '#130B1B', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#A391B5' }}>
          No watchlists yet — create one above.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            {listNames.map(name => (
              <button key={name} type="button" onClick={() => setActive(name)} style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 15,
                color: active === name ? '#D4AF37' : '#A391B5',
                background: active === name ? 'rgba(107,42,122,0.35)' : 'transparent',
                border: `1px solid ${active === name ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.1)'}`,
                padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.06em',
                textShadow: active === name ? '0 0 6px #D4AF37' : 'none',
              }}>{name} <span style={{ color: '#7A6A8E', marginLeft: 4 }}>{(data[name] ?? []).length}</span></button>
            ))}
          </div>

          <form onSubmit={handleAddTicker} style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input
              value={newTicker}
              onChange={e => setNewTicker(e.target.value.toUpperCase())}
              placeholder="ADD TICKER"
              style={{
                backgroundColor: '#130B1B', border, padding: '7px 12px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#D4AF37',
                letterSpacing: '0.08em', outline: 'none', width: 140, caretColor: '#D4AF37',
              }}
            />
            <button type="submit" style={{
              backgroundColor: 'rgba(212,175,55,0.1)', color: '#D4AF37',
              fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
              border: '1px solid rgba(212,175,55,0.3)', padding: '7px 14px',
              cursor: 'pointer', letterSpacing: '0.06em',
            }}>ADD</button>
          </form>

          {items.length === 0 ? (
            <div style={{ backgroundColor: '#130B1B', border, padding: '24px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#A391B5' }}>
              This list is empty — add a ticker above. Works with stocks, indexes (^GSPC), FX (EURUSD=X), futures (GC=F), Treasury yields (^TNX), or crypto (BTC-USD).
            </div>
          ) : (
            <>
              {avgYield !== null && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6, marginBottom: 14 }}>
                  <div style={{ backgroundColor: '#130B1B', border, padding: '12px 14px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5', letterSpacing: '0.12em', marginBottom: 5 }}>AVG DIV YIELD</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: '#F2C94C', textShadow: '0 0 8px rgba(242,201,76,0.35)' }}>
                      {fmtPct(avgYield)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#130B1B', border, padding: '12px 14px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5', letterSpacing: '0.12em', marginBottom: 5 }}>DIV / SHARE / YR (SUM)</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: '#F2C94C', textShadow: '0 0 8px rgba(242,201,76,0.35)' }}>
                      {fmtMoney(totalDivPerShare)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#130B1B', border, padding: '12px 14px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#A391B5', letterSpacing: '0.12em', marginBottom: 5 }}>PAYERS</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: '#FFFFFF' }}>
                      {withYield.length}<span style={{ fontSize: 15, color: '#A391B5' }}> / {items.length}</span>
                    </div>
                  </div>
                </div>
              )}

              <EditHint />

              <MetricPicker
                metrics={METRICS}
                enabled={metricCfg.enabled}
                onToggle={metricCfg.toggle}
                onReset={metricCfg.reset}
              />

              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 'min-content' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, padding: '0 14px 8px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#7A6A8E', letterSpacing: '0.1em' }}>TICKER</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#7A6A8E', letterSpacing: '0.1em' }}>NAME</div>
                    {metricCfg.active.map(m => (
                      <div key={m.id} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#7A6A8E', letterSpacing: '0.1em' }}>{m.short}</div>
                    ))}
                    <div />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rows.visible.map(ticker => {
                      const item = byTicker.get(ticker)
                      if (!item) return null
                      return (
                        <Draggable key={item.ticker} id={item.ticker} label={item.ticker} api={rows} allowHide={false}>
                          <div {...chartRowProps(() => setChart({ kind: 'stock', id: item.ticker, sub: item.name ?? undefined }))} style={{
                            cursor: 'pointer', display: 'grid', gridTemplateColumns: gridCols, gap: 6,
                            alignItems: 'center', backgroundColor: '#130B1B', border, padding: '12px 14px', transition: 'border-color 0.1s',
                          }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)')}
                          >
                            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 16, color: '#D4AF37', textShadow: '0 0 6px rgba(212,175,55,0.4)' }}>{item.ticker}</div>
                            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#C9B8D9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name ?? ''}>{item.name ?? '—'}</div>
                            {metricCfg.active.map(m => {
                              const raw = m.get(item)
                              return (
                                <div key={m.id} style={{
                                  fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
                                  color: m.signed ? posNegColor(raw) : '#FFFFFF',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {m.format(raw, item)}
                                </div>
                              )
                            })}
                            <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}><ConfirmRemove onConfirm={() => handleRemove(item.ticker)} title={item.ticker} /></span>
                          </div>
                        </Draggable>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(212,175,55,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#7A6A8E' }}>
        {'// DATA SOURCE: yfinance · saved to watchlists.txt on the backend · ratios/dividends only apply to individual stocks, so FX/futures/index rows show "—" · metric columns are saved in this browser · avg yield is an unweighted average (a watchlist has no share counts to weight by)'}
      </div>

      {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}
    </div>
  )
}
