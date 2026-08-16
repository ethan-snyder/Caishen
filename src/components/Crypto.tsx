import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  fetchCrypto, fetchCryptoHistory,
  type CryptoCoin, type CryptoRange, type CryptoHistoryPoint,
} from '@/lib/api'
import { AxisLabels, GridLines } from './ChartGrid'
import { formatCryptoPrice, formatLargeNum, formatPct, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'
import { useCryptoStream, type LiveTick } from '@/lib/cryptoStream'

const border = '1px solid rgba(0,255,136,0.12)'

/** Small pulsing dot + label shown next to a price that's updating live
 * off the Coinbase feed, so it's visually obvious which numbers are
 * streaming and which are the last CoinGecko snapshot. */
function LiveBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      color: '#00FF88', letterSpacing: '0.08em',
    }}>
      <span className="blink" style={{
        width: 5, height: 5, borderRadius: '50%',
        backgroundColor: '#00FF88', boxShadow: '0 0 5px #00FF88',
        display: 'inline-block',
      }} />
      LIVE
    </span>
  )
}

const RANGES: { key: CryptoRange; label: string }[] = [
  { key: '1h', label: '1H' }, { key: '12h', label: '12H' }, { key: '24h', label: '24H' },
  { key: '1w', label: '1W' }, { key: '1mo', label: '1M' }, { key: '3mo', label: '3M' },
  { key: '6mo', label: '6M' }, { key: '1y', label: '1Y' }, { key: '3y', label: '3Y' },
  { key: '5y', label: '5Y' }, { key: '10y', label: '10Y' }, { key: 'all', label: 'ALL' },
]

/** Sub-day ranges carry a time-of-day; anything longer just needs the date. */
function formatHistoryDate(iso: string, range: CryptoRange) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  if (range === '1h' || range === '12h' || range === '24h') {
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Interactive price chart: hover crosshair + tooltip, y-axis min/max, x-axis start/end. */
function PriceChart({ points, range, color, height = 140 }: {
  points: CryptoHistoryPoint[]
  range: CryptoRange
  color: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#3C8F5F',
      }}>
        not enough history for this range
      </div>
    )
  }

  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range_ = max - min || 1
  const w = 600
  const h = height
  const step = w / (points.length - 1)

  const xAt = (i: number) => i * step
  const yAt = (v: number) => h - ((v - min) / range_) * h
  const coords = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.value).toFixed(2)}`).join(' ')

  const first = points[0].value
  const last = points[points.length - 1].value
  const up = last >= first
  const lineColor = up ? '#00FF88' : '#FF3B3B'
  const fillId = `crypto-fill-${up ? 'up' : 'down'}`

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const idx = Math.round(frac * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hoverPoint = hover !== null ? points[hover] : null
  const tooltipPct = hover !== null ? (xAt(hover) / w) * 100 : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10 }}>
        <AxisLabels min={min} max={max} height={h} minWidth={76} format={formatCryptoPrice} />
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair', display: 'block', overflow: 'visible' }}
          >
            <GridLines w={w} h={h} />
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#${fillId})`} />
            <polyline points={coords} fill="none" stroke={lineColor} strokeWidth={1.5} opacity={0.9} vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <line x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h} stroke={lineColor} strokeWidth={0.75} strokeDasharray="2,2" opacity={0.5} />
            )}
          </svg>
          {/* Hover dot is a CSS circle, not an SVG <circle> -- the SVG's
              preserveAspectRatio="none" stretches x and y by different
              factors to fill a wide, short container, which turns a
              true SVG circle into a visible oval. Positioning a real
              div circle by percentage (same trick already used for the
              tooltip below) keeps it round regardless of that stretch. */}
          {hover !== null && (
            <div style={{
              position: 'absolute',
              left: `${(xAt(hover) / w) * 100}%`,
              top: `${(yAt(points[hover].value) / h) * 100}%`,
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: lineColor, border: '1px solid #060E18',
              transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            }} />
          )}
          {hoverPoint && (
            <div style={{
              position: 'absolute', top: -6,
              left: `${tooltipPct}%`,
              transform: tooltipPct > 65 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: '#0A1420', border: `1px solid ${lineColor}`, padding: '5px 10px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#C8FFD4',
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ color: lineColor, fontWeight: 600 }}>{formatCryptoPrice(hoverPoint.value)}</div>
              <div style={{ fontSize: 13, color: '#4a5a52', marginTop: 1 }}>{formatHistoryDate(hoverPoint.date, range)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 86,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F', marginTop: 6,
      }}>
        <span>{formatHistoryDate(points[0].date, range)}</span>
        <span>{formatHistoryDate(points[points.length - 1].date, range)}</span>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ backgroundColor: '#03080F', padding: '7px 9px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#3C8F5F', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: color ?? '#4DCC88' }}>{value}</div>
    </div>
  )
}

