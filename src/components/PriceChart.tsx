import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { fetchHistory, type ChartKind, type ChartRange, type HistoryData } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { C, FONT, border, goldA, GRID_LINE } from '@/lib/theme'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'

// Click-to-chart popup used across the app: any row that is a tradeable
// instrument (watchlist / portfolio ticker, index, coin, FX pair, futures
// contract, Treasury yield) opens this with its price or yield history.
// Data: GET /api/history (yfinance) — see backend/history.py.
//
// Usage in a tab:
//   const [chart, setChart] = useState<ChartTarget | null>(null)
//   <div onClick={() => setChart({ kind: 'stock', id: 'AAPL' })} ...>
//   {chart && <PriceChart target={chart} onClose={() => setChart(null)} />}

export interface ChartTarget {
  kind: ChartKind
  id: string
  /** Optional heading override (defaults to the backend's name) */
  label?: string
  /** Optional subheading, e.g. the company name */
  sub?: string
}

/** Props to spread on a clickable row so it looks and behaves clickable. */
export const chartRowProps = (open: () => void) => ({
  onClick: open,
  role: 'button' as const,
  tabIndex: 0,
  title: 'Click to view chart',
  onKeyDown: (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
  },
})

const RANGES: ChartRange[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX']

function fmt(v: number | null | undefined, unit: HistoryData['unit']) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (unit === 'yield') return `${v.toFixed(3)}%`
  if (unit === 'rate') return v.toFixed(v >= 10 ? 2 : 4)
  const d = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 6
  const s = v.toLocaleString('en-US', { minimumFractionDigits: d === 6 ? 2 : d, maximumFractionDigits: d })
  return unit === 'usd' ? `$${s}` : s
}

function fmtTime(iso: string, intraday: boolean, range: ChartRange) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (intraday) {
    return range === '1D'
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : fmtDate(d, true)
  }
  return fmtDate(d)
}

function Chart({ data }: { data: HistoryData }) {
  const wrap = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(e => setWidth(Math.floor(e[0].contentRect.width)))
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const H = 300
  const pad = { l: 8, r: 78, t: 12, b: 26 }
  const pts = data.points
  const plotW = Math.max(0, width - pad.l - pad.r)
  const plotH = H - pad.t - pad.b
  const vals = pts.map(p => p.v)
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (lo === hi) { lo -= 1; hi += 1 }
  const padY = (hi - lo) * 0.08
  lo -= padY; hi += padY
  const x = (i: number) => pad.l + (pts.length <= 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * plotH

  // Direction colour (green up / red down over the range), per the theme's
  // rule that green/red are reserved for direction.
  const up = (data.change ?? 0) >= 0
  const color = up ? C.up : C.down
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const area = pts.length ? `${line}L${x(pts.length - 1).toFixed(1)},${pad.t + plotH}L${x(0).toFixed(1)},${pad.t + plotH}Z` : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + (hi - lo) * (1 - t))
  const labelIdx = pts.length <= 1 ? [0] : [0, Math.floor((pts.length - 1) / 3), Math.floor(((pts.length - 1) * 2) / 3), pts.length - 1]

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - box.left) / box.width) * (pts.length - 1))
    setHover(Math.max(0, Math.min(pts.length - 1, i)))
  }
  const hp = hover !== null ? pts[hover] : null
  const gradId = `pc-grad-${data.symbol.replace(/[^a-z0-9]/gi, '')}`

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} stroke={GRID_LINE} strokeDasharray="4 4" />
              <text x={pad.l + plotW + 8} y={y(t) + 3} fill={C.muted} style={{ fontFamily: FONT.mono, fontSize: 10 }}>{fmt(t, data.unit)}</text>
            </g>
          ))}
          {/* first value reference line */}
          {data.first !== null && (
            <line x1={pad.l} x2={pad.l + plotW} y1={y(data.first)} y2={y(data.first)} stroke={goldA(0.3)} strokeDasharray="3 4" />
          )}
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {labelIdx.map(i => pts[i] && (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fill={C.muted}
              style={{ fontFamily: FONT.mono, fontSize: 10 }}>{fmtTime(pts[i].t, data.intraday, data.range)}</text>
          ))}
          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} stroke={goldA(0.5)} strokeDasharray="2 3" />
              <circle cx={x(hover)} cy={y(hp.v)} r={4.5} fill={color} stroke={C.card} strokeWidth={2} />
            </g>
          )}
          <rect x={pad.l} y={0} width={plotW} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hp && hover !== null && (
        <div style={{
          position: 'absolute', top: 8, left: Math.min(Math.max(0, x(hover) + 12), Math.max(0, width - 200)), pointerEvents: 'none',
          backgroundColor: C.tooltip, border: `1px solid ${goldA(0.4)}`, padding: '7px 10px', fontFamily: FONT.mono, fontSize: 11, minWidth: 150,
        }}>
          <div style={{ color: C.gold, marginBottom: 3 }}>{fmtTime(hp.t, data.intraday, data.range)}</div>
          <div style={{ color: C.number, fontSize: 14, fontWeight: 600 }}>{fmt(hp.v, data.unit)}</div>
          {data.first !== null && data.first !== 0 && (
            <Delta value={((hp.v - data.first) / data.first) * 100} format={v => `${v.toFixed(2)}% vs start`} size={10} />
          )}
        </div>
      )}
    </div>
  )
}

