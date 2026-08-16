import { useState, type MouseEvent } from 'react'
import { fetchStockQuote, type StockQuote } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import { AxisLabels, GridLines } from './ChartGrid'
import {
  num, projectEpsPe, impliedGrowth, projectDriver, projectEv,
  projectGordon, gordonSensitivity, projectLynch, totalReturn,
  type EpsYear, type DriverYear, type EvYear,
} from '@/lib/valuation'

// ----------------------------------------------------------------------
// Models
// ----------------------------------------------------------------------
//
// Every model here keeps the property that made the original one useful:
// a handful of inputs, one arithmetic step, and no hidden discount rate.
// The math lives in lib/valuation.ts as pure functions; this file is
// only inputs and rendering.
//
// Three of them (EPS x P/E, driver, EV/EBITDA) project a price per year
// and share the scenario-card + chart layout. Two (reverse DCF, Gordon)
// answer a single question and get their own body -- forcing them into a
// three-year path would be inventing structure the model doesn't have.

type ModelKey = 'epspe' | 'lynch' | 'reverse' | 'driver' | 'ev' | 'gordon'

const MODELS: { key: ModelKey; label: string; formula: string }[] = [
  { key: 'epspe', label: 'EPS × P/E', formula: 'price = EPS × P/E' },
  { key: 'lynch', label: 'LYNCH', formula: 'fair value = EPS × growth rate  ·  PEG = P/E ÷ growth' },
  { key: 'reverse', label: 'REVERSE DCF', formula: 'solve: what growth does today’s price imply?' },
  { key: 'driver', label: 'DRIVER', formula: 'price = (revenue × margin ÷ shares) × P/E' },
  { key: 'ev', label: 'EV/EBITDA', formula: 'price = (EBITDA × multiple − net debt) ÷ shares' },
  { key: 'gordon', label: 'GORDON', formula: 'price = D₁ ÷ (r − g)' },
]

type ScenarioKey = 'bear' | 'base' | 'bull'
const KEYS: ScenarioKey[] = ['bear', 'base', 'bull']

const SCENARIO_META: Record<ScenarioKey, { label: string; color: string; bg: string }> = {
  bear: { label: 'BEAR', color: '#FF3B3B', bg: 'rgba(255,59,59,0.05)' },
  base: { label: 'BASE', color: '#FFD700', bg: 'rgba(255,215,0,0.05)' },
  bull: { label: 'BULL', color: '#00FF88', bg: 'rgba(0,255,136,0.05)' },
}

const YEARS = 3
const CURRENT_YEAR = new Date().getFullYear()
const border = '1px solid rgba(0,255,136,0.12)'

const DEFAULT_EPS: Record<ScenarioKey, EpsYear[]> = {
  bear: [{ epsGrowth: '3', pe: '24' }, { epsGrowth: '2', pe: '22' }, { epsGrowth: '2', pe: '20' }],
  base: [{ epsGrowth: '9', pe: '30' }, { epsGrowth: '10', pe: '30' }, { epsGrowth: '11', pe: '31' }],
  bull: [{ epsGrowth: '15', pe: '36' }, { epsGrowth: '16', pe: '38' }, { epsGrowth: '18', pe: '40' }],
}

const DEFAULT_DRIVER: Record<ScenarioKey, DriverYear[]> = {
  bear: Array.from({ length: YEARS }, () => ({ revGrowth: '3', netMargin: '20', shareChange: '0', pe: '20' })),
  base: Array.from({ length: YEARS }, () => ({ revGrowth: '8', netMargin: '24', shareChange: '-2', pe: '28' })),
  bull: Array.from({ length: YEARS }, () => ({ revGrowth: '13', netMargin: '28', shareChange: '-3', pe: '34' })),
}

const DEFAULT_EV: Record<ScenarioKey, EvYear[]> = {
  bear: Array.from({ length: YEARS }, () => ({ ebitdaGrowth: '3', multiple: '11' })),
  base: Array.from({ length: YEARS }, () => ({ ebitdaGrowth: '8', multiple: '14' })),
  bull: Array.from({ length: YEARS }, () => ({ ebitdaGrowth: '13', multiple: '18' })),
}

const DEFAULT_REVERSE: Record<ScenarioKey, string> = { bear: '20', base: '28', bull: '36' }

// Growth assumptions bracketing Lynch's 10-25% comfort band.
const DEFAULT_LYNCH: Record<ScenarioKey, string> = { bear: '8', base: '14', bull: '22' }
const DEFAULT_GORDON: Record<ScenarioKey, { g: string; r: string }> = {
  bear: { g: '3', r: '10' },
  base: { g: '5', r: '9' },
  bull: { g: '7', r: '8' },
}

