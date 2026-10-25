import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { fetchTradeCompare, type ComparePoint, type CompareSeries, type TradeCompare as CompareData } from '@/lib/api'
import { formatLargeNum } from '@/lib/format'
import { C, FONT, goldA } from '@/lib/theme'
import { COMPARE_MAX, setCompareList, useTradeNav } from '@/lib/tradeNav'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { EmptyNote, PageHeader, Panel, PanelTitle, SourceNote, Toggle, money, pct, selectStyle } from './TradeUI'
import { useWidth } from './TradeTreemap'

// TRADE › COMPARE — several economies' merchandise trade over time on one
// axis. Values can be shown in dollars, indexed to the first year (=100, so
// differently-sized economies compare on growth), or as a share of world
// trade. Data: World Bank / WTO series, one request per indicator.

type Metric = 'total' | 'exports' | 'imports' | 'balance' | 'world_share'
type Scale = 'value' | 'index'

const MONO = FONT.mono
const TECH = FONT.terminal

// Eight categorical slots, validated for CVD separation and >= 3:1 contrast
// on the panel surface. A country keeps its colour while it stays selected
// (colour follows the entity, never its rank).
const SLOT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0f8fa8', '#9085e9', '#a87a2a']

const METRIC_LABEL: Record<Metric, string> = {
  total: 'TOTAL TRADE', exports: 'EXPORTS', imports: 'IMPORTS', balance: 'TRADE BALANCE', world_share: 'SHARE OF WORLD TRADE',
}

const metricValue = (p: ComparePoint, m: Metric) => (m === 'world_share' ? p.world_share ?? null : p[m])

function fmtValue(v: number | null | undefined, metric: Metric, scale: Scale) {
  if (v === null || v === undefined) return '—'
  if (metric === 'world_share') return `${v.toFixed(2)}%`
  if (scale === 'index') return v.toFixed(0)
  return formatLargeNum(v, '$')
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || Math.abs(max) || 1
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = ([1, 2, 2.5, 5, 10].find(s => s * mag >= raw) ?? 10) * mag
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)))
  return out
}

type Line = { s: CompareSeries; color: string; values: (number | null)[] }

