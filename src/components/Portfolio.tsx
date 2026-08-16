import { useEffect, useMemo, useState } from 'react'
import {
  fetchPortfolio, fetchPortfolioHistory, addPortfolioHolding, removePortfolioHolding,
  type PortfolioData, type PortfolioHolding, type PortfolioRange, type PortfolioHistoryPoint,
} from '@/lib/api'
import { formatMoney, posNegColor } from '@/lib/format'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'
import { buildColorMap } from '@/lib/palette'
import {
  useMetricConfig, MetricPicker, ConfirmRemove, LineChart, PieChart, BarRow,
  DetailStat, RangeButtons, Panel,
  fmtMoney, fmtSignedMoney, fmtPct, fmtSignedPct, fmtRatio, formatLargeNum,
  type MetricDef, type PieSlice,
} from './TrackingKit'

const border = '1px solid rgba(0,255,136,0.12)'

const PORTFOLIO_SECTIONS = [
  { id: 'add_form', label: 'ADD HOLDING FORM' },
  { id: 'summary', label: 'SUMMARY TOTALS' },
  { id: 'performance', label: 'PERFORMANCE CHART' },
  { id: 'holdings', label: 'HOLDINGS TABLE' },
  { id: 'allocation', label: 'ALLOCATION' },
  { id: 'breakdown', label: 'BREAKDOWN CHARTS' },
]