function ChangeBadge({ label, value }: { label: string; value: number | null }) {
  const c = posNegColor(value)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      backgroundColor: value != null && value >= 0 ? 'rgba(0,255,136,0.06)' : 'rgba(255,59,59,0.06)',
      border: `1px solid ${value != null && value >= 0 ? 'rgba(0,255,136,0.18)' : 'rgba(255,59,59,0.18)'}`,
      padding: '5px 4px', flex: 1,
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#3C8F5F', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: c, textShadow: `0 0 5px ${c}` }}>{formatPct(value)}</span>
    </div>
  )
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days < 31) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${(days / 365).toFixed(1)}y ago`
}

/** Expanded per-coin panel: range-toggle chart plus the full metric set. */
function CoinDetail({ coin, tick, isLive }: { coin: CryptoCoin; tick: LiveTick | undefined; isLive: boolean }) {
  const [range, setRange] = useState<CryptoRange>('24h')
  const [history, setHistory] = useState<CryptoHistoryPoint[] | null>(null)
  const [histError, setHistError] = useState<string | null>(null)

  // Live values win where we have them; CoinGecko's snapshot fills in
  // everything the ticker channel doesn't carry (7D/30D/1Y changes,
  // market cap, supply, ATH/ATL -- all still CoinGecko-only).
  const livePrice = isLive ? tick?.price ?? coin.price : coin.price
  const live24hChg = isLive ? tick?.pricePctChg24h ?? coin.change_pct_24h : coin.change_pct_24h
  const live24hHigh = isLive ? tick?.high24h ?? coin.high_24h : coin.high_24h
  const live24hLow = isLive ? tick?.low24h ?? coin.low_24h : coin.low_24h

  useEffect(() => {
    if (!coin.id) { setHistError('no CoinGecko id for this coin'); return }
    setHistory(null)
    setHistError(null)

    // React (in dev, deliberately) can fire this effect twice in a row for
    // the same mount, and a click that changes `range` quickly starts a new
    // request before the previous one lands. Without this guard, whichever
    // response resolves *last* wins -- including a stale/slower one landing
    // after a newer, correct one and clobbering it. `cancelled` makes sure
    // only the response from the most recent effect run is ever applied.
    let cancelled = false
    fetchCryptoHistory(coin.id, range)
      .then(h => { if (!cancelled) setHistory(h.prices) })
      .catch(e => { if (!cancelled) setHistError(e.message) })
    return () => { cancelled = true }
  }, [coin.id, range])

  const supplyPct = coin.max_supply && coin.circulating_supply != null
    ? (coin.circulating_supply / coin.max_supply) * 100
    : null

  return (
    <div style={{ backgroundColor: '#060E18', border: '1px solid rgba(0,255,136,0.25)', padding: '20px 22px', marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: "'VT323', monospace", fontSize: 26, color: '#C8FFD4' }}>{coin.name}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877', letterSpacing: '0.1em' }}>{coin.symbol}/USD</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isLive && <LiveBadge />}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 600, color: '#00FF88', textShadow: '0 0 10px rgba(0,255,136,0.4)' }}>
            {formatCryptoPrice(livePrice)}
          </span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 5, margin: '12px 0 16px' }}>
        <ChangeBadge label="1H" value={coin.change_pct_1h} />
        <ChangeBadge label="24H" value={live24hChg} />
        <ChangeBadge label="7D" value={coin.change_pct_7d} />
        <ChangeBadge label="30D" value={coin.change_pct_30d} />
        <ChangeBadge label="1Y" value={coin.change_pct_1y} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            style={{
              fontFamily: "'Share Tech Mono', monospace", fontSize: 13,
              color: range === r.key ? '#00FF88' : '#52A877',
              background: range === r.key ? 'rgba(0,255,136,0.08)' : 'transparent',
              border: `1px solid ${range === r.key ? 'rgba(0,255,136,0.3)' : 'rgba(0,255,136,0.1)'}`,
              padding: '3px 9px', cursor: 'pointer', letterSpacing: '0.06em',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {histError ? (
        <ErrorBlock message={histError} />
      ) : history === null ? (
        <Loading label={`LOADING ${range.toUpperCase()} HISTORY`} />
      ) : (
        <PriceChart points={history} range={range} color="#00FF88" />
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 5,
        marginTop: 18,
      }}>
        <Metric label="MARKET CAP" value={formatLargeNum(coin.market_cap, '$')} />
        <Metric label="MCAP CHG 24H" value={formatPct(coin.market_cap_change_pct_24h)} color={posNegColor(coin.market_cap_change_pct_24h)} />
        <Metric label="FULLY DILUTED VAL" value={formatLargeNum(coin.fully_diluted_valuation, '$')} />
        <Metric label="VOLUME 24H" value={formatLargeNum(coin.volume, '$')} />
        <Metric label="DOMINANCE" value={coin.dominance != null ? `${coin.dominance.toFixed(2)}%` : '—'} />
        <Metric label="24H HIGH" value={formatCryptoPrice(live24hHigh)} color="#00FF88" />
        <Metric label="24H LOW" value={formatCryptoPrice(live24hLow)} color="#FF3B3B" />
        <Metric label="ALL-TIME HIGH" value={formatCryptoPrice(coin.ath)} color="#00FF88" />
        <Metric label="FROM ATH" value={formatPct(coin.ath_change_pct)} color={posNegColor(coin.ath_change_pct)} />
        <Metric label="ATH DATE" value={timeAgo(coin.ath_date)} />
        <Metric label="ALL-TIME LOW" value={formatCryptoPrice(coin.atl)} color="#FF3B3B" />
        <Metric label="FROM ATL" value={formatPct(coin.atl_change_pct)} color={posNegColor(coin.atl_change_pct)} />
        <Metric label="ATL DATE" value={timeAgo(coin.atl_date)} />
        <Metric label="CIRCULATING SUPPLY" value={coin.circulating_supply != null ? formatLargeNum(coin.circulating_supply) : '—'} />
        <Metric label="TOTAL SUPPLY" value={coin.total_supply != null ? formatLargeNum(coin.total_supply) : '—'} />
        <Metric label="MAX SUPPLY" value={coin.max_supply != null ? formatLargeNum(coin.max_supply) : 'UNCAPPED'} />
        {supplyPct != null && <Metric label="% OF MAX SUPPLY" value={`${supplyPct.toFixed(1)}%`} />}
      </div>
    </div>
  )
}

export default function Crypto() {
  const [coins, setCoins] = useState<CryptoCoin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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

  const items = useMemo(
    () => (coins ?? []).map(c => ({ id: c.symbol, label: c.name })),
    [coins],
  )
  const cards = useSortableLayout('crypto.coins', items)
  const bySymbol = useMemo(
    () => new Map((coins ?? []).map(c => [c.symbol, c])),
    [coins],
  )

  const expandedCoin = expanded ? bySymbol.get(expanded) ?? null : null

  // Streams exactly what's actually on screen -- hidden tiles (via edit
  // layout) don't need a live subscription nobody's looking at.
  const { ticks, liveSymbols } = useCryptoStream(cards.visible)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)' }}>
          CRYPTO MARKETS
        </span>
        {coins && coins.length > 0 && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#52A877' }}>
            TOTAL MKTCAP: <span style={{ color: '#00FF88' }}>{formatLargeNum(totalMktCap, '$')}</span>
            &nbsp;·&nbsp;BTC DOM: <span style={{ color: '#FFD700' }}>{btc?.dominance != null ? `${btc.dominance.toFixed(1)}%` : '—'}</span>
          </span>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !coins && <Loading label="PULLING TOP 10 BY MARKET CAP" />}

      {coins && <EditHint />}

      {expandedCoin && (
        <CoinDetail
          coin={expandedCoin}
          tick={ticks[expandedCoin.symbol]}
          isLive={liveSymbols.has(expandedCoin.symbol)}
        />
      )}

      {coins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 10 }}>
          {cards.visible.map(symbol => {
            const c = bySymbol.get(symbol)
            if (!c) return null
            const isOpen = expanded === c.symbol
            const isLive = liveSymbols.has(c.symbol)
            const tick = ticks[c.symbol]
            const livePrice = isLive ? tick?.price ?? c.price : c.price
            const live24hChg = isLive ? tick?.pricePctChg24h ?? c.change_pct_24h : c.change_pct_24h
            // Coinbase's ticker gives price + %chg, not an absolute $ diff --
            // derived the same way the Market page's index tiles do: from
            // today's live price and %, back out what "24h ago" must have
            // been. Falls back to CoinGecko's own absolute figure when not
            // live or when the % is unavailable.
            const liveAbsChg = isLive && livePrice != null && live24hChg != null
              ? livePrice - livePrice / (1 + live24hChg / 100)
              : c.change_24h
            return (
            <Draggable key={c.symbol} id={c.symbol} label={c.name} api={cards}>
            <div
              onClick={() => setExpanded(isOpen ? null : c.symbol)}
              style={{
                backgroundColor: '#060E18',
                border: isOpen ? '1px solid rgba(0,255,136,0.45)' : border,
                padding: '22px 24px', height: '100%', cursor: 'pointer', transition: 'border-color 0.1s',
                boxShadow: isOpen ? '0 0 14px rgba(0,255,136,0.15)' : 'none',
              }}
              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.borderColor = 'rgba(0,255,136,0.3)' }}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.borderColor = 'rgba(0,255,136,0.12)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 18, color: '#C8FFD4', marginBottom: 3 }}>
                    {c.rank != null && <span style={{ color: '#3C8F5F', marginRight: 8 }}>#{c.rank}</span>}
                    {c.name}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877', letterSpacing: '0.1em' }}>{c.symbol}/USD</div>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
                  {isOpen ? '▲ COLLAPSE' : '▼ EXPAND'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {isLive && <LiveBadge />}
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 600, color: '#00FF88', letterSpacing: '-0.02em', textShadow: '0 0 10px rgba(0,255,136,0.4)' }}>
                  {formatCryptoPrice(livePrice)}
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: posNegColor(liveAbsChg), marginBottom: 14 }}>
                {liveAbsChg != null ? `${liveAbsChg >= 0 ? '+' : ''}$${Math.abs(liveAbsChg).toLocaleString('en-US', { maximumFractionDigits: 3 })}` : '—'}
              </div>

              <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
                <ChangeBadge label="1H" value={c.change_pct_1h} />
                <ChangeBadge label="24H" value={live24hChg} />
                <ChangeBadge label="7D" value={c.change_pct_7d} />
                <ChangeBadge label="30D" value={c.change_pct_30d} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                <Metric label="MKT CAP" value={formatLargeNum(c.market_cap, '$')} />
                <Metric label="VOL 24H" value={formatLargeNum(c.volume, '$')} />
                <Metric label="DOMINANCE" value={c.dominance != null ? `${c.dominance.toFixed(1)}%` : '—'} />
                <Metric label="24H HIGH" value={formatCryptoPrice(isLive ? tick?.high24h ?? c.high_24h : c.high_24h)} color="#00FF88" />
                <Metric label="24H LOW" value={formatCryptoPrice(isLive ? tick?.low24h ?? c.low_24h : c.low_24h)} color="#FF3B3B" />
                <Metric label="FROM ATH" value={formatPct(c.ath_change_pct)} color={posNegColor(c.ath_change_pct)} />
              </div>
            </div>
            </Draggable>
            )
          })}
        </div>
      )}
      {coins && <AddWidgetTray api={cards} title="HIDDEN COINS" />}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
        {'// PRICE/CHANGE/24H HI-LO: live via Coinbase WebSocket where available (LIVE badge) · everything else (rank, dominance, supply, ATH/ATL, history): CoinGecko · click a coin to expand'}
      </div>
    </div>
  )
}
