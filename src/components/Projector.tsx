import { useState, type MouseEvent } from 'react'
import { fetchStockQuote, type StockQuote } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import { AxisLabels, GridLines } from './ChartGrid'

type ScenarioKey = 'bear' | 'base' | 'bull'
interface YearAssumptions { epsGrowth: string; pe: string }
interface Scenario {
  label: string; color: string; bgOpacity: string
  years: [YearAssumptions, YearAssumptions, YearAssumptions]
}

const DEFAULT_SCENARIOS: Record<ScenarioKey, Scenario> = {
  bear: {
    label: 'BEAR', color: '#FF3B3B', bgOpacity: 'rgba(255,59,59,0.05)',
    years: [{ epsGrowth: '3', pe: '24' }, { epsGrowth: '2', pe: '22' }, { epsGrowth: '2', pe: '20' }],
  },
  base: {
    label: 'BASE', color: '#FFD700', bgOpacity: 'rgba(255,215,0,0.05)',
    years: [{ epsGrowth: '9', pe: '30' }, { epsGrowth: '10', pe: '30' }, { epsGrowth: '11', pe: '31' }],
  },
  bull: {
    label: 'BULL', color: '#00FF88', bgOpacity: 'rgba(0,255,136,0.05)',
    years: [{ epsGrowth: '15', pe: '36' }, { epsGrowth: '16', pe: '38' }, { epsGrowth: '18', pe: '40' }],
  },
}

const CURRENT_YEAR = new Date().getFullYear()
const border = '1px solid rgba(0,255,136,0.12)'

function computePrices(sc: Scenario, baseEps: number): number[] {
  let eps = baseEps
  return sc.years.map(y => {
    eps = eps * (1 + parseFloat(y.epsGrowth) / 100)
    const p = eps * parseFloat(y.pe)
    return isNaN(p) ? 0 : p
  })
}

// ----------------------------------------------------------------------
// Number field with terminal-style steppers
// ----------------------------------------------------------------------

/**
 * A number input with stacked triangle steppers instead of the browser's
 * native spinner.
 *
 * The native control is hidden (see .proj-num in index.css) rather than
 * left visible alongside these: it renders as a grey OS widget that ignores
 * the app's palette entirely, only appears on hover in most browsers, and
 * has a hit target a few pixels tall. These are always visible, on-theme,
 * and large enough to actually hit.
 */
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
    // Rounded to kill floating-point dust (0.1 + 0.2 style) that would
    // otherwise creep into the field after a few clicks.
    onChange(String(Math.round(clamped * 100) / 100))
  }

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        color: '#52A877', letterSpacing: '0.1em', marginBottom: 4,
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
 * All three cases on one set of axes, plotted year by year.
 *
 * Today's price is included as the leftmost point (when known) rather than
 * starting at Year 1: the whole question this page answers is "where does
 * each case take me from here", and a chart that omits the starting point
 * makes the three lines look far more similar than they are.
 */