const RANGES: { key: PortfolioRange; label: string }[] = [
  { key: '1d', label: '1D' }, { key: '1w', label: '1W' }, { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' }, { key: '6mo', label: '6M' }, { key: '1y', label: '1Y' },
  { key: '3y', label: '3Y' }, { key: '5y', label: '5Y' }, { key: 'all', label: 'ALL' },
]

/**
 * Every metric a holding row can show. The user picks which of these are
 * visible; the choice applies to all holdings at once (not per-stock) and
 * persists in localStorage.
 */
const METRICS: MetricDef<PortfolioHolding>[] = [
  { id: 'qty',          label: 'Shares',        short: 'QTY',      get: h => h.qty,            format: v => v === null ? '—' : String(v), defaultOn: true },
  { id: 'avg_cost',     label: 'Cost / Share',  short: 'AVG COST', get: h => h.avg_cost,       format: v => fmtMoney(v), defaultOn: true },
  { id: 'price',        label: 'Price',         short: 'PRICE',    get: h => h.price,          format: v => fmtMoney(v), defaultOn: true },
  { id: 'value',        label: 'Value',         short: 'VALUE',    get: h => h.value,          format: v => fmtMoney(v, 0), defaultOn: true },
  { id: 'day_change_pct', label: 'Day Gain %',  short: 'DAY %',    get: h => h.day_change_pct, format: v => fmtSignedPct(v), signed: true, defaultOn: true },
  { id: 'day_gain',     label: 'Day Gain $',    short: 'DAY $',    get: h => h.day_gain,       format: v => fmtSignedMoney(v, 0), signed: true, defaultOn: true },
  { id: 'gain_pct',     label: 'All-Time Gain %', short: 'GAIN %', get: h => h.gain_pct,       format: v => fmtSignedPct(v), signed: true, defaultOn: true },
  { id: 'gain',         label: 'All-Time Gain $', short: 'GAIN $', get: h => h.gain,           format: v => fmtSignedMoney(v, 0), signed: true, defaultOn: true },
  { id: 'pe',           label: 'P/E (TTM)',     short: 'P/E',      get: h => h.pe,             format: v => fmtRatio(v), defaultOn: true },
  { id: 'forward_pe',   label: 'Forward P/E',   short: 'FWD P/E',  get: h => h.forward_pe,     format: v => fmtRatio(v), defaultOn: true },
  { id: 'cost_basis',   label: 'Cost Basis',    short: 'BASIS',    get: h => h.cost_basis,     format: v => fmtMoney(v, 0) },
  { id: 'dividend_yield', label: 'Div Yield',   short: 'DIV %',    get: h => h.dividend_yield, format: v => fmtPct(v) },
  { id: 'annual_dividend', label: 'Div / Year', short: 'DIV/YR',   get: h => h.annual_dividend, format: v => fmtMoney(v, 0) },
  { id: 'peg',          label: 'PEG',           short: 'PEG',      get: h => h.peg,            format: v => fmtRatio(v, 2) },
  { id: 'ps',           label: 'P/S',           short: 'P/S',      get: h => h.ps,             format: v => fmtRatio(v, 2) },
  { id: 'pb',           label: 'P/B',           short: 'P/B',      get: h => h.pb,             format: v => fmtRatio(v, 2) },
  { id: 'beta',         label: 'Beta',          short: 'BETA',     get: h => h.beta,           format: v => fmtRatio(v, 2) },
  { id: 'eps',          label: 'EPS',           short: 'EPS',      get: h => h.eps,            format: v => fmtMoney(v) },
  { id: 'market_cap',   label: 'Market Cap',    short: 'MKT CAP',  get: h => h.market_cap,     format: v => formatLargeNum(v, '$') },
  { id: 'week52_high',  label: '52W High',      short: '52W HI',   get: h => h.week52_high,    format: v => fmtMoney(v) },
  { id: 'week52_low',   label: '52W Low',       short: '52W LO',   get: h => h.week52_low,     format: v => fmtMoney(v) },
  { id: 'volume',       label: 'Volume',        short: 'VOL',      get: h => h.volume,         format: v => formatLargeNum(v) },
  { id: 'sector',       label: 'Sector',        short: 'SECTOR',   get: () => null,            format: (_v, h) => h.sector ?? '—' },
]

/** Performance chart with its own range state and fetch. */
function PerformanceChart() {
  const [range, setRange] = useState<PortfolioRange>('1y')
  const [points, setPoints] = useState<PortfolioHistoryPoint[] | null>(null)
  const [costBasis, setCostBasis] = useState<number | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPoints(null)
    setErr(null)
    fetchPortfolioHistory(range)
      .then(h => {
        if (cancelled) return
        setPoints(h.points)
        setCostBasis(h.cost_basis)
        setSkipped(h.skipped)
      })
      .catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [range])

  const first = points && points.length ? points[0].value : null
  const last = points && points.length ? points[points.length - 1].value : null
  const periodChange = first !== null && last !== null ? last - first : null
  const periodChangePct = first ? ((last as number) - first) / first * 100 : null

  return (
    <Panel
      title="/// PERFORMANCE"
      right={<RangeButtons ranges={RANGES} value={range} onChange={setRange} />}
    >
      {periodChange !== null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 600, color: '#C8FFD4' }}>
            {formatMoney(last, 0)}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: posNegColor(periodChange) }}>
            {fmtSignedMoney(periodChange, 0)}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: posNegColor(periodChangePct) }}>
            {fmtSignedPct(periodChangePct)}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
            over {RANGES.find(r => r.key === range)?.label}
          </span>
        </div>
      )}

      {err && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#FF3B3B' }}>{`// couldn't load history: ${err}`}</div>}
      {!err && !points && (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#3C8F5F' }}>loading…</span>
        </div>
      )}
      {!err && points && (
        <LineChart
          points={points}
          intraday={range === '1d'}
          refLine={costBasis}
          refLabel={costBasis ? `COST BASIS ${formatMoney(costBasis, 0)}` : undefined}
          formatValue={v => formatMoney(v, 0)}
        />
      )}

      <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F', lineHeight: 1.5 }}>
        {'// Values today\'s share counts at historical prices — "what this exact basket would have been worth". portfolio.txt records quantities, not dated buys/sells, so this is not an account-balance history if your positions changed over the window.'}
        {skipped.length > 0 && ` Excluded (no usable history): ${skipped.join(', ')}.`}
      </div>
    </Panel>
  )
}

