import { useEffect, useMemo, useState } from 'react'
import { fetchBonds, type BondData, type FredYieldRow } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'

const BOND_SECTIONS = [
  { id: 'curve', label: 'GOVERNMENT YIELD CURVES' },
  { id: 'sovereigns', label: 'GLOBAL GOVERNMENT BONDS' },
  { id: 'corporate_ig', label: 'TOP INVESTMENT-GRADE ISSUERS' },
  { id: 'corporate_hy', label: 'TOP HIGH-YIELD & SPECULATIVE ISSUERS' },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88',
      letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

const changeColor = (v: number | null) =>
  v === null ? '#1D4A30' : v >= 0 ? '#00FF88' : '#FF3B3B'

/** "+45bp" / "-12bp" between two adjacent yields -- null if either side
 * is missing, so a gap in the curve just shows nothing rather than a
 * misleading "0bp". 1% = 100bp, so the diff in percentage points * 100. */
function formatBp(a: number | null, b: number | null): string | null {
  if (a === null || b === null) return null
  const bp = Math.round((b - a) * 100)
  return `${bp >= 0 ? '+' : ''}${bp}bp`
}

/** Small vertical divider sitting between two curve bars, showing the
 * basis-point gap between them at that point on the curve. `height` is
 * the bar-box height it should center against (same as the bars it sits
 * between), so it reads at roughly the curve's baseline regardless of
 * tile size. */
function GapChip({ bp, height, fontSize = 8 }: { bp: string | null; height: number; fontSize?: number }) {
  if (!bp) return <div style={{ width: 10 }} />
  const rising = bp.startsWith('+')
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 30, height, flexShrink: 0,
    }}>
      <div style={{ width: 1, flex: 1, backgroundColor: 'rgba(0,255,136,0.15)' }} />
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize, whiteSpace: 'nowrap',
        color: rising ? '#4FD98A' : bp === '+0bp' || bp === '0bp' ? '#2D6644' : '#D97A7A',
        padding: '2px 0',
      }}>
        {bp}
      </div>
      <div style={{ width: 1, flex: 1, backgroundColor: 'rgba(0,255,136,0.15)' }} />
    </div>
  )
}

/** A yield curve to render as a proportionally-sized tile -- US Treasury
 * and any FredYieldRow sovereign (JGB, GILT) all normalize down to this
 * shape so they can share one row and one component. */
interface CurveEntry {
  key: string
  label: string
  name: string
  yieldValue: number | null
  change: number | null
  date: string | null
  points: { tenor: string; yield: number | null }[]
}

/** Curve tile whose width is proportional to how many tenors it has --
 * a 7-point curve renders roughly 3.5x as wide as a 2-point one, so tile
 * size reflects how much curve there actually is to show rather than
 * every tile claiming equal space regardless of content. All tiles in a
 * row still share the same height/padding/font sizing (uniform), just
 * not the same width. */
