// Expanded-tile support.
//
// Clicking a card in a tile grid expands it (App.tsx sets
// data-tile-expanded on the card and fires a `tile-expand` event). Anything
// inside a card can call useInExpandedTile() to find out, so a chart can
// grow taller and add axis detail, and a card that has no chart can open one.
//
//   const [ref, expanded] = useInExpandedTile<HTMLDivElement>()
//   <div ref={ref}>{expanded ? <BigChart /> : <SmallThing />}</div>
//
// HistoryTileChart is the "open a graph" piece for tiles that represent a
// tradeable instrument: it fetches /api/history (yfinance) with range
// buttons and renders a detailed line chart.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchHistory, type ChartKind, type ChartRange, type HistoryData } from '@/lib/api'
import { C, FONT, goldA, purpleA } from '@/lib/theme'
import { LineChart } from './TrackingKit'

export const TILE_EXPAND_EVENT = 'tile-expand'

export function useInExpandedTile<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const check = () => setExpanded(!!ref.current?.closest('[data-tile-expanded]'))
    check()
    window.addEventListener(TILE_EXPAND_EVENT, check)
    return () => window.removeEventListener(TILE_EXPAND_EVENT, check)
  }, [])
  return [ref, expanded] as const
}

/** Renders children only while the surrounding tile is expanded. */
export function WhenExpanded({ children }: { children: ReactNode }) {
  const [ref, expanded] = useInExpandedTile<HTMLDivElement>()
  return <div ref={ref}>{expanded ? children : null}</div>
}

const RANGES: ChartRange[] = ['1M', '6M', 'YTD', '1Y', '5Y', 'MAX']

function fmtFor(unit: HistoryData['unit']) {
  return (v: number) => {
    if (unit === 'yield') return `${v.toFixed(2)}%`
    if (unit === 'rate') return v.toFixed(v > 10 ? 2 : 4)
    if (unit === 'usd') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
}

/** A detailed history chart for an instrument, shown inside an expanded tile. */
export function HistoryTileChart({ kind, id, title, note, height = 260 }: {
  kind: ChartKind
  id: string
  title?: string
  /** Small caption under the chart (e.g. why this series is the one shown). */
  note?: string
  height?: number
}) {
  const [range, setRange] = useState<ChartRange>('1Y')
  const [data, setData] = useState<HistoryData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setErr(null)
    fetchHistory(kind, id, range)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [kind, id, range])

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${goldA(0.12)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em' }}>
          {(title ?? data?.name ?? id).toUpperCase()}
          {data && data.change_pct !== null && (
            <span style={{ marginLeft: 10, color: data.change_pct >= 0 ? C.up : C.down }}>
              {data.change_pct >= 0 ? '▲' : '▼'} {Math.abs(data.change_pct).toFixed(2)}% over {range}
            </span>
          )}
        </span>
        {/* pointerdown is stopped so switching range doesn't collapse the tile */}
        <div onPointerDown={stop} style={{ display: 'flex', gap: 3 }}>
          {RANGES.map(r => (
            <button key={r} type="button" onClick={() => setRange(r)} style={{
              fontFamily: FONT.terminal, fontSize: 12, cursor: 'pointer', padding: '2px 8px',
              color: r === range ? C.gold : C.muted,
              background: r === range ? purpleA(0.35) : 'transparent',
              border: `1px solid ${r === range ? goldA(0.4) : goldA(0.12)}`,
            }}>{r}</button>
          ))}
        </div>
      </div>
      {err && <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>{`// history unavailable: ${err}`}</div>}
      {!err && !data && (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>
          loading history…
        </div>
      )}
      {data && (
        <LineChart
          points={data.points.map(p => ({ date: p.t, value: p.v }))}
          intraday={data.intraday}
          formatValue={fmtFor(data.unit)}
          height={height}
          detailed
        />
      )}
      {note && <div style={{ marginTop: 8, fontFamily: FONT.mono, fontSize: 11, color: C.dim }}>{note}</div>}
    </div>
  )
}