function CompareChart({ lines, years, metric, scale }: { lines: Line[]; years: number[]; metric: Metric; scale: Scale }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 380
  const pad = { l: 64, r: 74, t: 12, b: 26 }
  const plotW = Math.max(0, width - pad.l - pad.r)
  const plotH = H - pad.t - pad.b

  const all = lines.flatMap(l => l.values.filter((v): v is number => v !== null))
  const lo = Math.min(metric === 'balance' ? Math.min(0, ...all) : 0, ...all)
  const hi = Math.max(...all, metric === 'balance' ? 0 : -Infinity)
  const ticks = all.length ? niceTicks(lo, hi) : [0, 1]
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const x = (i: number) => pad.l + (years.length <= 1 ? plotW / 2 : (i / (years.length - 1)) * plotW)
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH

  const path = (vals: (number | null)[]) => {
    let d = '', pen = false
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  // Direct end labels, nudged apart so they don't collide.
  const ends = lines.map(l => {
    let i = l.values.length - 1
    while (i >= 0 && l.values[i] === null) i--
    return { l, i, y: i >= 0 ? y(l.values[i] as number) : null }
  }).filter(e => e.y !== null) as { l: Line; i: number; y: number }[]
  ends.sort((a, b) => a.y - b.y)
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 12) ends[k].y = ends[k - 1].y + 12
  // ...then pull the stack back up if it ran past the bottom of the plot.
  const floor = pad.t + plotH - 2
  if (ends.length && ends[ends.length - 1].y > floor) {
    ends[ends.length - 1].y = floor
    for (let k = ends.length - 2; k >= 0; k--) if (ends[k + 1].y - ends[k].y < 12) ends[k].y = ends[k + 1].y - 12
  }

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = years.length <= 1 ? 0 : Math.round(((e.clientX - box.left) / box.width) * (years.length - 1))
    setHover(Math.max(0, Math.min(years.length - 1, i)))
  }
  const labelEvery = Math.ceil(years.length / 10)

  const hoverRows = hover === null ? [] : lines
    .map(l => ({ l, v: l.values[hover] }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg width={width} height={H} style={{ display: 'block' }}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 && metric === 'balance' ? goldA(0.35) : goldA(0.07)} />
              <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" fill={C.muted} style={{ fontFamily: MONO, fontSize: 9 }}>
                {fmtValue(t, metric, scale).replace('.00', '')}
              </text>
            </g>
          ))}
          {scale === 'index' && metric !== 'world_share' && metric !== 'balance' && yMin <= 100 && yMax >= 100 && (
            <line x1={pad.l} x2={pad.l + plotW} y1={y(100)} y2={y(100)} stroke={goldA(0.3)} strokeDasharray="3 3" />
          )}
          {years.map((yr, i) => (i % labelEvery === 0 || i === years.length - 1) && (
            <text key={yr} x={x(i)} y={H - 8} textAnchor="middle" fill={C.muted} style={{ fontFamily: MONO, fontSize: 9 }}>{yr}</text>
          ))}
          {lines.map(l => (
            <path key={l.s.iso3} d={path(l.values)} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round"
              opacity={hover === null ? 1 : 0.9} />
          ))}
          {ends.map(e => (
            <text key={e.l.s.iso3} x={x(e.i) + 7} y={e.y + 3} fill={C.textSoft} style={{ fontFamily: MONO, fontSize: 10 }}>
              {e.l.s.iso3}
            </text>
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} stroke={goldA(0.45)} strokeDasharray="2 3" />
              {lines.map(l => l.values[hover] !== null && (
                <circle key={l.s.iso3} cx={x(hover)} cy={y(l.values[hover] as number)} r={4} fill={l.color} stroke={C.card} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={pad.l} y={0} width={plotW} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && (
        <div style={{
          position: 'absolute', top: 10, left: Math.min(Math.max(0, x(hover) + 14), Math.max(0, width - 230)), pointerEvents: 'none',
          backgroundColor: C.tooltip, border: `1px solid ${goldA(0.4)}`, padding: '8px 10px', fontFamily: MONO, fontSize: 11, width: 216,
        }}>
          <div style={{ color: C.gold, marginBottom: 4 }}>{years[hover]}</div>
          {hoverRows.map(({ l, v }) => (
            <div key={l.s.iso3} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.textSoft }}>
                <span style={{ width: 10, height: 2, backgroundColor: l.color, display: 'inline-block' }} />
                {l.s.flag} {l.s.iso3}
              </span>
              <span style={{ color: C.number }}>{fmtValue(v, metric, scale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TradeCompare() {
  const { compare } = useTradeNav()
  const [data, setData] = useState<CompareData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('total')
  const [scale, setScale] = useState<Scale>('value')
  const [start, setStart] = useState<number>(new Date().getFullYear() - 21)
  const [reload, setReload] = useState(0)

  // Stable colour per country: slots are assigned in the order countries
  // were added and freed when one is removed.
  const [slots, setSlots] = useState<Record<string, number>>({})
  useEffect(() => {
    setSlots(prev => {
      const next: Record<string, number> = {}
      for (const iso of compare) if (prev[iso] !== undefined) next[iso] = prev[iso]
      for (const iso of compare) {
        if (next[iso] !== undefined) continue
        const used = new Set(Object.values(next))
        next[iso] = SLOT_COLORS.findIndex((_, i) => !used.has(i))
      }
      return next
    })
  }, [compare])

  useEffect(() => {
    if (compare.length === 0) { setData(null); setError(null); return }
    let cancelled = false
    setError(null)
    fetchTradeCompare(compare, start)
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [compare, start, reload])

  const effScale: Scale = metric === 'balance' || metric === 'world_share' ? 'value' : scale
  const years = useMemo(() => (data ? Array.from({ length: data.end - data.start + 1 }, (_, i) => data.start + i) : []), [data])

  const lines: Line[] = useMemo(() => {
    if (!data) return []
    return compare
      .map(iso => data.series.find(s => s.iso3 === iso))
      .filter((s): s is CompareSeries => !!s)
      .map(s => {
        const byYear = new Map(s.points.map(p => [p.year, metricValue(p, metric)]))
        let vals = years.map(yr => byYear.get(yr) ?? null)
        if (effScale === 'index') {
          const base = vals.find(v => v !== null && v > 0) ?? null
          vals = vals.map(v => (v === null || !base ? null : (v / base) * 100))
        }
        return { s, color: SLOT_COLORS[slots[s.iso3] ?? 0] ?? SLOT_COLORS[0], values: vals }
      })
  }, [data, compare, metric, effScale, years, slots])

  const remove = (iso: string) => setCompareList(compare.filter(c => c !== iso))
  const add = (iso: string) => iso && setCompareList([...compare, iso])
  const missing = data ? compare.filter(iso => !data.series.some(s => s.iso3 === iso)) : []
  const thisYear = new Date().getFullYear()

  // Summary over the window, using the raw (un-indexed) values.
  const summary = useMemo(() => {
    if (!data) return []
    return lines.map(({ s, color }) => {
      const pts = s.points.filter(p => metricValue(p, metric) !== null)
      const first = pts[0], last = pts[pts.length - 1]
      const fv = first ? metricValue(first, metric) : null
      const lv = last ? metricValue(last, metric) : null
      const yrs = first && last ? last.year - first.year : 0
      const cagr = fv && lv && fv > 0 && lv > 0 && yrs > 0 && metric !== 'balance' && metric !== 'world_share'
        ? (Math.pow(lv / fv, 1 / yrs) - 1) * 100 : null
      const peak = pts.reduce<ComparePoint | null>((b, p) => (b === null || (metricValue(p, metric) ?? -Infinity) > (metricValue(b, metric) ?? -Infinity) ? p : b), null)
      const shareFirst = s.points.find(p => p.world_share != null)?.world_share ?? null
      const shareLast = [...s.points].reverse().find(p => p.world_share != null)?.world_share ?? null
      return { s, color, first, last, fv, lv, cagr, peak, shareFirst, shareLast }
    })
  }, [lines, data, metric])

  const cols = 'minmax(150px,1.4fr) 1fr 1fr 1fr 0.8fr 1.2fr 0.7fr'

  return (
    <div>
      <PageHeader
        title="COMPARE"
        subtitle={<>HOW COUNTRIES&apos; TRADE HAS CHANGED{data ? ` · ${data.start}–${data.end}` : ''}</>}
        right={<>
          <Toggle value={metric} onChange={setMetric} options={[
            { value: 'total', label: 'TOTAL' }, { value: 'exports', label: 'EXPORTS' }, { value: 'imports', label: 'IMPORTS' },
            { value: 'balance', label: 'BALANCE' }, { value: 'world_share', label: 'WORLD %' },
          ]} />
          <Toggle value={effScale} onChange={setScale} options={[{ value: 'value', label: '$ VALUE' }, { value: 'index', label: 'INDEXED' }]} />
          <select value={start} onChange={e => setStart(Number(e.target.value))} style={selectStyle} aria-label="Start year">
            {Array.from({ length: thisYear - 2000 - 4 }, (_, i) => 2000 + i).map(y => <option key={y} value={y}>FROM {y}</option>)}
          </select>
        </>}
      />

      <Panel style={{ marginBottom: 14 }}>
        <PanelTitle>{'// '}{METRIC_LABEL[metric]}{effScale === 'index' ? ` · INDEXED (${data?.start ?? start} = 100)` : ''}</PanelTitle>

        {/* Country chips: swatch = the country's line colour */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          {compare.map(iso => {
            const s = data?.countries.find(c => c.iso3 === iso)
            return (
              <span key={iso} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${goldA(0.2)}`, padding: '3px 4px 3px 8px', fontFamily: MONO, fontSize: 10, color: C.textSoft }}>
                <span style={{ width: 12, height: 3, backgroundColor: SLOT_COLORS[slots[iso] ?? 0], display: 'inline-block' }} />
                {s?.flag} {s?.name ?? iso}
                <button onClick={() => remove(iso)} aria-label={`Remove ${iso}`}
                  style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>×</button>
              </span>
            )
          })}
          {compare.length < COMPARE_MAX && data && (
            <select value="" onChange={e => add(e.target.value)} style={{ ...selectStyle, fontSize: 11, padding: '3px 6px' }} aria-label="Add country">
              <option value="">+ ADD COUNTRY</option>
              {data.countries.filter(c => !compare.includes(c.iso3)).map(c => (
                <option key={c.iso3} value={c.iso3}>{c.flag} {c.name}</option>
              ))}
            </select>
          )}
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim, marginLeft: 4 }}>{compare.length}/{COMPARE_MAX}</span>
        </div>

        {compare.length === 0 && <EmptyNote>Add a country above, or tick ⇄ on the LEADERBOARD.</EmptyNote>}
        {compare.length > 0 && error && <ErrorBlock message={error} onRetry={() => setReload(r => r + 1)} />}
        {compare.length > 0 && !error && !data && <Loading label="PULLING TRADE HISTORY" />}
        {compare.length > 0 && data && lines.length > 0 && <CompareChart lines={lines} years={years} metric={metric} scale={effScale} />}
        {missing.length > 0 && (
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: C.muted }}>
            {'// no World Bank series for: '}{missing.join(', ')}
          </div>
        )}
        {data && (
          <SourceNote>
            {data.source} · goods only · {effScale === 'index' ? 'indexed: each line divided by its own first year × 100, so growth is comparable regardless of size' : 'one shared axis'} · hover for values
          </SourceNote>
        )}
      </Panel>

      {data && summary.length > 0 && (
        <Panel>
          <PanelTitle>{'// '}{METRIC_LABEL[metric]} · {data.start}–{data.end} SUMMARY</PanelTitle>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 760 }}>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 6px 6px' }}>
                {['ECONOMY', `${data.start}`, `${data.end}`, 'CHANGE', 'CAGR', 'SHARE OF WORLD', 'PEAK'].map(h => (
                  <div key={h} style={{ fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: '0.1em' }}>{h}</div>
                ))}
              </div>
              {summary.map(r => {
                const change = r.fv !== null && r.lv !== null
                  ? (metric === 'balance' || metric === 'world_share' ? r.lv - r.fv : r.fv ? (r.lv / r.fv - 1) * 100 : null)
                  : null
                return (
                  <div key={r.s.iso3} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 6px', borderTop: `1px solid ${goldA(0.06)}` }}>
                    <div style={{ fontFamily: TECH, fontSize: 13, color: C.text, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ width: 12, height: 3, backgroundColor: r.color, flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.s.flag} {r.s.name}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.number }}>{fmtValue(r.fv, metric, 'value')}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.number }}>{fmtValue(r.lv, metric, 'value')}</div>
                    <div>
                      <Delta value={change} size={12} format={v =>
                        metric === 'balance' ? money(v) : metric === 'world_share' ? `${v.toFixed(2)} pp` : `${v.toFixed(0)}%`} />
                    </div>
                    <div>{r.cagr === null ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>—</span> : <Delta value={r.cagr} size={12} format={v => `${v.toFixed(1)}%`} />}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.number, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pct(r.shareFirst, 2)} <span style={{ color: C.dim }}>→</span> {pct(r.shareLast, 2)}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.textSoft }}>{r.peak?.year ?? '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <SourceNote>CHANGE = % change over the window ({metric === 'balance' ? 'dollar change for balance' : metric === 'world_share' ? 'percentage-point change for world share' : 'first to last reported year'}) · CAGR = compound annual growth · PEAK = year of the highest {METRIC_LABEL[metric].toLowerCase()}</SourceNote>
        </Panel>
      )}
    </div>
  )
}