function CurveTile({ entry }: { entry: CurveEntry }) {
  const { label, name, yieldValue, change, date, points } = entry
  const available = points.filter(p => p.yield !== null)
  const maxYield = available.length ? Math.max(...available.map(p => p.yield as number)) : 1
  const pointCount = Math.max(points.length, 1)

  return (
    <div style={{
      backgroundColor: '#03080F', border, padding: '20px 24px', height: '100%', minHeight: 264,
      display: 'flex', flexDirection: 'column',
      flex: `${pointCount} 0 0`, minWidth: pointCount * 78,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 20, color: '#C8FFD4', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#2D6644' }}>
          {name}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 44, fontWeight: 600,
          color: yieldValue !== null ? '#00FF88' : '#1D4A30',
          textShadow: yieldValue !== null ? '0 0 10px rgba(0,255,136,0.4)' : 'none',
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {yieldValue !== null ? `${yieldValue.toFixed(2)}%` : '—'}
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: changeColor(change) }}>
          {change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}` : '—'}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginLeft: 'auto' }}>
          {date ?? ''}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 90 }}>
        {points.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
            {'// no curve data available'}
          </div>
        )}
        {points.map((p, i) => (
          <div key={p.tenor} style={{ display: 'flex', alignItems: 'flex-end' }}>
            {i > 0 && <GapChip bp={formatBp(points[i - 1].yield, p.yield)} height={90} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 70 }}>
              {/* Fixed-height box so every bar's bottom edge sits on the
                  same plane regardless of the value text above it. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: 90 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#00FF88', textShadow: '0 0 4px #00FF88', marginBottom: 4 }}>
                  {p.yield !== null ? `${p.yield.toFixed(2)}%` : '—'}
                </div>
                <div style={{
                  width: '100%',
                  height: p.yield !== null ? `${(p.yield / maxYield) * 64}px` : '2px',
                  backgroundColor: 'rgba(0,255,136,0.15)',
                  border: '1px solid rgba(0,255,136,0.3)',
                  boxShadow: 'inset 0 0 6px rgba(0,255,136,0.1)',
                  position: 'relative',
                }}>
                  {p.yield !== null && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${(p.yield / maxYield) * 64}px`,
                      background: 'linear-gradient(0deg, rgba(0,255,136,0.25), transparent)',
                    }} />
                  )}
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.06em', marginTop: 4 }}>{p.tenor}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Small inline curve strip -- shared by the compact YieldTile and (in a
 * larger form) CurveTile. Every point comes straight from `row.curve`;
 * nothing here interpolates or invents a tenor that wasn't fetched. */
function CurveBars({ curve, barHeight }: { curve: FredYieldRow['curve']; barHeight: number }) {
  const points = curve ?? []
  const available = points.filter(p => p.yield !== null)
  const maxYield = available.length ? Math.max(...available.map(p => p.yield as number)) : 1
  if (points.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 6 }}>
      {points.map((p, i) => (
        <div key={p.tenor} style={{ display: 'flex', alignItems: 'flex-end', flex: i === 0 ? '0 0 auto' : 1, minWidth: 0 }}>
          {i > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: barHeight, flexShrink: 0, width: 16 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6, color: '#2D6644', whiteSpace: 'nowrap' }}>
                {formatBp(points[i - 1].yield, p.yield) ?? ''}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: barHeight }}>
              <div style={{
                width: '100%',
                height: p.yield !== null ? `${(p.yield / maxYield) * (barHeight - 4)}px` : '2px',
                backgroundColor: 'rgba(0,255,136,0.15)',
                border: '1px solid rgba(0,255,136,0.3)',
              }} />
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: '#2D6644', letterSpacing: '0.02em', marginTop: 2, whiteSpace: 'nowrap' }}>
              {p.tenor}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** One yield row -- used for both sovereigns and corporate rating tiers.
 * Sovereign rows carry a `curve` (as many of 1-MO/3-MO/6-MO/1-YR/5-YR/
 * 10-YR/30-YR as a real free source publishes for that country); it
 * renders as a compact bar strip when present. Corporate rows never set
 * `curve`, so they render exactly as before. */
function YieldTile({ row, showDate }: { row: FredYieldRow; showDate?: boolean }) {
  return (
    <div style={{ backgroundColor: '#03080F', border, padding: '14px 16px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#C8FFD4' }}>
          {row.label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644' }}>
          {row.name}
        </span>
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600,
        color: row.yield !== null ? '#00FF88' : '#1D4A30',
        textShadow: row.yield !== null ? '0 0 8px rgba(0,255,136,0.35)' : 'none',
        letterSpacing: '-0.02em',
      }}>
        {row.yield !== null ? `${row.yield.toFixed(2)}%` : '—'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: changeColor(row.change) }}>
          {row.change !== null ? `${row.change >= 0 ? '+' : ''}${row.change.toFixed(2)}` : '—'}
        </span>
        {showDate && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#1D4A30' }}>
            {row.date ?? ''}
          </span>
        )}
      </div>
      {showDate && <CurveBars curve={row.curve} barHeight={36} />}
    </div>
  )
}