// ----------------------------------------------------------------------
// Number field with terminal-style steppers
// ----------------------------------------------------------------------

function StepArrow({ dir, color, onClick }: {
  dir: 'up' | 'down'
  color: string
  onClick: () => void
}) {
  const [hot, setHot] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'up' ? 'increase' : 'decrease'}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        flex: 1, width: 24, cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hot ? `${color}22` : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${color}55`,
        borderBottom: dir === 'up' ? `1px solid ${color}33` : 'none',
        color: hot ? color : '#4DCC88',
        fontSize: 10, lineHeight: 1,
        textShadow: hot ? `0 0 6px ${color}` : 'none',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {dir === 'up' ? '▲' : '▼'}
    </button>
  )
}

/**
 * The browser's native number spinner is hidden (see .proj-num in
 * index.css): it renders as a grey OS widget that ignores the palette,
 * only appears on hover in most browsers, and has a hit target a few
 * pixels tall.
 */
function NumberField({ label, value, color, step = 1, min, onChange }: {
  label: string
  value: string
  color: string
  step?: number
  min?: number
  onChange: (v: string) => void
}) {
  const bump = (dir: 1 | -1) => {
    const current = parseFloat(value)
    const next = (Number.isNaN(current) ? 0 : current) + dir * step
    const clamped = min !== undefined ? Math.max(min, next) : next
    // Rounded to kill floating-point dust that would otherwise creep
    // into the field after a few clicks.
    onChange(String(Math.round(clamped * 100) / 100))
  }

  return (
    <div style={{ flex: '1 1 96px', minWidth: 96 }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        color: '#52A877', letterSpacing: '0.08em', marginBottom: 4, whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        backgroundColor: '#03080F', border: `2px solid ${color}44`,
        transition: 'border-color 0.1s',
      }}
        onFocus={e => (e.currentTarget.style.borderColor = color)}
        onBlur={e => (e.currentTarget.style.borderColor = `${color}44`)}
      >
        <input
          className="proj-num"
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none',
            padding: '7px 8px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16, color: '#C8FFD4', outline: 'none', caretColor: color,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <StepArrow dir="up" color={color} onClick={() => bump(1)} />
          <StepArrow dir="down" color={color} onClick={() => bump(-1)} />
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Projection chart
// ----------------------------------------------------------------------

/**
 * All three cases on one set of axes, year by year. Today's price is the
 * leftmost point when known: the question is "where does each case take
 * me from here", and omitting the shared starting point makes the three
 * lines look far more alike than they are.
 *
 * Values are nullable -- a cleared input or a model that can't produce a
 * price for a year yields a gap rather than a line dropping to zero,
 * which would read as a crash that isn't there.
 */
function ProjectionChart({ series, currentPrice, height = 230 }: {
  series: { key: string; label: string; color: string; prices: (number | null)[] }[]
  currentPrice: number | null
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const hasToday = currentPrice !== null && currentPrice > 0
  const xLabels = [
    ...(hasToday ? ['TODAY'] : []),
    ...Array.from({ length: YEARS }, (_, i) => String(CURRENT_YEAR + i + 1)),
  ]
  const lines = series.map(s => ({
    ...s,
    values: (hasToday ? [currentPrice as number, ...s.prices] : s.prices),
  }))

  const all = lines.flatMap(l => l.values).filter((v): v is number => v !== null && Number.isFinite(v))
  if (!all.length) return null
  const rawMin = Math.min(...all)
  const rawMax = Math.max(...all)
  const pad = (rawMax - rawMin || rawMax || 1) * 0.08
  const min = Math.max(0, rawMin - pad)
  const max = rawMax + pad
  const span = max - min || 1

  const n = xLabels.length
  const w = 800
  const h = height
  const xAt = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const yAt = (v: number) => h - ((v - min) / span) * h

  const handleMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))))
  }

  const fmt = (v: number) => `$${v.toFixed(0)}`
  const tooltipPct = hover !== null ? (xAt(hover) / w) * 100 : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10 }}>
        <AxisLabels min={min} max={max} height={h} minWidth={70} format={fmt} />
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair', display: 'block', overflow: 'visible' }}
          >
            <GridLines w={w} h={h} />
            {hasToday && (
              <line
                x1={0} y1={yAt(currentPrice as number)} x2={w} y2={yAt(currentPrice as number)}
                stroke="#C8FFD4" strokeWidth={1} strokeDasharray="6,5" opacity={0.35}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {lines.map(l => (
              <polyline
                key={l.key}
                points={l.values
                  .map((v, i) => (v === null ? null : `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`))
                  .filter(Boolean)
                  .join(' ')}
                fill="none" stroke={l.color} strokeWidth={2} opacity={0.95}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover !== null && (
              <line
                x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={h}
                stroke="#C8FFD4" strokeWidth={0.75} strokeDasharray="2,2" opacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* CSS circles, not SVG <circle>s: preserveAspectRatio="none"
              stretches x and y unevenly, turning real circles oval. */}
          {lines.flatMap(l =>
            l.values.map((v, i) => (v === null ? null : (
              <div
                key={`${l.key}-${i}`}
                style={{
                  position: 'absolute',
                  left: `${(xAt(i) / w) * 100}%`,
                  top: `${(yAt(v) / h) * 100}%`,
                  width: hover === i ? 10 : 7, height: hover === i ? 10 : 7,
                  borderRadius: '50%', backgroundColor: l.color,
                  border: '1px solid #060E18',
                  boxShadow: hover === i ? `0 0 8px ${l.color}` : 'none',
                  transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                  transition: 'width 0.1s, height 0.1s',
                }}
              />
            ))),
          )}

          {hover !== null && (
            <div style={{
              position: 'absolute', top: -6,
              left: `${tooltipPct}%`,
              transform: tooltipPct > 60 ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
              backgroundColor: '#0A1420', border: '1px solid rgba(0,255,136,0.35)',
              padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14, color: '#C8FFD4', whiteSpace: 'nowrap',
              pointerEvents: 'none', zIndex: 10,
            }}>
              <div style={{ color: '#52A877', fontSize: 12, marginBottom: 3 }}>{xLabels[hover]}</div>
              {lines.map(l => (
                <div key={l.key} style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                  <span style={{ color: l.color }}>{l.label}</span>
                  <span style={{ fontWeight: 600 }}>
                    {l.values[hover] === null ? '—' : `$${(l.values[hover] as number).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginLeft: 80,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F', marginTop: 6,
      }}>
        {xLabels.map(l => <span key={l}>{l}</span>)}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Shared pieces