/** Allocation panel: bar, donut, and a metrics panel for the selected slice. */
function AllocationPanel({ holdings, totalValue, colorMap }: {
  holdings: PortfolioHolding[]
  totalValue: number
  colorMap: Map<string, string>
}) {
  const sorted = useMemo(
    () => [...holdings].filter(h => (h.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [holdings],
  )

  // Default selection is the largest holding, and only changes when the
  // user clicks a different slice -- but must not point at a ticker that
  // has since been removed from the portfolio.
  const [selected, setSelected] = useState<string | null>(null)
  const effectiveSelected = useMemo(() => {
    if (selected && sorted.some(h => h.ticker === selected)) return selected
    return sorted[0]?.ticker ?? null
  }, [selected, sorted])

  const slices: PieSlice[] = sorted.map(h => ({
    key: h.ticker,
    label: h.ticker,
    value: h.value ?? 0,
    color: colorMap.get(h.ticker) ?? '#00FF88',
  }))

  const sel = sorted.find(h => h.ticker === effectiveSelected) ?? null
  const selPct = sel && totalValue ? ((sel.value ?? 0) / totalValue) * 100 : null

  return (
    <Panel title="/// ALLOCATION">
      {/* Stacked allocation bar */}
      <div style={{ display: 'flex', height: 14, gap: 1, overflow: 'hidden', marginBottom: 10 }}>
        {sorted.map(h => (
          <div
            key={h.ticker}
            title={`${h.ticker} — ${(((h.value ?? 0) / totalValue) * 100).toFixed(1)}%`}
            onClick={() => setSelected(h.ticker)}
            style={{
              width: `${((h.value ?? 0) / totalValue) * 100}%`,
              backgroundColor: colorMap.get(h.ticker),
              opacity: effectiveSelected === h.ticker ? 1 : 0.72,
              cursor: 'pointer',
              transition: 'opacity 0.12s',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {sorted.map(h => (
          <div
            key={h.ticker}
            onClick={() => setSelected(h.ticker)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: effectiveSelected === h.ticker ? 1 : 0.7 }}
          >
            <div style={{ width: 8, height: 8, backgroundColor: colorMap.get(h.ticker) }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#4DCC88' }}>{h.ticker}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#52A877' }}>
              {(((h.value ?? 0) / totalValue) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Donut + detail panel for the selected slice */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto', width: '40%', minWidth: 200, display: 'flex', justifyContent: 'center' }}>
          <PieChart slices={slices} selected={effectiveSelected} onSelect={setSelected} size={260} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          {sel ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 18,
                  color: colorMap.get(sel.ticker), textShadow: `0 0 8px ${colorMap.get(sel.ticker)}`,
                }}>
                  {sel.ticker}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877' }}>
                  {sel.name ?? ''}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                <DetailStat label="% OF PORTFOLIO" value={fmtPct(selPct)} color={colorMap.get(sel.ticker)} />
                <DetailStat label="SHARE COUNT" value={String(sel.qty)} />
                <DetailStat label="COST / SHARE" value={fmtMoney(sel.avg_cost)} />
                <DetailStat label="COST BASIS" value={fmtMoney(sel.cost_basis, 0)} />
                <DetailStat label="MARKET VALUE" value={fmtMoney(sel.value, 0)} />
                <DetailStat label="ALL-TIME RETURN" value={sel.gain !== null ? `${fmtSignedMoney(sel.gain, 0)} (${fmtSignedPct(sel.gain_pct)})` : '—'} color={posNegColor(sel.gain)} />
                <DetailStat label="LAST TRADING DAY" value={fmtSignedPct(sel.day_change_pct)} color={posNegColor(sel.day_change_pct)} />
                <DetailStat label="DIV YIELD" value={fmtPct(sel.dividend_yield)} />
              </div>
            </>
          ) : (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#3C8F5F' }}>
              Click a slice to see its details.
            </span>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Sector weighting + per-holding gain contribution. */
function BreakdownPanel({ holdings, totalValue, colorMap }: {
  holdings: PortfolioHolding[]
  totalValue: number
  colorMap: Map<string, string>
}) {
  const sectors = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of holdings) {
      if (!h.value) continue
      const key = h.sector ?? 'Unclassified'
      map.set(key, (map.get(key) ?? 0) + h.value)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [holdings])

  const gainRows = useMemo(
    () => holdings.filter(h => h.gain !== null).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)),
    [holdings],
  )
  const maxAbsGain = Math.max(...gainRows.map(h => Math.abs(h.gain ?? 0)), 1)
  const sectorMax = sectors.length ? sectors[0][1] : 1

  return (
    <Panel title="/// BREAKDOWN">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.12em', marginBottom: 8 }}>
            BY SECTOR
          </div>
          {sectors.length === 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>no sector data</span>
          )}
          {sectors.map(([sector, value], i) => (
            <BarRow
              key={sector}
              label={sector}
              value={value}
              max={sectorMax}
              color={`hsl(${(155 + i * 137.508) % 360}, 85%, 62%)`}
              valueLabel={`${((value / totalValue) * 100).toFixed(1)}%`}
            />
          ))}
        </div>

        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.12em', marginBottom: 8 }}>
            GAIN / LOSS CONTRIBUTION
          </div>
          {gainRows.length === 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
              add an avg cost to a holding to see this
            </span>
          )}
          {gainRows.map(h => (
            <BarRow
              key={h.ticker}
              label={h.ticker}
              value={Math.abs(h.gain ?? 0)}
              max={maxAbsGain}
              color={(h.gain ?? 0) >= 0 ? '#00FF88' : '#FF3B3B'}
              valueLabel={fmtSignedMoney(h.gain, 0)}
            />
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F' }}>
        {'// Sector colors are independent of the allocation palette — they group holdings, not individual positions.'}
      </div>
    </Panel>
  )
}

export default function Portfolio() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'value' | 'gain_pct' | 'gain'>('value')
  const [tickerIn, setTickerIn] = useState('')
  const [qtyIn, setQtyIn] = useState('')
  const [costIn, setCostIn] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setError(null)
    fetchPortfolio().then(setData).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(qtyIn)
    if (!tickerIn.trim() || isNaN(qty)) return
    const avgCost = costIn.trim() ? parseFloat(costIn) : undefined
    setSubmitting(true)
    addPortfolioHolding(tickerIn.trim().toUpperCase(), qty, avgCost)
      .then(d => { setData(d); setTickerIn(''); setQtyIn(''); setCostIn('') })
      .catch(e => setError(e.message))
      .finally(() => setSubmitting(false))
  }

  const handleRemove = (ticker: string) => {
    removePortfolioHolding(ticker).then(setData).catch(e => setError(e.message))
  }

  const sections = useSortableLayout('portfolio.sections', PORTFOLIO_SECTIONS)
  const summaryItems = useMemo(() => [
    { id: 'total_value', label: 'TOTAL VALUE' },
    { id: 'total_cost', label: 'TOTAL COST' },
    { id: 'total_gain', label: 'TOTAL GAIN' },
    { id: 'total_return', label: 'TOTAL RETURN' },
    { id: 'day_gain', label: 'DAY GAIN' },
    { id: 'div_yield', label: 'DIV YIELD' },
    { id: 'div_income', label: 'DIV / YEAR' },
  ], [])
  const summaryTiles = useSortableLayout('portfolio.summary', summaryItems)
  const metricCfg = useMetricConfig('portfolio.metrics', METRICS)

  // Colors are keyed off the portfolio's canonical (file) order so
  // re-sorting the table doesn't reshuffle every holding's color.
  const colorMap = useMemo(
    () => buildColorMap((data?.holdings ?? []).map(h => h.ticker)),
    [data?.holdings],
  )

  if (error && !data) return <ErrorBlock message={error} onRetry={load} />
  if (!data) return <Loading label="LOADING PORTFOLIO" />

  const validHoldings = data.holdings.filter(h => h.value !== null)
  const holdings = [...validHoldings].sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity))
  const hasCostBasis = data.total_cost_basis !== null

  const summaryByIdShown: Record<string, { label: string; value: string; color: string; show: boolean }> = {
    total_value:  { label: 'TOTAL VALUE', value: formatMoney(data.total_value, 0), color: '#C8FFD4', show: true },
    total_cost:   { label: 'TOTAL COST', value: formatMoney(data.total_cost_basis, 0), color: '#4DCC88', show: hasCostBasis },
    total_gain:   { label: 'TOTAL GAIN', value: fmtSignedMoney(data.total_gain, 0), color: posNegColor(data.total_gain), show: hasCostBasis },
    total_return: { label: 'TOTAL RETURN', value: fmtSignedPct(data.total_gain_pct), color: posNegColor(data.total_gain_pct), show: hasCostBasis },
    day_gain:     { label: 'DAY GAIN', value: data.total_day_gain !== null ? `${fmtSignedMoney(data.total_day_gain, 0)} (${fmtSignedPct(data.total_day_gain_pct)})` : '—', color: posNegColor(data.total_day_gain), show: data.total_day_gain !== null },
    div_yield:    { label: 'DIV YIELD', value: fmtPct(data.total_dividend_yield), color: '#FFD700', show: data.total_dividend_yield !== null },
    div_income:   { label: 'DIV / YEAR', value: formatMoney(data.total_annual_dividend, 0), color: '#FFD700', show: data.total_annual_dividend !== null },
  }
  const visibleSummary = summaryTiles.visible.filter(id => summaryByIdShown[id]?.show)

  // Fixed leading columns (ticker/name) + one per enabled metric + remove.
  const gridCols = `86px minmax(90px, 1fr) ${metricCfg.active.map(() => 'minmax(72px, 88px)').join(' ')} 52px`

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 16 }}>
        PORTFOLIO
      </span>

      {error && <div style={{ marginBottom: 12 }}><ErrorBlock message={error} /></div>}

      {data.errors.length > 0 && (
        <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#FFD700' }}>
          {data.errors.map((e, i) => <div key={i}>{'// '}{e}</div>)}
        </div>
      )}

      <EditHint />

      {sections.visible.map(sectionId => {
        if (sectionId === 'add_form') return (
          <Draggable key="add_form" id="add_form" label="ADD HOLDING FORM" api={sections} variant="section">
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <input value={tickerIn} onChange={e => setTickerIn(e.target.value.toUpperCase())} placeholder="TICKER" style={{
                backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, color: '#00FF88', letterSpacing: '0.08em', outline: 'none', width: 100, caretColor: '#00FF88',
              }} />
              <input value={qtyIn} onChange={e => setQtyIn(e.target.value)} placeholder="QTY" type="number" step="any" style={{
                backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, color: '#C8FFD4', outline: 'none', width: 90, caretColor: '#00FF88',
              }} />
              <input value={costIn} onChange={e => setCostIn(e.target.value)} placeholder="AVG COST (optional)" type="number" step="any" style={{
                backgroundColor: '#060E18', border, padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15, color: '#C8FFD4', outline: 'none', width: 150, caretColor: '#00FF88',
              }} />
              <button type="submit" disabled={submitting} style={{
                backgroundColor: 'rgba(0,255,136,0.1)', color: '#00FF88', fontFamily: "'Share Tech Mono', monospace",
                fontSize: 14, border: '1px solid rgba(0,255,136,0.3)', padding: '7px 14px',
                cursor: submitting ? 'default' : 'pointer', letterSpacing: '0.06em', opacity: submitting ? 0.5 : 1,
              }}>{submitting ? 'ADDING...' : 'ADD HOLDING'}</button>
            </form>
          </Draggable>
        )

        if (holdings.length === 0) return null

        if (sectionId === 'summary') return (
          <Draggable key="summary" id="summary" label="SUMMARY TOTALS" api={sections} variant="section">
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginBottom: 16 }}>
                {visibleSummary.map(id => {
                  const s = summaryByIdShown[id]
                  return (
                    <Draggable key={id} id={id} label={s.label} api={summaryTiles}>
                      <div style={{ backgroundColor: '#060E18', border, padding: '14px 16px', height: '100%' }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.12em', marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: s.color, textShadow: `0 0 8px ${s.color}60` }}>{s.value}</div>
                      </div>
                    </Draggable>
                  )
                })}
              </div>
              <AddWidgetTray api={summaryTiles} title="HIDDEN SUMMARY TILES" />

              {!hasCostBasis && (
                <div style={{ marginBottom: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
                  {'// Add an AVG COST when adding a holding to unlock gain/loss tracking'}
                </div>
              )}
            </>
          </Draggable>
        )

        if (sectionId === 'performance') return (
          <Draggable key="performance" id="performance" label="PERFORMANCE CHART" api={sections} variant="section">
            <PerformanceChart />
          </Draggable>
        )

        if (sectionId === 'holdings') return (
          <Draggable key="holdings" id="holdings" label="HOLDINGS TABLE" api={sections} variant="section">
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F', marginRight: 6 }}>SORT:</span>
                {(['value', 'gain', 'gain_pct'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSortBy(s)} style={{
                    fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
                    color: sortBy === s ? '#00FF88' : '#52A877',
                    background: sortBy === s ? 'rgba(0,255,136,0.08)' : 'transparent',
                    border: `1px solid ${sortBy === s ? 'rgba(0,255,136,0.3)' : 'rgba(0,255,136,0.1)'}`,
                    padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                    textShadow: sortBy === s ? '0 0 6px #00FF88' : 'none',
                  }}>
                    {s === 'value' ? 'VALUE' : s === 'gain' ? 'GAIN $' : 'GAIN %'}
                  </button>
                ))}
              </div>

              <MetricPicker
                metrics={METRICS}
                enabled={metricCfg.enabled}
                onToggle={metricCfg.toggle}
                onReset={metricCfg.reset}
              />

              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 'min-content' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, padding: '0 14px 8px' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F', letterSpacing: '0.1em' }}>TICKER</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F', letterSpacing: '0.1em' }}>NAME</div>
                    {metricCfg.active.map(m => (
                      <div key={m.id} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F', letterSpacing: '0.1em' }}>{m.short}</div>
                    ))}
                    <div />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {holdings.map(h => (
                      <div key={h.ticker} style={{
                        display: 'grid', gridTemplateColumns: gridCols, gap: 6,
                        alignItems: 'center', backgroundColor: '#060E18', border, padding: '11px 14px',
                        transition: 'border-color 0.1s',
                        // Color stripe identifying this holding, matching
                        // its allocation slice.
                        borderRight: `4px solid ${colorMap.get(h.ticker) ?? 'transparent'}`,
                      }}
                        onMouseEnter={e => {
                          // Only the non-stripe sides -- `borderColor` is a
                          // shorthand that would also clobber the
                          // borderRight color stripe set above.
                          e.currentTarget.style.borderTopColor = 'rgba(0,255,136,0.3)'
                          e.currentTarget.style.borderBottomColor = 'rgba(0,255,136,0.3)'
                          e.currentTarget.style.borderLeftColor = 'rgba(0,255,136,0.3)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderTopColor = 'rgba(0,255,136,0.12)'
                          e.currentTarget.style.borderBottomColor = 'rgba(0,255,136,0.12)'
                          e.currentTarget.style.borderLeftColor = 'rgba(0,255,136,0.12)'
                        }}
                      >
                        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 15, color: '#00FF88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>{h.ticker}</div>
                        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#4DCC88', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name ?? ''}>{h.name ?? '—'}</div>
                        {metricCfg.active.map(m => {
                          const raw = m.get(h)
                          return (
                            <div key={m.id} style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
                              color: m.signed ? posNegColor(raw) : '#C8FFD4',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {m.format(raw, h)}
                            </div>
                          )
                        })}
                        <ConfirmRemove onConfirm={() => handleRemove(h.ticker)} title={h.ticker} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          </Draggable>
        )

        if (sectionId === 'allocation') return (
          <Draggable key="allocation" id="allocation" label="ALLOCATION" api={sections} variant="section">
            <AllocationPanel holdings={holdings} totalValue={data.total_value} colorMap={colorMap} />
          </Draggable>
        )

        if (sectionId === 'breakdown') return (
          <Draggable key="breakdown" id="breakdown" label="BREAKDOWN CHARTS" api={sections} variant="section">
            <BreakdownPanel holdings={holdings} totalValue={data.total_value} colorMap={colorMap} />
          </Draggable>
        )

        return null
      })}

      {holdings.length === 0 && (
        <div style={{ backgroundColor: '#060E18', border, padding: '30px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#52A877' }}>
          No holdings yet — add one above.
        </div>
      )}

      <AddWidgetTray api={sections} title="HIDDEN SECTIONS" />

      <div style={{ marginTop: 10, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
        {'// DATA SOURCE: yfinance · positions saved to portfolio.txt on the backend · metric columns and their visibility are saved in this browser'}
      </div>
    </div>
  )
}