export default function Bonds() {
  const [data, setData] = useState<BondData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setData(null)
    fetchBonds().then(setData).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const treasuries = data?.treasuries ?? []

  const sections = useSortableLayout('bonds.sections', BOND_SECTIONS)

  // Foreign sovereigns are individually toggleable, and ship mostly
  // hidden -- only JGBs are on by default (see bonds.py FOREIGN_SOVEREIGNS).
  const sovereignItems = useMemo(
    () => (data?.sovereigns ?? []).map(s => ({
      id: s.key, label: s.name, defaultHidden: s.default_hidden,
    })),
    [data?.sovereigns],
  )
  const sovereignTiles = useSortableLayout('bonds.sovereigns', sovereignItems)
  const sovereignByKey = useMemo(
    () => new Map((data?.sovereigns ?? []).map(s => [s.key, s])),
    [data?.sovereigns],
  )

  // US Treasury + JGB + GILT combined into one row of proportionally-sized
  // curve tiles -- these three have the richest tenor coverage, so they
  // get the shared "yield curves" treatment instead of uniform-size tiles.
  const curveEntries: CurveEntry[] = useMemo(() => {
    const entries: CurveEntry[] = []
    if (treasuries.length > 0) {
      const tenYear = treasuries.find(t => t.term === '10-YR')
      entries.push({
        key: 'us', label: 'US TREASURY', name: 'United States',
        yieldValue: tenYear?.yield ?? null, change: tenYear?.change ?? null, date: null,
        points: treasuries.map(t => ({ tenor: t.term, yield: t.yield })),
      })
    }
    const jgb = sovereignByKey.get('jgb')
    if (jgb) {
      entries.push({
        key: 'jgb', label: jgb.label, name: jgb.name,
        yieldValue: jgb.yield, change: jgb.change, date: jgb.date,
        points: jgb.curve ?? [],
      })
    }
    const gilt = sovereignByKey.get('gilt')
    if (gilt) {
      entries.push({
        key: 'gilt', label: gilt.label, name: gilt.name,
        yieldValue: gilt.yield, change: gilt.change, date: gilt.date,
        points: gilt.curve ?? [],
      })
    }
    return entries
  }, [treasuries, sovereignByKey])

  const igItems = useMemo(
    () => (data?.corporate_ig ?? []).map(r => ({ id: r.key, label: `${r.label} — ${r.name}` })),
    [data?.corporate_ig],
  )
  const igTiles = useSortableLayout('bonds.corporate_ig', igItems)
  const igByKey = useMemo(
    () => new Map((data?.corporate_ig ?? []).map(r => [r.key, r])),
    [data?.corporate_ig],
  )

  const hyItems = useMemo(
    () => (data?.corporate_hy ?? []).map(r => ({ id: r.key, label: `${r.label} — ${r.name}` })),
    [data?.corporate_hy],
  )
  const hyTiles = useSortableLayout('bonds.corporate_hy', hyItems)
  const hyByKey = useMemo(
    () => new Map((data?.corporate_hy ?? []).map(r => [r.key, r])),
    [data?.corporate_hy],
  )

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 20 }}>
        BONDS {'&'} FIXED INCOME
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !data && <Loading label="PULLING BOND YIELDS" />}

      {data && <EditHint />}

      {data && sections.visible.map(sectionId => {
        if (sectionId === 'curve') return (
          <Draggable key="curve" id="curve" label="GOVERNMENT YIELD CURVES" api={sections} variant="section">
            <div style={{ backgroundColor: '#060E18', border, padding: '18px', marginBottom: 14 }}>
              <SectionHeading>{'/// GOVERNMENT YIELD CURVES'}</SectionHeading>
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                {curveEntries.map(entry => <CurveTile key={entry.key} entry={entry} />)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// Tile width is proportional to how many tenors each curve actually has — US Treasury (Treasury.gov, daily, 1-MO-30-YR) is the widest since it has the most; JGB (Japan\'s MOF, daily, 1Y/5Y/10Y/30Y) is narrower; GILT (FRED/OECD, 3-MO + monthly-lagged 10-YR) narrower still. bp figures between bars are the gap to the next tenor (curve steepness), not day-over-day change.'}
              </div>
            </div>
          </Draggable>
        )

        if (sectionId === 'sovereigns') return (
          <Draggable key="sovereigns" id="sovereigns" label="GLOBAL GOVERNMENT BONDS" api={sections} variant="section">
            <div style={{ backgroundColor: '#060E18', border, padding: '18px', marginBottom: 14 }}>
              <SectionHeading>{'/// GLOBAL GOVERNMENT BONDS'}</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
                {sovereignTiles.visible.filter(key => key !== 'jgb' && key !== 'gilt').map(key => {
                  const row = sovereignByKey.get(key)
                  if (!row) return null
                  return (
                    <Draggable key={row.key} id={row.key} label={row.name} api={sovereignTiles}>
                      <YieldTile row={row} showDate />
                    </Draggable>
                  )
                })}
              </div>
              <AddWidgetTray api={sovereignTiles} title="MORE COUNTRIES" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// JGB and GILT (the two default-visible countries) render up in the Government Yield Curves section above, alongside the U.S. curve, since they have the richest data. Every tile here charts as much of a real curve as a free source publishes for that country — no invented tenors. 10-YR is OECD/FRED (monthly, lagged — the date shown); 3-MO is the OECD interbank rate. No free live source was found for 1-MO/6-MO/1-YR for BUND/ACGB — those gaps are left blank rather than guessed.'}
              </div>
            </div>
          </Draggable>
        )

        if (sectionId === 'corporate_ig') return (
          <Draggable key="corporate_ig" id="corporate_ig" label="TOP INVESTMENT-GRADE ISSUERS" api={sections} variant="section">
            <div style={{ backgroundColor: '#060E18', border, padding: '18px', marginBottom: 14 }}>
              <SectionHeading>{'/// TOP INVESTMENT-GRADE ISSUERS'}</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
                {igTiles.visible.map(key => {
                  const row = igByKey.get(key)
                  if (!row) return null
                  return (
                    <Draggable key={row.key} id={row.key} label={`${row.label} — ${row.name}`} api={igTiles}>
                      <YieldTile row={row} />
                    </Draggable>
                  )
                })}
              </div>
              <AddWidgetTray api={igTiles} title="HIDDEN RATING TIERS" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// ICE BofA investment-grade index effective yields by rating tier (daily, via FRED). Per-issuer bond quotes are subscription-only data, so these are the benchmark curves those issuers price against rather than invented per-company yields.'}
              </div>
            </div>
          </Draggable>
        )

        if (sectionId === 'corporate_hy') return (
          <Draggable key="corporate_hy" id="corporate_hy" label="TOP HIGH-YIELD & SPECULATIVE ISSUERS" api={sections} variant="section">
            <div style={{ backgroundColor: '#060E18', border, padding: '18px', marginBottom: 14 }}>
              <SectionHeading>{'/// TOP HIGH-YIELD & SPECULATIVE ISSUERS'}</SectionHeading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
                {hyTiles.visible.map(key => {
                  const row = hyByKey.get(key)
                  if (!row) return null
                  return (
                    <Draggable key={row.key} id={row.key} label={`${row.label} — ${row.name}`} api={hyTiles}>
                      <YieldTile row={row} />
                    </Draggable>
                  )
                })}
              </div>
              <AddWidgetTray api={hyTiles} title="HIDDEN RATING TIERS" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// ICE BofA high-yield index effective yields by rating tier (daily, via FRED). CCC & lower is the distressed end — a widening gap vs. BB is a classic risk-off signal.'}
              </div>
            </div>
          </Draggable>
        )

        return null
      })}

      {data && <AddWidgetTray api={sections} title="HIDDEN SECTIONS" />}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCES: Treasury.gov (U.S. curve, daily; yfinance fallback) · FRED/OECD (10Y sovereign baseline, monthly) · Japan MOF, Bank of Canada, Bank of England (JGB/CANGB/GILT curves, daily) · FRED/ICE BofA (corporate rating tiers, daily). Corporate + sovereign sections need FRED_API_KEY set.'}
      </div>
    </div>
  )
}