// ----------------------------------------------------------------------

function ScenarioShell({ sk, headerRight, children }: {
  sk: ScenarioKey
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  const meta = SCENARIO_META[sk]
  return (
    <div style={{
      backgroundColor: '#060E18',
      border: `2px solid ${meta.color}66`,
      boxShadow: `0 0 14px ${meta.color}1A, inset 0 0 24px ${meta.color}0D`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', backgroundColor: meta.bg,
        borderBottom: `2px solid ${meta.color}66`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontFamily: "'VT323', monospace", fontSize: 22, color: meta.color,
          letterSpacing: '0.1em', textShadow: `0 0 8px ${meta.color}`,
        }}>
          {meta.label} CASE
        </span>
        {headerRight}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  )
}

function ReturnBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#3C8F5F' }}>—</span>
  }
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
      color: value >= 0 ? '#00FF88' : '#FF3B3B',
    }}>
      {value >= 0 ? '+' : ''}{value.toFixed(0)}% / {YEARS}YR
    </span>
  )
}

function PriceRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: '#03080F', border: `2px solid ${color}44`, padding: '6px 9px',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600,
        color, textShadow: `0 0 8px ${color}80`,
      }}>
        {value}
      </span>
    </div>
  )
}

const money = (v: number | null, dp = 2) => (v === null ? '—' : `$${v.toFixed(dp)}`)