export default function PriceChart({ target, onClose }: { target: ChartTarget; onClose: () => void }) {
  const [range, setRange] = useState<ChartRange>('1Y')
  const [data, setData] = useState<HistoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    fetchHistory(target.kind, target.id, range)
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [target.kind, target.id, range, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = target.label ?? data?.name ?? target.id
  const changeFmt = (v: number) => (data?.unit === 'yield' ? `${v.toFixed(3)} pts` : fmt(v, data?.unit ?? 'points'))

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(5,2,8,0.72)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div role="dialog" aria-modal="true" aria-label={`${title} chart`} onClick={e => e.stopPropagation()} style={{
        width: 'min(920px, 100%)', maxHeight: '90vh', overflow: 'auto', backgroundColor: C.card, border: `1px solid ${goldA(0.35)}`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 30px ${goldA(0.08)}`, padding: '18px 20px',
      }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: '0.1em' }}>{title}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, letterSpacing: '0.08em', marginTop: 3 }}>
              {target.sub ? `${target.sub} · ` : ''}{data ? data.symbol : ''}{data?.unit === 'yield' ? ' · YIELD %' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            {data && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 600, color: C.number }}>{fmt(data.last, data.unit)}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                  <Delta value={data.change} format={changeFmt} size={12} />
                  <Delta value={data.change_pct} format={v => `${v.toFixed(2)}%`} size={12} badge />
                </div>
              </div>
            )}
            <button onClick={onClose} aria-label="Close chart" style={{
              fontFamily: FONT.terminal, fontSize: 16, color: C.muted, background: 'transparent',
              border: `1px solid ${goldA(0.25)}`, width: 30, height: 30, cursor: 'pointer',
            }}>×</button>
          </div>
        </div>

        {/* ranges */}
        <div style={{ display: 'inline-flex', border: `1px solid ${goldA(0.25)}`, marginBottom: 12, flexWrap: 'wrap' }}>
          {RANGES.map(r => {
            const on = r === range
            return (
              <button key={r} onClick={() => setRange(r)} style={{
                fontFamily: FONT.terminal, fontSize: 12, letterSpacing: '0.06em', padding: '5px 11px', cursor: 'pointer', border: 'none',
                background: on ? goldA(0.14) : 'transparent', color: on ? C.gold : C.muted,
              }}>{r}</button>
            )
          })}
        </div>

        {error && <ErrorBlock message={error} onRetry={() => setReload(n => n + 1)} />}
        {!error && !data && <div style={{ height: 300 }}><Loading label={`LOADING ${range} HISTORY`} /></div>}
        {data && data.points.length > 0 && <Chart data={data} />}

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, marginTop: 12 }}>
            {[
              ['OPEN OF RANGE', fmt(data.first, data.unit)],
              ['LAST', fmt(data.last, data.unit)],
              ['RANGE HIGH', fmt(data.high, data.unit)],
              ['RANGE LOW', fmt(data.low, data.unit)],
            ].map(([l, v]) => (
              <div key={l} style={{ backgroundColor: C.inset, border, padding: '8px 10px' }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 3 }}>{l}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.number }}>{v}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, fontFamily: FONT.mono, fontSize: 9, color: C.dim }}>
          {'// DATA SOURCE: yfinance · '}{data?.intraday ? 'intraday prices can be delayed ~15 min · ' : ''}{'Esc or click outside to close'}
        </div>
      </div>
    </div>
  )
}