function ProjectionChart({ series, currentPrice, height = 230 }: {
  series: { key: string; label: string; color: string; prices: number[] }[]
  currentPrice: number | null
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const hasToday = currentPrice !== null && currentPrice > 0
  const xLabels = [
    ...(hasToday ? ['TODAY'] : []),
    ...[0, 1, 2].map(i => String(CURRENT_YEAR + i + 1)),
  ]
  const lines = series.map(s => ({
    ...s,
    values: hasToday ? [currentPrice as number, ...s.prices] : s.prices,
  }))

  const all = lines.flatMap(l => l.values).filter(v => Number.isFinite(v))
  if (!all.length) return null
  // A little headroom top and bottom so the extreme lines don't sit
  // flush against the frame.
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
            {/* Today's level carried across the whole chart, so it reads as
                the break-even line each case is measured against. */}
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
                points={l.values.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ')}
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

          {/* Point markers as CSS circles -- preserveAspectRatio="none"
              stretches x and y unevenly, so SVG <circle>s would render as
              ovals (the same reason every other chart here does this). */}
          {lines.flatMap(l =>
            l.values.map((v, i) => (
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
            )),
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
                  <span style={{ fontWeight: 600 }}>${l.values[hover].toFixed(2)}</span>
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

export default function Projector() {
  const [inputVal, setInputVal] = useState('AAPL')
  const [ticker, setTicker] = useState<string | null>(null)
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [manualEps, setManualEps] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState(DEFAULT_SCENARIOS)

  const load = (t: string) => {
    setTicker(t)
    setLoading(true)
    setError(null)
    setQuote(null)
    fetchStockQuote(t)
      .then(q => { setQuote(q); setManualEps(q.eps !== null ? String(q.eps) : '') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const update = (k: ScenarioKey, i: number, f: keyof YearAssumptions, v: string) => {
    setScenarios(prev => {
      const years = [...prev[k].years] as typeof prev[typeof k]['years']
      years[i] = { ...years[i], [f]: v }
      return { ...prev, [k]: { ...prev[k], years } }
    })
  }

  const keys: ScenarioKey[] = ['bear', 'base', 'bull']
  const baseEps = parseFloat(manualEps)
  const currentPrice = quote?.price ?? null
  const ready = quote !== null && !isNaN(baseEps)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4',
          letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)',
        }}>3-YEAR PRICE PROJECTOR</div>

        <form onSubmit={e => { e.preventDefault(); if (inputVal.trim()) load(inputVal.trim()) }} style={{ display: 'flex', gap: 8, maxWidth: 360, marginTop: 12 }}>
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
            fontSize: 15, fontWeight: 700, border: 'none', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.08em',
          }}>LOAD BASE</button>
        </form>

        {loading && <div style={{ marginTop: 12 }}><Loading label={`FETCHING ${ticker}`} /></div>}
        {error && <div style={{ marginTop: 12 }}><ErrorBlock message={error} onRetry={() => ticker && load(ticker)} /></div>}

        {quote && !loading && !error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877', marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span>CURRENT: <span style={{ color: '#C8FFD4' }}>{currentPrice !== null ? `$${currentPrice.toFixed(2)}` : '—'}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              BASE EPS (TTM):
              <input
                value={manualEps}
                onChange={e => setManualEps(e.target.value)}
                style={{
                  width: 80, backgroundColor: '#03080F', border: '1px solid rgba(0,255,136,0.15)',
                  padding: '3px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#00FF88',
                  outline: 'none',
                }}
              />
            </span>
            <span>MODEL: <span style={{ color: '#52A877' }}>PRICE = EPS × P/E</span></span>
          </div>
        )}
        {!quote && !loading && !error && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#52A877', marginTop: 12 }}>
            Load a ticker to seed the base EPS and current price for the projection.
          </div>
        )}
      </div>

      {ready && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {keys.map(key => {
              const sc = scenarios[key]
              const prices = computePrices(sc, baseEps)
              const ret3 = currentPrice ? ((prices[2] - currentPrice) / currentPrice) * 100 : 0

              return (
                <div key={key} style={{
                  backgroundColor: '#060E18',
                  // Was 1px at `22` alpha (13%), which read as almost no
                  // border at all -- the three cases ran together visually.
                  border: `2px solid ${sc.color}66`,
                  boxShadow: `0 0 14px ${sc.color}1A, inset 0 0 24px ${sc.color}0D`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', backgroundColor: sc.bgOpacity,
                    borderBottom: `2px solid ${sc.color}66`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: 22, color: sc.color, letterSpacing: '0.1em', textShadow: `0 0 8px ${sc.color}` }}>{sc.label} CASE</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: ret3 >= 0 ? '#00FF88' : '#FF3B3B' }}>
                      {ret3 >= 0 ? '+' : ''}{ret3.toFixed(0)}% / 3YR
                    </span>
                  </div>

                  <div style={{ padding: '14px' }}>
                    {([0, 1, 2] as const).map(i => (
                      <div key={i} style={{ marginBottom: i < 2 ? 14 : 0 }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.12em', marginBottom: 7 }}>
                          YEAR {i + 1} — {CURRENT_YEAR + i + 1}
                        </div>
                        <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                          {[
                            // P/E can't go negative; growth can (a
                            // contraction year is a legitimate assumption),
                            // so only the P/E field is floored at zero.
                            { label: 'EPS GRW %', field: 'epsGrowth' as const, min: undefined },
                            { label: 'EXIT P/E', field: 'pe' as const, min: 0 },
                          ].map(({ label, field, min }) => (
                            <NumberField
                              key={field}
                              label={label}
                              value={sc.years[i][field]}
                              color={sc.color}
                              min={min}
                              onChange={v => update(key, i, field, v)}
                            />
                          ))}
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          backgroundColor: '#03080F', border: `2px solid ${sc.color}44`, padding: '6px 9px',
                        }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#52A877', letterSpacing: '0.1em' }}>IMPLIED PRICE</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 600, color: sc.color, textShadow: `0 0 8px ${sc.color}80` }}>
                            ${prices[i].toFixed(2)}
                          </span>
                        </div>
                        {i < 2 && <div style={{ height: 1, backgroundColor: 'rgba(0,255,136,0.05)', marginTop: 14 }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* All three cases on one set of axes, year by year. */}
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
                {keys.map(k => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      backgroundColor: scenarios[k].color, display: 'inline-block',
                      boxShadow: `0 0 6px ${scenarios[k].color}`,
                    }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#4DCC88' }}>
                      {scenarios[k].label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <ProjectionChart
              currentPrice={currentPrice}
              series={keys.map(k => ({
                key: k,
                label: scenarios[k].label,
                color: scenarios[k].color,
                prices: computePrices(scenarios[k], baseEps),
              }))}
            />
          </div>

          {/* Summary */}
          <div style={{ marginTop: 14, backgroundColor: '#060E18', border, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88', letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)', marginBottom: 14 }}>
              YEAR 3 TARGETS
            </div>

            {keys.map(key => {
              const sc = scenarios[key]
              const prices = computePrices(sc, baseEps)
              const p3 = prices[2]
              const maxP = Math.max(...keys.map(k => computePrices(scenarios[k], baseEps)[2]))
              const ret = currentPrice ? ((p3 - currentPrice) / currentPrice) * 100 : 0

              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 }}>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 15, color: sc.color, width: 38, letterSpacing: '0.06em', textShadow: `0 0 6px ${sc.color}80` }}>{sc.label}</span>
                  <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(0,255,136,0.05)' }}>
                    <div style={{ width: `${maxP > 0 ? (p3 / maxP) * 100 : 0}%`, height: '100%', backgroundColor: sc.color, opacity: 0.7, boxShadow: `0 0 6px ${sc.color}`, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: sc.color, width: 74, textAlign: 'right' }}>${p3.toFixed(2)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: ret >= 0 ? '#00FF88' : '#FF3B3B', width: 68, textAlign: 'right' }}>
                    {ret >= 0 ? '+' : ''}{ret.toFixed(0)}%
                  </span>
                </div>
              )
            })}

            {currentPrice !== null && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,255,136,0.06)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#52A877' }}>TODAY:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#C8FFD4' }}>${currentPrice.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#3C8F5F' }}>
            {'// EPS compounds YoY from base TTM (editable above) · edit fields to recalculate live · all projections are estimates'}
          </div>
        </>
      )}
    </div>
  )
}