/** Compact big-number formatter for the live-inputs strip. */
function big(v: number | null): string {
  if (v === null) return '—'
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`
  return `${sign}$${a.toFixed(2)}`
}

function YearLabel({ i }: { i: number }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877',
      letterSpacing: '0.12em', marginBottom: 7,
    }}>
      YEAR {i + 1} — {CURRENT_YEAR + i + 1}
    </div>
  )
}

function Note({ children, tone = 'dim' }: { children: React.ReactNode; tone?: 'dim' | 'warn' }) {
  const warn = tone === 'warn'
  return (
    <div style={{
      padding: '9px 12px',
      backgroundColor: warn ? 'rgba(255,138,61,0.05)' : 'rgba(0,255,136,0.02)',
      border: `1px solid ${warn ? 'rgba(255,138,61,0.25)' : 'rgba(0,255,136,0.07)'}`,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
      color: warn ? '#FF8A3D' : '#3C8F5F',
    }}>
      {children}
    </div>
  )
}

// ----------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------

export default function Projector() {
  const [inputVal, setInputVal] = useState('AAPL')
  const [ticker, setTicker] = useState<string | null>(null)
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState<ModelKey>('epspe')

  // Editable seeds. Loading a ticker refills them; the user can override
  // any of them without refetching.
  const [manualEps, setManualEps] = useState('')
  const [manualRevenue, setManualRevenue] = useState('')
  const [manualShares, setManualShares] = useState('')
  const [manualEbitda, setManualEbitda] = useState('')
  const [manualNetDebt, setManualNetDebt] = useState('')
  const [manualDividend, setManualDividend] = useState('')

  const [epsSc, setEpsSc] = useState(DEFAULT_EPS)
  const [driverSc, setDriverSc] = useState(DEFAULT_DRIVER)
  const [evSc, setEvSc] = useState(DEFAULT_EV)
  const [reverseSc, setReverseSc] = useState(DEFAULT_REVERSE)
  const [gordonSc, setGordonSc] = useState(DEFAULT_GORDON)
  const [lynchSc, setLynchSc] = useState(DEFAULT_LYNCH)
  // Lynch's dividend-adjusted PEG. Seeded from the live yield; set to 0
  // for the classic growth-only form.
  const [lynchYield, setLynchYield] = useState('0')

  const load = (t: string) => {
    setTicker(t)
    setLoading(true)
    setError(null)
    setQuote(null)
    fetchStockQuote(t)
      .then(q => {
        setQuote(q)
        setManualEps(q.eps !== null ? String(q.eps) : '')
        setManualRevenue(q.revenue !== null ? String(q.revenue) : '')
        setManualShares(q.shares_outstanding !== null ? String(q.shares_outstanding) : '')
        setManualEbitda(q.ebitda !== null ? String(q.ebitda) : '')
        setManualNetDebt(q.net_debt !== null ? String(q.net_debt) : '')
        setManualDividend(q.dividend_rate !== null ? String(q.dividend_rate) : '')
        // Dividend yield for Lynch's dividend-adjusted PEG, derived from
        // the live rate and price rather than asking for it separately.
        setLynchYield(
          q.dividend_rate !== null && q.price > 0
            ? ((q.dividend_rate / q.price) * 100).toFixed(2)
            : '0',
        )
        // Margin seeds the driver model's starting assumption, so it
        // begins from the company's actual profitability rather than a
        // generic guess.
        if (q.profit_margin !== null) {
          const m = (q.profit_margin * 100).toFixed(1)
          setDriverSc(prev => ({
            bear: prev.bear.map(y => ({ ...y, netMargin: m })),
            base: prev.base.map(y => ({ ...y, netMargin: m })),
            bull: prev.bull.map(y => ({ ...y, netMargin: m })),
          }))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const currentPrice = quote?.price ?? null
  const baseEps = num(manualEps)
  const baseRevenue = num(manualRevenue)
  const baseShares = num(manualShares)
  const baseEbitda = num(manualEbitda)
  const netDebt = num(manualNetDebt)
  const dividend = num(manualDividend)

  const setYear = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<ScenarioKey, T[]>>>,
    sk: ScenarioKey, i: number, field: string, v: string,
  ) => {
    setter(prev => {
      const years = [...prev[sk]]
      years[i] = { ...(years[i] as object), [field]: v } as T
      return { ...prev, [sk]: years }
    })
  }

  // -- per-model price paths, all in the same shape for the chart ------
  const pricesFor = (sk: ScenarioKey): (number | null)[] => {
    if (model === 'epspe') return projectEpsPe(epsSc[sk], baseEps)
    if (model === 'driver') return projectDriver(driverSc[sk], baseRevenue, baseShares).map(r => r.price)
    if (model === 'ev') return projectEv(evSc[sk], baseEbitda, netDebt, baseShares).map(r => r.price)
    return []
  }

  const activeModel = MODELS.find(m => m.key === model)!
  const isPathModel = model === 'epspe' || model === 'driver' || model === 'ev'

  // What each model needs, so a missing input explains itself rather
  // than silently producing an empty page.
  const missing: string[] =
    model === 'epspe' || model === 'reverse' || model === 'lynch'
      ? (baseEps === null ? ['base EPS'] : [])
      : model === 'driver'
        ? [baseRevenue === null && 'revenue', baseShares === null && 'shares outstanding'].filter(Boolean) as string[]
        : model === 'ev'
          ? [baseEbitda === null && 'EBITDA', netDebt === null && 'net debt', baseShares === null && 'shares outstanding'].filter(Boolean) as string[]
          : (dividend === null ? ['dividend per share'] : [])

  const ready = quote !== null && missing.length === 0

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4',
          letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)',
        }}>
          {YEARS}-YEAR PRICE PROJECTOR
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (inputVal.trim()) load(inputVal.trim()) }}
          style={{ display: 'flex', gap: 8, maxWidth: 360, marginTop: 12 }}
        >
          <input
            value={inputVal}
            onChange={e => setInputVal(e.target.value.toUpperCase())}
            placeholder="TICKER"
            style={{
              flex: 1, backgroundColor: '#060E18', border, padding: '8px 12px',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#00FF88',
              letterSpacing: '0.08em', outline: 'none', caretColor: '#00FF88',
            }}
          />
          <button type="submit" style={{
            backgroundColor: '#00FF88', color: '#03080F', fontFamily: "'Share Tech Mono', monospace",
            fontSize: 15, fontWeight: 700, border: 'none', padding: '8px 16px',
            cursor: 'pointer', letterSpacing: '0.08em',
          }}>LOAD BASE</button>
        </form>

        {loading && <div style={{ marginTop: 12 }}><Loading label={`FETCHING ${ticker}`} /></div>}
        {error && <div style={{ marginTop: 12 }}><ErrorBlock message={error} onRetry={() => ticker && load(ticker)} /></div>}
        {!quote && !loading && !error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877', marginTop: 12 }}>
            Load a ticker to seed every model with live figures.
          </div>
        )}
      </div>

      {quote && !loading && !error && (
        <>
          {/* Model tabs. Inputs are per-model but the loaded ticker is
              shared, so switching never refetches or resets. */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {MODELS.map(m => {
              const on = m.key === model
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setModel(m.key)}
                  style={{
                    fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
                    padding: '6px 13px', cursor: 'pointer', letterSpacing: '0.06em',
                    backgroundColor: on ? 'rgba(0,255,136,0.14)' : 'transparent',
                    border: `2px solid ${on ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.12)'}`,
                    color: on ? '#00FF88' : '#52A877',
                    textShadow: on ? '0 0 8px rgba(0,255,136,0.6)' : 'none',
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* Live inputs the active model consumes, all editable. */}
          <div style={{
            backgroundColor: '#060E18', border, padding: '12px 15px', marginBottom: 14,
            display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877' }}>
              CURRENT: <span style={{ color: '#C8FFD4' }}>{money(currentPrice)}</span>
            </span>

            {(model === 'epspe' || model === 'reverse') && (
              <Seed label="BASE EPS (TTM)" value={manualEps} onChange={setManualEps} width={84} />
            )}
            {model === 'lynch' && (
              <>
                <Seed label="BASE EPS (TTM)" value={manualEps} onChange={setManualEps} width={84} />
                <Seed label="DIV YIELD %" value={lynchYield} onChange={setLynchYield} width={70} />
              </>
            )}
            {model === 'driver' && (
              <>
                <Seed label="REVENUE" value={manualRevenue} onChange={setManualRevenue} width={132} hint={big(baseRevenue)} />
                <Seed label="SHARES OUT" value={manualShares} onChange={setManualShares} width={132} hint={big(baseShares).replace('$', '')} />
              </>
            )}
            {model === 'ev' && (
              <>
                <Seed label="EBITDA" value={manualEbitda} onChange={setManualEbitda} width={132} hint={big(baseEbitda)} />
                <Seed label="NET DEBT" value={manualNetDebt} onChange={setManualNetDebt} width={132} hint={big(netDebt)} />
                <Seed label="SHARES OUT" value={manualShares} onChange={setManualShares} width={132} hint={big(baseShares).replace('$', '')} />
              </>
            )}
            {model === 'gordon' && (
              <Seed label="DIVIDEND / SHARE" value={manualDividend} onChange={setManualDividend} width={84} />
            )}

            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
              {activeModel.formula}
            </span>
          </div>

          {missing.length > 0 && (
            <Note tone="warn">
              {`// ${activeModel.label} needs ${missing.join(' and ')}, which ${
                missing.length > 1 ? 'are' : 'is'
              } not available for ${quote.ticker}. Enter ${
                missing.length > 1 ? 'them' : 'it'
              } above, or pick another model.`}
            </Note>
          )}

          {/* -- path models: 3 scenario cards + chart -------------------- */}
          {ready && isPathModel && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {KEYS.map(sk => {
                  const meta = SCENARIO_META[sk]
                  const prices = pricesFor(sk)
                  const driver = model === 'driver'
                    ? projectDriver(driverSc[sk], baseRevenue, baseShares) : null
                  const ev = model === 'ev'
                    ? projectEv(evSc[sk], baseEbitda, netDebt, baseShares) : null

                  return (
                    <ScenarioShell
                      key={sk}
                      sk={sk}
                      headerRight={<ReturnBadge value={totalReturn(prices[YEARS - 1] ?? null, currentPrice)} />}
                    >
                      {Array.from({ length: YEARS }, (_, i) => (
                        <div key={i} style={{ marginBottom: i < YEARS - 1 ? 14 : 0 }}>
                          <YearLabel i={i} />
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 7 }}>
                            {model === 'epspe' && (
                              <>
                                <NumberField label="EPS GRW %" color={meta.color} value={epsSc[sk][i].epsGrowth}
                                  onChange={v => setYear(setEpsSc, sk, i, 'epsGrowth', v)} />
                                <NumberField label="EXIT P/E" color={meta.color} min={0} value={epsSc[sk][i].pe}
                                  onChange={v => setYear(setEpsSc, sk, i, 'pe', v)} />
                              </>
                            )}
                            {model === 'driver' && (
                              <>
                                <NumberField label="REV GRW %" color={meta.color} value={driverSc[sk][i].revGrowth}
                                  onChange={v => setYear(setDriverSc, sk, i, 'revGrowth', v)} />
                                <NumberField label="NET MARGIN %" color={meta.color} value={driverSc[sk][i].netMargin}
                                  onChange={v => setYear(setDriverSc, sk, i, 'netMargin', v)} />
                                <NumberField label="SHARE CHG %" color={meta.color} value={driverSc[sk][i].shareChange}
                                  onChange={v => setYear(setDriverSc, sk, i, 'shareChange', v)} />
                                <NumberField label="EXIT P/E" color={meta.color} min={0} value={driverSc[sk][i].pe}
                                  onChange={v => setYear(setDriverSc, sk, i, 'pe', v)} />
                              </>
                            )}
                            {model === 'ev' && (
                              <>
                                <NumberField label="EBITDA GRW %" color={meta.color} value={evSc[sk][i].ebitdaGrowth}
                                  onChange={v => setYear(setEvSc, sk, i, 'ebitdaGrowth', v)} />
                                <NumberField label="EXIT EV/EBITDA" color={meta.color} min={0} value={evSc[sk][i].multiple}
                                  onChange={v => setYear(setEvSc, sk, i, 'multiple', v)} />
                              </>
                            )}
                          </div>

                          {/* Intermediate figures, so the price isn't a
                              black box -- this is the whole reason to use
                              these models over a bare multiple. */}
                          {driver && (
                            <div style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                              color: '#3C8F5F', marginBottom: 5, display: 'flex',
                              justifyContent: 'space-between', gap: 6, flexWrap: 'wrap',
                            }}>
                              <span>rev {big(driver[i].revenue)}</span>
                              <span>NI {big(driver[i].netIncome)}</span>
                              <span>EPS {money(driver[i].eps)}</span>
                            </div>
                          )}
                          {ev && (
                            <div style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                              color: '#3C8F5F', marginBottom: 5, display: 'flex',
                              justifyContent: 'space-between', gap: 6, flexWrap: 'wrap',
                            }}>
                              <span>EBITDA {big(ev[i].ebitda)}</span>
                              <span>EV {big(ev[i].enterpriseValue)}</span>
                              <span>eq {big(ev[i].equityValue)}</span>
                            </div>
                          )}

                          <PriceRow label="IMPLIED PRICE" color={meta.color} value={money(prices[i] ?? null)} />
                          {ev && ev[i].equityValue !== null && ev[i].price === null && (
                            <div style={{
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                              color: '#FF8A3D', marginTop: 4,
                            }}>
                              net debt exceeds enterprise value — equity wiped out
                            </div>
                          )}
                          {i < YEARS - 1 && (
                            <div style={{ height: 1, backgroundColor: 'rgba(0,255,136,0.05)', marginTop: 14 }} />
                          )}
                        </div>
                      ))}
                    </ScenarioShell>
                  )
                })}
              </div>

              <div style={{ marginTop: 14, backgroundColor: '#060E18', border, padding: '16px 18px' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  flexWrap: 'wrap', gap: 10, marginBottom: 14,
                }}>
                  <span style={{
                    fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88',
                    letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)',
                  }}>
                    PROJECTED PRICE BY YEAR
                  </span>
                  <div style={{ display: 'flex', gap: 14 }}>
                    {KEYS.map(sk => (
                      <span key={sk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%',
                          backgroundColor: SCENARIO_META[sk].color, display: 'inline-block',
                          boxShadow: `0 0 6px ${SCENARIO_META[sk].color}`,
                        }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#4DCC88' }}>
                          {SCENARIO_META[sk].label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <ProjectionChart
                  currentPrice={currentPrice}
                  series={KEYS.map(sk => ({
                    key: sk,
                    label: SCENARIO_META[sk].label,
                    color: SCENARIO_META[sk].color,
                    prices: pricesFor(sk),
                  }))}
                />
              </div>
            </>
          )}

          {/* -- Lynch fair value / PEG -------------------------------- */}
          {ready && model === 'lynch' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {KEYS.map(sk => {
                  const meta = SCENARIO_META[sk]
                  const g = num(lynchSc[sk])
                  const res = projectLynch(baseEps, g, num(lynchYield), currentPrice)
                  // PEG 1.0 is Lynch's anchor: below it the stock is
                  // cheap relative to its growth, above it expensive.
                  const pegColor = res.peg === null ? '#C8FFD4'
                    : res.peg < 1 ? '#00FF88'
                      : res.peg <= 1.5 ? '#FFD700' : '#FF3B3B'
                  return (
                    <ScenarioShell
                      key={sk}
                      sk={sk}
                      headerRight={<ReturnBadge value={totalReturn(res.fairValue, currentPrice)} />}
                    >
                      <NumberField
                        label="EPS GROWTH %" color={meta.color} value={lynchSc[sk]}
                        onChange={v => setLynchSc(prev => ({ ...prev, [sk]: v }))}
                      />

                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                        color: '#3C8F5F', margin: '10px 0 5px',
                        display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap',
                      }}>
                        <span>fair P/E {res.fairPe === null ? '—' : res.fairPe.toFixed(1)}</span>
                        <span>
                          actual P/E {currentPrice !== null && baseEps !== null && baseEps > 0
                            ? (currentPrice / baseEps).toFixed(1) : '—'}
                        </span>
                      </div>

                      <PriceRow label="FAIR VALUE" color={meta.color} value={money(res.fairValue)} />

                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          backgroundColor: '#03080F', border: `2px solid ${pegColor}44`, padding: '6px 9px',
                        }}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                            color: '#52A877', letterSpacing: '0.1em',
                          }}>
                            PEG
                          </span>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600,
                            color: pegColor, textShadow: `0 0 8px ${pegColor}80`,
                          }}>
                            {res.peg === null ? '—' : res.peg.toFixed(2)}
                          </span>
                        </div>
                        {res.verdict && (
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                            color: pegColor, marginTop: 5, textAlign: 'right',
                          }}>
                            {res.verdict}
                          </div>
                        )}
                      </div>

                      {res.warning && (
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          color: '#FF8A3D', marginTop: 8, lineHeight: 1.4,
                        }}>
                          {res.warning}
                        </div>
                      )}
                    </ScenarioShell>
                  )
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <Note>
                  {'// Lynch\'s rule: a fairly-priced company trades at a P/E equal to its growth rate, so PEG = 1.0 is fair value. This is the EPS × P/E model with the multiple no longer a free input — it is pinned to growth, which is why it takes only one assumption. The dividend-adjusted form above adds yield to growth, on Lynch\'s reasoning that total return includes the dividend; set yield to 0 for the classic version.'}
                </Note>
              </div>
              <div style={{ marginTop: 8 }}>
                <Note tone="warn">
                  {'// The rule is a heuristic for growth companies and misbehaves outside roughly 10–25% growth: at 3% it implies a fair P/E of 3, at 60% it implies 60. Values outside that band are still computed here rather than silently clamped the way most screeners do, but they carry a warning — read it before trusting the number.'}
                </Note>
              </div>
            </>
          )}

          {/* -- reverse DCF ------------------------------------------- */}
          {ready && model === 'reverse' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {KEYS.map(sk => {
                  const meta = SCENARIO_META[sk]
                  const exitPe = num(reverseSc[sk])
                  const g = impliedGrowth(currentPrice, baseEps, exitPe, YEARS)
                  const yourBase = num(epsSc.base[0].epsGrowth)
                  return (
                    <ScenarioShell key={sk} sk={sk}>
                      <NumberField
                        label="EXIT P/E" color={meta.color} min={0} value={reverseSc[sk]}
                        onChange={v => setReverseSc(prev => ({ ...prev, [sk]: v }))}
                      />
                      <div style={{ marginTop: 12 }}>
                        <PriceRow
                          label="IMPLIED EPS CAGR" color={meta.color}
                          value={g === null ? '—' : `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`}
                        />
                      </div>
                      {g !== null && yourBase !== null && (
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                          color: g > yourBase ? '#FF8A3D' : '#00FF88', marginTop: 8, lineHeight: 1.4,
                        }}>
                          {g > yourBase
                            ? `market expects MORE than your ${yourBase}% base case`
                            : `market expects LESS than your ${yourBase}% base case`}
                        </div>
                      )}
                    </ScenarioShell>
                  )
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <Note>
                  {`// Solves ${activeModel.formula.replace('solve: ', '')} — price is the INPUT here, not the output. At ${money(currentPrice)} on ${money(baseEps)} EPS over ${YEARS} years, each exit multiple implies the EPS growth rate above. Judge whether that growth is achievable; the model has no opinion on that.`}
                </Note>
              </div>
              {baseEps !== null && baseEps <= 0 && (
                <div style={{ marginTop: 8 }}>
                  <Note tone="warn">
                    {'// EPS is zero or negative, so there is no implied growth rate to solve for — the model returns nothing rather than an imaginary root.'}
                  </Note>
                </div>
              )}
            </>
          )}

          {/* -- Gordon growth ----------------------------------------- */}
          {ready && model === 'gordon' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {KEYS.map(sk => {
                  const meta = SCENARIO_META[sk]
                  const g = num(gordonSc[sk].g)
                  const r = num(gordonSc[sk].r)
                  const res = projectGordon(dividend, g, r)
                  const sens = gordonSensitivity(dividend, g, r)
                  return (
                    <ScenarioShell
                      key={sk}
                      sk={sk}
                      headerRight={<ReturnBadge value={totalReturn(res.price, currentPrice)} />}
                    >
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                        <NumberField
                          label="DIV GROWTH %" color={meta.color} step={0.5} value={gordonSc[sk].g}
                          onChange={v => setGordonSc(prev => ({ ...prev, [sk]: { ...prev[sk], g: v } }))}
                        />
                        <NumberField
                          label="REQUIRED RET %" color={meta.color} step={0.5} value={gordonSc[sk].r}
                          onChange={v => setGordonSc(prev => ({ ...prev, [sk]: { ...prev[sk], r: v } }))}
                        />
                      </div>

                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                        color: '#3C8F5F', marginBottom: 5,
                      }}>
                        D₁ {money(res.d1)}{g !== null && r !== null ? ` · spread ${(r - g).toFixed(1)}pp` : ''}
                      </div>

                      <PriceRow label="INTRINSIC VALUE" color={meta.color} value={money(res.price)} />

                      {res.warning && (
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          color: '#FF8A3D', marginTop: 6, lineHeight: 1.4,
                        }}>
                          {res.warning}
                        </div>
                      )}

                      {/* The instability IS the finding -- showing the
                          swing across a 4pp band communicates it far
                          better than a caveat sentence would. */}
                      {sens.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,255,136,0.08)' }}>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                            color: '#52A877', letterSpacing: '0.1em', marginBottom: 6,
                          }}>
                            SENSITIVITY TO g
                          </div>
                          {sens.map(row => (
                            <div key={row.growth} style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                              color: row.growth === g ? '#C8FFD4' : '#4DCC88', marginBottom: 3,
                            }}>
                              <span>g = {row.growth.toFixed(1)}%</span>
                              <span>{row.price === null ? 'unstable' : money(row.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScenarioShell>
                  )
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <Note tone="warn">
                  {'// Gordon growth is the one model here that is NOT well-behaved: as growth approaches the required return the denominator approaches zero and the value approaches infinity. Inputs within 1pp of that boundary are refused rather than printed. Read the sensitivity column before trusting any single number.'}
                </Note>
              </div>
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <Note>
              {'// Live figures from yfinance, every one overridable above · EPS compounds from the base you set · all projections are estimates, not forecasts'}
            </Note>
          </div>
        </>
      )}
    </div>
  )
}

/** One editable live-input chip in the header strip. */
function Seed({ label, value, onChange, width, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  width: number
  hint?: string
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877' }}>
        {label}:
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width, backgroundColor: '#03080F', border: '1px solid rgba(0,255,136,0.15)',
          padding: '3px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
          color: '#00FF88', outline: 'none',
        }}
      />
      {hint && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#3C8F5F' }}>
          {hint}
        </span>
      )}
    </span>
  )
}
