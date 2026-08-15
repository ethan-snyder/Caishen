import { useEffect, useMemo, useState } from 'react'
import { fetchBonds, type BondData, type FredYieldRow } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'

const BOND_SECTIONS = [
  { id: 'curve', label: 'GOVERNMENT YIELD CURVES' },
  { id: 'corporate', label: 'CORPORATE BONDS' },
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

// Fixed, non-shrinking dimensions for a curve point column and the bp gap
// chip beside it -- every tile's width is just these summed up, so it's
// deterministic (proportional to tenor count) instead of fighting other
// tiles for space via flex-grow, which is what caused bars to compress
// into each other when the row didn't have enough room.
const POINT_WIDTH = 60
const POINT_GAP = 8

/** Curve tile sized to fit its own points exactly -- a 7-point curve is
 * roughly 3.5x as wide as a 2-point one, so tile size reflects how much
 * curve there actually is to show. Tiles never shrink below that content
 * width; the row they sit in wraps instead of squeezing them. */
function CurveTile({ entry }: { entry: CurveEntry }) {
  const { label, name, yieldValue, change, date, points } = entry
  const available = points.filter(p => p.yield !== null)
  const maxYield = available.length ? Math.max(...available.map(p => p.yield as number)) : 1

  return (
    <div style={{
      backgroundColor: '#03080F', border, padding: '20px 24px', minHeight: 264,
      display: 'flex', flexDirection: 'column', flex: '0 0 auto',
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

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: POINT_GAP, minHeight: 90 }}>
        {points.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
            {'// no curve data available'}
          </div>
        )}
        {points.map((p, i) => (
          <div key={p.tenor} style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
            {i > 0 && <GapChip bp={formatBp(points[i - 1].yield, p.yield)} height={90} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: POINT_WIDTH, flexShrink: 0 }}>
              {/* Fixed-height box so every bar's bottom edge sits on the
                  same plane regardless of the value text above it. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%', height: 90 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#00FF88', textShadow: '0 0 4px #00FF88', marginBottom: 4, whiteSpace: 'nowrap' }}>
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.06em', marginTop: 4, whiteSpace: 'nowrap' }}>{p.tenor}</div>
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
 * No sub-label -- just the rating/country code plus the number; `row.name`
 * (the fuller "Aa/AA" / "Japan 10Y" description) is still there in the
 * data for tooltips/accessibility elsewhere, just not rendered as a
 * corner label here. Sovereign rows carry a `curve` (as many of
 * 1-MO/3-MO/6-MO/1-YR/5-YR/10-YR/30-YR as a real free source publishes
 * for that country); it renders as a compact bar strip when present.
 * Corporate rows never set `curve`, so they render exactly as before.
 * `square` fixes the tile to a square footprint (width = height) for the
 * combined Corporate Bonds grid. */
function YieldTile({ row, showDate, square }: { row: FredYieldRow; showDate?: boolean; square?: boolean }) {
  return (
    <div style={{
      backgroundColor: '#03080F', border, padding: '14px 16px', height: '100%',
      ...(square ? { width: 110, aspectRatio: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#C8FFD4' }}>
          {row.label}
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

  // Sovereigns other than JGB/GILT ship hidden by default (see
  // bonds.py FOREIGN_SOVEREIGNS' default_hidden) -- individually
  // toggleable via the tray, same pattern as the old dedicated section.
  // US Treasury isn't part of this: it's not a sovereign row and always
  // shows.
  const sovereignItems = useMemo(
    () => (data?.sovereigns ?? []).map(s => ({
      id: s.key, label: s.name, defaultHidden: s.default_hidden,
    })),
    [data?.sovereigns],
  )
  const sovereignTiles = useSortableLayout('bonds.curve_countries', sovereignItems)
  const sovereignByKey = useMemo(
    () => new Map((data?.sovereigns ?? []).map(s => [s.key, s])),
    [data?.sovereigns],
  )

  // US Treasury (always shown) + whichever sovereigns are toggled visible,
  // all in one proportionally-sized row. Tile width scales with tenor count.
  const usEntry: CurveEntry | null = useMemo(() => {
    if (treasuries.length === 0) return null
    const tenYear = treasuries.find(t => t.term === '10-YR')
    return {
      key: 'us', label: 'US TREASURY', name: 'United States',
      yieldValue: tenYear?.yield ?? null, change: tenYear?.change ?? null, date: null,
      points: treasuries.map(t => ({ tenor: t.term, yield: t.yield })),
    }
  }, [treasuries])

  const visibleSovereignEntries: CurveEntry[] = useMemo(
    () => sovereignTiles.visible
      .map(key => sovereignByKey.get(key))
      .filter((s): s is FredYieldRow => !!s)
      .map(s => ({
        key: s.key, label: s.label, name: s.name,
        yieldValue: s.yield, change: s.change, date: s.date,
        points: s.curve ?? [],
      })),
    [sovereignTiles.visible, sovereignByKey],
  )

  // Investment-grade and high-yield tiers combined into one corporate
  // bonds grid (was two separate sections).
  const corporateRows = useMemo(
    () => [...(data?.corporate_ig ?? []), ...(data?.corporate_hy ?? [])],
    [data?.corporate_ig, data?.corporate_hy],
  )
  const corporateItems = useMemo(
    () => corporateRows.map(r => ({ id: r.key, label: `${r.label} — ${r.name}` })),
    [corporateRows],
  )
  const corporateTiles = useSortableLayout('bonds.corporate', corporateItems)
  const corporateByKey = useMemo(
    () => new Map(corporateRows.map(r => [r.key, r])),
    [corporateRows],
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
                {usEntry && <CurveTile entry={usEntry} />}
                {visibleSovereignEntries.map(entry => (
                  <Draggable key={entry.key} id={entry.key} label={entry.name} api={sovereignTiles}>
                    <CurveTile entry={entry} />
                  </Draggable>
                ))}
              </div>
              <AddWidgetTray api={sovereignTiles} title="MORE COUNTRIES" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// US Treasury, JGB, and GILT show by default; other countries are hidden until added above. Tile width is proportional to tenor count. US Treasury (Treasury.gov, daily, 1-MO-30-YR) is widest; JGB (Japan MOF, 1Y/5Y/10Y/30Y) narrower; GILT (3-MO+10-YR) narrower still; BUND/CANGB/ACGB/BRA (mostly 3-MO+10-YR) smallest. All real data — no interpolation, no invented tenors. bp figures between bars are the gap to the next tenor (curve steepness), not day-over-day change.'}
              </div>
            </div>
          </Draggable>
        )

        if (sectionId === 'corporate') return (
          <Draggable key="corporate" id="corporate" label="CORPORATE BONDS" api={sections} variant="section">
            <div style={{ backgroundColor: '#060E18', border, padding: '18px', marginBottom: 14 }}>
              <SectionHeading>{'/// CORPORATE BONDS'}</SectionHeading>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {corporateTiles.visible.map(key => {
                  const row = corporateByKey.get(key)
                  if (!row) return null
                  return (
                    <Draggable key={row.key} id={row.key} label={`${row.label} — ${row.name}`} api={corporateTiles}>
                      <YieldTile row={row} square />
                    </Draggable>
                  )
                })}
              </div>
              <AddWidgetTray api={corporateTiles} title="HIDDEN RATING TIERS" />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30', marginTop: 10 }}>
                {'// ICE BofA index effective yields by rating tier (daily, via FRED) — investment-grade (AAA-BBB) through high-yield/speculative (BB-CCC-D). Per-issuer bond quotes are subscription-only data, so these are the benchmark curves those issuers actually price against rather than invented per-company yields. CCC-D is the distressed end (ICE BofA folds CCC/CC/C/D into one bucket, no free source publishes D separately) — a widening gap vs. BB is a classic risk-off signal.'}
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
