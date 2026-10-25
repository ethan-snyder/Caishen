import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  fetchTradeMeta, fetchTradeProfile, fetchTradePartners, fetchTradeTrend, fetchTradeHeatmap,
  type TradeMeta, type TradeProfile, type TradePartners, type TradeTrend, type TradeHeatmap,
  type TradeFlow, type TradeCountry,
} from '@/lib/api'
import { formatLargeNum } from '@/lib/format'
import { C, FONT, border, goldA } from '@/lib/theme'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { Panel, PanelTitle, SourceNote, EmptyNote, Toggle, Kpi, selectStyle, money, pct } from './TradeUI'
import { setTradeCountry, useTradeNav } from '@/lib/tradeNav'
import TradeTreemap, { SECTION_COLORS, SectionIcon, TipRow, useTooltip, useWidth } from './TradeTreemap'

// Trade tab — inspired by the OEC's Tradle (games.oec.world/en/tradle):
// a product treemap of what a country exports/imports, its top partners,
// its exports-vs-imports trend, and a country x HS-section heatmap for
// comparing trade profiles side by side. All figures come from UN Comtrade
// (as reported by each country) and the World Bank/WTO — see backend/trade.py.

const SURFACE = C.card
const MONO = FONT.mono
const TECH = FONT.terminal

// Exports vs imports series colours: gold + purple from the Moneta palette,
// stepped into the validated lightness band (distinct under CVD).
const EXPORT_COLOR = '#b08f2a'
const IMPORT_COLOR = '#9480d0'


// ---------------------------------------------------------------------
// Top partners
// ---------------------------------------------------------------------

