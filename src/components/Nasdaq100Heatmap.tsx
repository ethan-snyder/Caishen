// Nasdaq-100 heatmap: one tile per constituent, area by (approximate)
// index weight, grouped by sector, colored by today's % move. Uses the
// same squarified layout as the Trade treemap.

import { useEffect, useState } from 'react'
import { fetchHeatmap, type HeatmapData, type HeatmapTicker } from '@/lib/api'
import { formatLargeNum } from '@/lib/format'
import { C, FONT, border, goldA } from '@/lib/theme'
import { squarify, useWidth, useTooltip, TipRow } from './TradeTreemap'
import { Loading, ErrorBlock } from './StatusBlock'

const HEIGHT = 460
const SECTOR_HEADER = 16

/** Diverging scale: deep red (-3%) -> neutral plum (0) -> deep green (+3%). */
function moveColor(pct: number | null): string {
  if (pct === null) return '#2A1F35'
  const t = Math.max(-1, Math.min(1, pct / 3))
  const mix = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(x + (b[i] - x) * k))
  const neutral = [42, 31, 53]
  const rgb = t >= 0 ? mix(neutral, [24, 160, 90], t) : mix(neutral, [205, 52, 52], -t)
  return `rgb(${rgb.join(',')})`
}

// Module-level cache: switching tabs remounts the page, and the heatmap is
// one heavy batched call that the backend only refreshes every 10 minutes.
let cached: HeatmapData | null = null

export default function Nasdaq100Heatmap() {
  const [data, setData] = useState<HeatmapData | null>(cached)
  const [error, setError] = useState<string | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()

  const load = () => {
    setError(null)
    fetchHeatmap()
      .then(d => { cached = d; setData(d) })
      .catch(e => setError(e.message))
  }
  useEffect(load, [])

  // The measured container must exist from the first render -- useWidth
  // attaches its ResizeObserver on mount only.
  if (!data) {
    return (
      <div ref={ref}>
        {error ? <ErrorBlock message={error} onRetry={load} /> : <Loading label="BUILDING NASDAQ-100 HEATMAP" />}
      </div>
    )
  }

  // Sector blocks first, then tickers inside each block.
  const bySector = new Map<string, HeatmapTicker[]>()
  for (const t of data.tickers) {
    if (!(t.weight > 0)) continue
    const list = bySector.get(t.sector) ?? []
    list.push(t)
    bySector.set(t.sector, list)
  }
  const sectors = [...bySector.entries()].map(([sector, list]) => ({
    sector, list, weight: list.reduce((s, t) => s + t.weight, 0),
  }))
  // `ref` measures the outer wrapper; the plot area is that minus the
  // card's padding (16px each side) and border (1px each side).
  const plotW = Math.max(0, width - 34)
  const blocks = plotW > 0
    ? squarify(sectors.map(s => ({ value: s.weight, item: s })), { x: 0, y: 0, w: plotW, h: HEIGHT })
    : []

  return (
    <div ref={ref}>
    <div style={{ backgroundColor: C.card, border, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em' }}>
          NASDAQ-100 · TILE SIZE = INDEX WEIGHT · COLOR = TODAY&apos;S MOVE
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT.mono, fontSize: 11, color: C.muted }}>
          −3%
          <span style={{ width: 120, height: 8, background: `linear-gradient(90deg, ${moveColor(-3)}, ${moveColor(0)}, ${moveColor(3)})` }} />
          +3%
        </span>
      </div>

      <div style={{ position: 'relative', height: HEIGHT }} onMouseLeave={tip.hide}>
        {blocks.map(({ item: sec, rect: r }) => {
          const inner = { x: r.x + 1, y: r.y + SECTOR_HEADER, w: Math.max(0, r.w - 2), h: Math.max(0, r.h - SECTOR_HEADER - 1) }
          const tiles = squarify(sec.list.map(t => ({ value: t.weight, item: t })), inner)
          return (
            <div key={sec.sector}>
              <div style={{
                position: 'absolute', left: r.x, top: r.y, width: r.w, height: SECTOR_HEADER,
                fontFamily: FONT.mono, fontSize: 10, color: C.gold, letterSpacing: '0.08em',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '2px 4px',
                borderTop: `1px solid ${goldA(0.35)}`,
              }}>
                {r.w > 50 ? sec.sector.toUpperCase() : ''}
              </div>
              {tiles.map(({ item: t, rect: tr }) => {
                const big = tr.w > 54 && tr.h > 34
                const fits = tr.w > 30 && tr.h > 16
                return (
                  <div
                    key={t.ticker}
                    onMouseMove={e => tip.show(e, (
                      <>
                        <div style={{ fontFamily: FONT.terminal, fontSize: 15, color: C.gold, marginBottom: 4 }}>
                          {t.ticker} <span style={{ color: C.textSoft, fontSize: 12 }}>{t.name}</span>
                        </div>
                        <TipRow label="PRICE" value={t.price === null ? '—' : `$${t.price.toFixed(2)}`} />
                        <TipRow
                          label="CHANGE"
                          value={t.change_pct === null ? '—' : `${t.change_pct >= 0 ? '▲' : '▼'} ${Math.abs(t.change_pct).toFixed(2)}%`}
                          color={t.change_pct === null ? undefined : t.change_pct >= 0 ? C.up : C.down}
                        />
                        <TipRow label="MKT CAP" value={formatLargeNum(t.market_cap, '$')} />
                        <TipRow label="SECTOR" value={t.sector} />
                      </>
                    ))}
                    style={{
                      position: 'absolute', left: tr.x, top: tr.y, width: Math.max(0, tr.w - 1), height: Math.max(0, tr.h - 1),
                      background: moveColor(t.change_pct), overflow: 'hidden', cursor: 'default',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT.mono, color: '#FFFFFF', lineHeight: 1.15,
                    }}
                  >
                    {fits && (
                      <span style={{ fontSize: big ? Math.min(18, tr.w / 4.2) : 10, fontWeight: 600 }}>{t.ticker}</span>
                    )}
                    {big && t.change_pct !== null && (
                      <span style={{ fontSize: Math.min(13, tr.w / 6), opacity: 0.9 }}>
                        {t.change_pct >= 0 ? '+' : ''}{t.change_pct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
        {tip.node}
      </div>
      <div style={{ marginTop: 8, fontFamily: FONT.mono, fontSize: 11, color: C.dim }}>
        {'// prices: yfinance (batched, refreshed every 10 min) · tile area = market cap (live price × share count); the real index caps its largest names, so areas are close to, not exactly, official weights'}
      </div>
    </div>
    </div>
  )
}