function PartnersTable({ data, flow, onPick, known }: {
  data: TradePartners; flow: TradeFlow; onPick: (iso3: string) => void; known: Set<string>
}) {
  const rows = [...data.partners].sort((a, b) => (flow === 'X' ? b.exports - a.exports : b.imports - a.imports)).slice(0, 15)
  const maxShare = Math.max(1, ...rows.map(p => (flow === 'X' ? p.export_share : p.import_share) ?? 0))
  const cols = '22px minmax(120px,1.4fr) 1fr 1fr 1fr 1.2fr'
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 6px 6px' }}>
        {['#', 'PARTNER', 'EXPORTS TO', 'IMPORTS FROM', 'BALANCE', flow === 'X' ? 'SHARE OF EXPORTS' : 'SHARE OF IMPORTS'].map(h => (
          <div key={h} style={{ fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: '0.1em' }}>{h}</div>
        ))}
      </div>
      {rows.map((p, i) => {
        const share = flow === 'X' ? p.export_share : p.import_share
        const clickable = p.iso3 !== null && known.has(p.iso3)
        return (
          <div key={p.code}
            onClick={() => clickable && p.iso3 && onPick(p.iso3)}
            title={clickable ? `View ${p.name}` : undefined}
            style={{
              display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '7px 6px',
              borderTop: `1px solid ${goldA(0.06)}`, cursor: clickable ? 'pointer' : 'default',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = goldA(0.04))}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{i + 1}</div>
            <div style={{ fontFamily: TECH, fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.flag && <span style={{ marginRight: 6 }}>{p.flag}</span>}{p.name}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{money(p.exports)}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>{money(p.imports)}</div>
            <div><Delta value={p.balance} format={money} size={12} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, backgroundColor: goldA(0.06) }}>
                <div style={{
                  width: `${((share ?? 0) / maxShare) * 100}%`, height: '100%',
                  backgroundColor: flow === 'X' ? EXPORT_COLOR : IMPORT_COLOR, borderRadius: '0 2px 2px 0',
                }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSoft, width: 44, textAlign: 'right' }}>{pct(share)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------
// Exports vs imports trend + balance strip
// ---------------------------------------------------------------------

function TrendChart({ data }: { data: TradeTrend }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = data.points
  const H = 220, BH = 70
  const pad = { l: 56, r: 64, t: 10, b: 22 }
  const plotW = Math.max(0, width - pad.l - pad.r)

  const maxV = Math.max(1, ...pts.flatMap(p => [p.exports ?? 0, p.imports ?? 0]))
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxV)))
    const steps = [1, 2, 2.5, 5, 10]
    return (steps.find(s => s * mag >= maxV) ?? 10) * mag
  })()
  const x = (i: number) => pad.l + (pts.length <= 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW)
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b)

  const line = (key: 'exports' | 'imports') => {
    let d = ''
    pts.forEach((p, i) => {
      const v = p[key]
      if (v === null) return
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }

  const maxBal = Math.max(1, ...pts.map(p => Math.abs(p.balance ?? 0)))
  const barW = Math.max(3, Math.min(24, plotW / Math.max(1, pts.length) - 4))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * niceMax)
  const last = pts[pts.length - 1]

  const onMove = (e: ReactMouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = e.clientX - box.left
    const i = pts.length <= 1 ? 0 : Math.round((rel / box.width) * (pts.length - 1))
    setHover(Math.max(0, Math.min(pts.length - 1, i)))
  }
  const hp = hover !== null ? pts[hover] : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
        {[['EXPORTS', EXPORT_COLOR], ['IMPORTS', IMPORT_COLOR]].map(([l, c]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, backgroundColor: c, display: 'inline-block' }} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textSoft }}>{l}</span>
          </div>
        ))}
      </div>
      {width > 0 && (
        <svg width={width} height={H + BH + 8} style={{ display: 'block' }}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + plotW} y1={y(t)} y2={y(t)} stroke={goldA(0.07)} />
              <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" fill={C.muted} style={{ fontFamily: MONO, fontSize: 9 }}>
                {formatLargeNum(t, '$').replace('.00', '')}
              </text>
            </g>
          ))}
          {pts.map((p, i) => (i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1) && (
            <text key={p.year} x={x(i)} y={H - 6} textAnchor="middle" fill={C.muted} style={{ fontFamily: MONO, fontSize: 9 }}>{p.year}</text>
          ))}
          <path d={line('imports')} fill="none" stroke={IMPORT_COLOR} strokeWidth={2} strokeLinejoin="round" />
          <path d={line('exports')} fill="none" stroke={EXPORT_COLOR} strokeWidth={2} strokeLinejoin="round" />
          {/* direct end labels */}
          {last?.exports != null && (
            <text x={x(pts.length - 1) + 6} y={y(last.exports) + 3} fill={C.textSoft} style={{ fontFamily: MONO, fontSize: 9 }}>{money(last.exports)}</text>
          )}
          {last?.imports != null && (
            <text x={x(pts.length - 1) + 6} y={y(last.imports) + (last.exports != null && Math.abs(y(last.imports) - y(last.exports)) < 12 ? (last.imports > last.exports ? -7 : 13) : 3)}
              fill={C.textSoft} style={{ fontFamily: MONO, fontSize: 9 }}>{money(last.imports)}</text>
          )}

          {/* balance strip (own scale — a different measure, so a separate mini chart) */}
          <text x={pad.l - 8} y={H + 8 + BH / 2 + 3} textAnchor="end" fill={C.muted} style={{ fontFamily: MONO, fontSize: 9 }}>BAL</text>
          <line x1={pad.l} x2={pad.l + plotW} y1={H + 8 + BH / 2} y2={H + 8 + BH / 2} stroke={goldA(0.15)} />
          {pts.map((p, i) => {
            if (p.balance === null) return null
            const h = (Math.abs(p.balance) / maxBal) * (BH / 2 - 4)
            const mid = H + 8 + BH / 2
            return (
              <rect key={p.year} x={x(i) - barW / 2} width={barW} y={p.balance >= 0 ? mid - h : mid} height={Math.max(1, h)}
                fill={p.balance >= 0 ? C.up : C.down} opacity={hover === i ? 1 : 0.65} />
            )
          })}

          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H + BH + 4} stroke={goldA(0.45)} strokeDasharray="2 3" />
              {hp.exports != null && <circle cx={x(hover)} cy={y(hp.exports)} r={4} fill={EXPORT_COLOR} stroke={SURFACE} strokeWidth={2} />}
              {hp.imports != null && <circle cx={x(hover)} cy={y(hp.imports)} r={4} fill={IMPORT_COLOR} stroke={SURFACE} strokeWidth={2} />}
            </g>
          )}
          <rect x={pad.l} y={0} width={plotW} height={H + BH + 8} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hp && hover !== null && (
        <div style={{
          position: 'absolute', top: 24, left: Math.min(Math.max(0, x(hover) + 12), Math.max(0, width - 190)), pointerEvents: 'none',
          backgroundColor: C.inset, border: `1px solid ${goldA(0.35)}`, padding: '8px 10px', fontFamily: MONO, fontSize: 11, width: 178,
        }}>
          <div style={{ color: C.gold, marginBottom: 4 }}>{hp.year}</div>
          <TipRow label="EXPORTS" value={money(hp.exports)} />
          <TipRow label="IMPORTS" value={money(hp.imports)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
            <span style={{ color: C.muted }}>BALANCE</span>
            <Delta value={hp.balance} format={money} size={11} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Country x section heatmap
// ---------------------------------------------------------------------

function heatColor(t: number) {
  // Sequential single hue: panel surface (C.card) -> Roman gold (C.gold).
  const a = [19, 11, 27], b = [212, 175, 55]
  const k = Math.max(0, Math.min(1, t))
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
}

function Heatmap({ data, metric, onPick, selected }: {
  data: TradeHeatmap; metric: 'share' | 'value'; onPick: (iso3: string) => void; selected: string
}) {
  const tip = useTooltip()
  const [sortBy, setSortBy] = useState<string | null>(null)
  const sections = data.sections

  const rows = useMemo(() => {
    const r = [...data.rows]
    if (sortBy) {
      const key = (row: typeof r[number]) => {
        if (row.missing) return -Infinity
        if (sortBy === 'TOTAL') return row.total ?? 0
        const c = row.cells[sortBy]
        return metric === 'share' ? (c?.share ?? 0) : (c?.value ?? 0)
      }
      r.sort((a, b) => key(b) - key(a))
    }
    return r
  }, [data, sortBy, metric])

  // Colour scale: share -> linear-ish against the matrix max (sqrt lifts small
  // shares off the floor); value -> log scale since values span ~6 orders.
  const all = data.rows.flatMap(r => Object.values(r.cells))
  const maxShare = Math.max(1, ...all.map(c => c.share ?? 0))
  const maxLog = Math.log10(Math.max(10, ...all.map(c => c.value)))
  const minLog = Math.max(0, maxLog - 5)
  const t = (c: { value: number; share: number | null } | undefined) => {
    if (!c || c.value <= 0) return 0
    if (metric === 'share') return Math.sqrt((c.share ?? 0) / maxShare)
    return (Math.log10(c.value) - minLog) / (maxLog - minLog)
  }

  const cols = `150px repeat(${sections.length}, minmax(36px, 1fr)) 92px`
  const headBtn = (id: string, label: string, title: string) => (
    <button key={id} onClick={() => setSortBy(sortBy === id ? null : id)} title={`${title} — click to sort`} style={{
      fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.04em', color: sortBy === id ? C.gold : C.muted,
      background: 'transparent', border: 'none', padding: '0 0 6px', cursor: 'pointer', textAlign: 'center',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip',
    }}>{label}{sortBy === id ? '▾' : ''}</button>
  )

  return (
    <div onMouseLeave={tip.hide}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 150 + sections.length * 36 + 92 + (sections.length + 1) * 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'end' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim, paddingBottom: 6, letterSpacing: '0.1em' }}>COUNTRY</div>
            {sections.map(s => headBtn(s.id, s.short, s.name))}
            {headBtn('TOTAL', 'TOTAL', `Total ${data.flow_name}`)}
          </div>
          {/* group colour key under each column so sections tie back to the treemap */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, marginBottom: 3 }}>
            <div />
            {sections.map(s => (
              <div key={s.id} title={s.name} style={{ height: 18, backgroundColor: SECTION_COLORS[s.id], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SectionIcon id={s.id} size={13} color="#FFFFFF" />
              </div>
            ))}
            <div />
          </div>
          {rows.map(row => {
            const isSel = row.country.iso3 === selected
            return (
              <div key={row.country.iso3} style={{ display: 'grid', gridTemplateColumns: cols, gap: 2, marginBottom: 2 }}>
                <button onClick={() => onPick(row.country.iso3)} title={`View ${row.country.name}`} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: isSel ? goldA(0.08) : 'transparent',
                  border: 'none', borderLeft: isSel ? `2px solid ${C.gold}` : '2px solid transparent', padding: '0 6px',
                  cursor: 'pointer', textAlign: 'left', height: 30, overflow: 'hidden',
                }}>
                  {row.country.flag && <span>{row.country.flag}</span>}
                  <span style={{ fontFamily: TECH, fontSize: 12, color: isSel ? C.gold : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.country.name}
                  </span>
                </button>
                {row.missing ? (
                  <div style={{
                    gridColumn: `span ${sections.length + 1}`, display: 'flex', alignItems: 'center', paddingLeft: 10,
                    fontFamily: MONO, fontSize: 10, color: C.muted, border: `1px dashed ${goldA(0.1)}`,
                  }}>
                    NOT REPORTED TO UN COMTRADE FOR {data.year}
                  </div>
                ) : (
                  <>
                    {sections.map(s => {
                      const c = row.cells[s.id]
                      const k = t(c)
                      const label = metric === 'share'
                        ? (c && (c.share ?? 0) >= 0.5 ? Math.round(c.share ?? 0).toString() : '')
                        : (c && k > 0.35 ? formatLargeNum(c.value, '$').replace(/\.\d+/, '') : '')
                      return (
                        <div key={s.id}
                          onMouseMove={e => tip.show(e, (
                            <div>
                              <div style={{ color: C.gold, marginBottom: 4 }}>{row.country.flag} {row.country.name}</div>
                              <div style={{ color: C.textSoft, marginBottom: 4 }}>{s.name} ({s.id})</div>
                              <TipRow label={data.flow_name.toUpperCase()} value={money(c?.value ?? 0)} />
                              <TipRow label="SHARE" value={pct(c?.share ?? 0, 2)} />
                            </div>
                          ))}
                          style={{
                            height: 30, backgroundColor: heatColor(k), display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: MONO, fontSize: 10, color: k > 0.6 ? C.bg : C.textSoft, cursor: 'default',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.outline = `1px solid ${C.goldBright}`)}
                          onMouseOut={e => (e.currentTarget.style.outline = 'none')}
                        >{label}</div>
                      )
                    })}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontFamily: MONO, fontSize: 11, color: C.text }}>
                      {money(row.total)}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* scale key */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{metric === 'share' ? '0%' : formatLargeNum(Math.pow(10, minLog), '$')}</span>
        <div style={{ width: 160, height: 8, background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})`, border }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{metric === 'share' ? `${maxShare.toFixed(0)}%` : formatLargeNum(Math.pow(10, maxLog), '$')}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim, marginLeft: 8 }}>
          {metric === 'share' ? `cell = section's % of each country's ${data.flow_name}` : `cell = ${data.flow_name} value (log scale)`}
        </span>
      </div>
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------

const MAX_HEATMAP = 15

export default function Trade() {
  const [meta, setMeta] = useState<TradeMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  // Shared with the LEADERBOARD tab, which can open a country here.
  const { country } = useTradeNav()
  const setCountry = setTradeCountry
  const [flow, setFlow] = useState<TradeFlow>('X')
  const [year, setYear] = useState<number | null>(null)

  const [profile, setProfile] = useState<TradeProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [partners, setPartners] = useState<TradePartners | null>(null)
  const [partnersError, setPartnersError] = useState<string | null>(null)
  const [trend, setTrend] = useState<TradeTrend | null>(null)
  const [trendError, setTrendError] = useState<string | null>(null)

  const [heatCountries, setHeatCountries] = useState<string[] | null>(null)
  const [heatmap, setHeatmap] = useState<TradeHeatmap | null>(null)
  const [heatmapError, setHeatmapError] = useState<string | null>(null)
  const [metric, setMetric] = useState<'share' | 'value'>('share')
  const [reload, setReload] = useState(0)

  const loadMeta = () => {
    setMetaError(null)
    fetchTradeMeta()
      .then(m => { setMeta(m); setHeatCountries(prev => prev ?? m.default_heatmap) })
      .catch(e => setMetaError(e.message))
  }
  useEffect(loadMeta, [])

  // Each panel loads independently so a slow/failed upstream call only
  // blanks its own panel. `cancelled` drops responses for stale selections.
  useEffect(() => {
    let cancelled = false
    setProfile(null); setProfileError(null)
    fetchTradeProfile(country, flow, year)
      .then(d => !cancelled && setProfile(d))
      .catch(e => !cancelled && setProfileError(e.message))
    return () => { cancelled = true }
  }, [country, flow, year, reload])

  useEffect(() => {
    let cancelled = false
    setPartners(null); setPartnersError(null)
    fetchTradePartners(country, year)
      .then(d => !cancelled && setPartners(d))
      .catch(e => !cancelled && setPartnersError(e.message))
    return () => { cancelled = true }
  }, [country, year, reload])

  useEffect(() => {
    let cancelled = false
    setTrend(null); setTrendError(null)
    fetchTradeTrend(country)
      .then(d => !cancelled && setTrend(d))
      .catch(e => !cancelled && setTrendError(e.message))
    return () => { cancelled = true }
  }, [country, reload])

  useEffect(() => {
    if (!heatCountries) return
    let cancelled = false
    setHeatmap(null); setHeatmapError(null)
    fetchTradeHeatmap(heatCountries, flow, year)
      .then(d => !cancelled && setHeatmap(d))
      .catch(e => !cancelled && setHeatmapError(e.message))
    return () => { cancelled = true }
  }, [heatCountries, flow, year, reload])

  const retry = () => setReload(r => r + 1)
  const known = useMemo(() => new Set(meta?.countries.map(c => c.iso3) ?? []), [meta])
  const byIso = useMemo(() => Object.fromEntries((meta?.countries ?? []).map(c => [c.iso3, c])), [meta]) as Record<string, TradeCountry>
  const current = byIso[country]
  const flowWord = flow === 'X' ? 'EXPORTS' : 'IMPORTS'

  const pick = (iso3: string) => {
    setCountry(iso3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (metaError) return <ErrorBlock message={metaError} onRetry={loadMeta} />
  if (!meta) return <Loading label="LOADING TRADE REFERENCE DATA" />

  const balance = profile && profile.world_exports !== null && profile.world_imports !== null
    ? profile.world_exports - profile.world_imports : null
  const topProduct = profile?.top_products?.[0] ?? profile?.top_chapters[0]
  const topPartner = partners?.partners.length
    ? [...partners.partners].sort((a, b) => (flow === 'X' ? b.exports - a.exports : b.imports - a.imports))[0]
    : null
  const shownYear = profile?.year ?? partners?.year ?? null

  return (
    <div>
      {/* Header + controls */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div>
          <span style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: '0.12em', textShadow: `0 0 10px ${goldA(0.35)}`, display: 'block', marginBottom: 4 }}>
            TRADE
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: '0.08em' }}>
            WHAT {current?.name.toUpperCase() ?? country} {flow === 'X' ? 'SELLS TO' : 'BUYS FROM'} THE WORLD{shownYear ? ` · ${shownYear}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={country} onChange={e => setCountry(e.target.value)} style={selectStyle} aria-label="Country">
            {[...meta.countries].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.iso3} value={c.iso3}>{c.flag} {c.name}</option>
            ))}
          </select>
          <Toggle value={flow} onChange={setFlow} options={[{ value: 'X', label: 'EXPORTS' }, { value: 'M', label: 'IMPORTS' }]} />
          <select value={year ?? ''} onChange={e => setYear(e.target.value ? Number(e.target.value) : null)} style={selectStyle} aria-label="Year">
            <option value="">LATEST</option>
            {meta.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Kpi label="TOTAL EXPORTS" value={money(profile?.world_exports)} sub={shownYear ? `${shownYear} · goods` : undefined} />
        <Kpi label="TOTAL IMPORTS" value={money(profile?.world_imports)} sub={shownYear ? `${shownYear} · goods` : undefined} />
        <Kpi label="TRADE BALANCE" value={<Delta value={balance} format={money} size={20} weight={600} />}
          sub={balance === null ? undefined : balance >= 0 ? 'SURPLUS' : 'DEFICIT'} />
        <Kpi label={`TOP ${flow === 'X' ? 'EXPORT' : 'IMPORT'}`} value={topProduct ? pct(topProduct.share) : '—'} sub={topProduct?.name} />
        <Kpi label={`TOP ${flow === 'X' ? 'DESTINATION' : 'ORIGIN'}`} value={topPartner ? `${topPartner.flag ?? ''} ${topPartner.iso3 ?? topPartner.name}`.trim() : '—'}
          sub={topPartner ? `${topPartner.name} · ${pct(flow === 'X' ? topPartner.export_share : topPartner.import_share)}` : undefined} />
      </div>

      {/* Treemap */}
      <Panel style={{ marginBottom: 14 }}>
        <PanelTitle right={profile?.total ? <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{profile.sections.reduce((n, s) => n + s.products.length, 0)} {profile.detail === 'HS4' ? 'PRODUCTS' : 'HS CHAPTERS'}</span> : null}>
          {'// PRODUCT MAP — '}{flowWord} BY {profile?.detail === 'HS2' ? 'HS CHAPTER' : 'PRODUCT'}
        </PanelTitle>
        {profileError && <ErrorBlock message={profileError} onRetry={retry} />}
        {!profileError && !profile && <Loading label="QUERYING UN COMTRADE · FIRST LOAD OF A COUNTRY CAN TAKE ~20S" />}
        {profile && profile.sections.length === 0 && <EmptyNote>{profile.note ?? 'No data.'}</EmptyNote>}
        {profile && profile.sections.length > 0 && <TradeTreemap profile={profile} />}
        {profile && (
          <SourceNote>
            {profile.source} · {profile.detail === 'HS2' ? 'HS 2-digit chapters (product detail unavailable)' : 'HS 4-digit products'} · tile area = share of {profile.flow_name} · click a sector icon to expand it · hover for detail
          </SourceNote>
        )}
      </Panel>

      {/* Partners + trend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 14, marginBottom: 14 }}>
        <Panel>
          <PanelTitle>{'// TOP PARTNERS'}{partners?.year ? ` · ${partners.year}` : ''}</PanelTitle>
          {partnersError && <ErrorBlock message={partnersError} onRetry={retry} />}
          {!partnersError && !partners && <Loading label="RANKING PARTNERS" />}
          {partners && partners.partners.length === 0 && <EmptyNote>{partners.note ?? 'No partner data.'}</EmptyNote>}
          {partners && partners.partners.length > 0 && <PartnersTable data={partners} flow={flow} onPick={pick} known={known} />}
          {partners && <SourceNote>{partners.source} · balance = exports to − imports from · click a partner to load it</SourceNote>}
        </Panel>
        <Panel>
          <PanelTitle>{'// EXPORTS VS IMPORTS · MERCHANDISE'}</PanelTitle>
          {trendError && <ErrorBlock message={trendError} onRetry={retry} />}
          {!trendError && !trend && <Loading label="PULLING TREND" />}
          {trend && trend.points.length === 0 && <EmptyNote>{trend.note ?? 'No trend data.'}</EmptyNote>}
          {trend && trend.points.length > 0 && <TrendChart data={trend} />}
          {trend && <SourceNote>{trend.source} · totals may differ slightly from Comtrade's</SourceNote>}
        </Panel>
      </div>

      {/* Heatmap */}
      <Panel>
        <PanelTitle right={<Toggle value={metric} onChange={setMetric} options={[{ value: 'share', label: 'SHARE %' }, { value: 'value', label: 'VALUE $' }]} />}>
          {'// TRADE HEATMAP — '}{flowWord} BY HS SECTION{heatmap ? ` · ${heatmap.year}` : ''}
        </PanelTitle>

        {/* country chips */}
        {heatCountries && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
            {heatCountries.map(iso => (
              <span key={iso} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${goldA(0.2)}`, padding: '3px 4px 3px 8px', fontFamily: MONO, fontSize: 10, color: C.textSoft }}>
                {byIso[iso]?.flag} {iso}
                <button onClick={() => setHeatCountries(heatCountries.filter(c => c !== iso))} disabled={heatCountries.length <= 1}
                  aria-label={`Remove ${iso}`} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>×</button>
              </span>
            ))}
            {heatCountries.length < MAX_HEATMAP && (
              <select value="" onChange={e => e.target.value && setHeatCountries([...heatCountries, e.target.value])} style={{ ...selectStyle, fontSize: 11, padding: '3px 6px' }} aria-label="Add country to heatmap">
                <option value="">+ ADD COUNTRY</option>
                {[...meta.countries].filter(c => !heatCountries.includes(c.iso3)).sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c.iso3} value={c.iso3}>{c.flag} {c.name}</option>
                ))}
              </select>
            )}
            {!heatCountries.includes(country) && heatCountries.length < MAX_HEATMAP && (
              <button onClick={() => setHeatCountries([...heatCountries, country])} style={{ ...selectStyle, fontSize: 11, padding: '3px 8px', color: C.gold }}>
                + {country}
              </button>
            )}
          </div>
        )}

        {heatmapError && <ErrorBlock message={heatmapError} onRetry={retry} />}
        {!heatmapError && !heatmap && <Loading label="BUILDING HEATMAP · FIRST LOAD CAN TAKE ~15S" />}
        {heatmap && <Heatmap data={heatmap} metric={metric} onPick={pick} selected={country} />}
        {heatmap && (
          <SourceNote>
            {heatmap.source} · {year ? '' : `defaults to ${heatmap.year}, the latest year most countries have reported · `}click a column to sort, a country to load it
          </SourceNote>
        )}
      </Panel>
    </div>
  )
}
