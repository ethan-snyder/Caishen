// ECONOMICS tab: headline macro indicators (FRED), the upcoming economic
// release calendar, and the Federal Reserve's own publication feeds.
// The three parts come from one /api/econ payload but degrade
// independently -- e.g. no FRED_API_KEY blanks the calendar, not the page.

import { useEffect, useMemo, useState } from 'react'
import { fetchEcon, type EconData, type EconIndicator, type EconRelease } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { C, FONT, border, goldA, purpleA } from '@/lib/theme'
import { Loading, ErrorBlock } from './StatusBlock'
import { LineChart } from './TrackingKit'
import { useInExpandedTile } from './TileChart'

function SectionHead({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 10px',
      fontFamily: FONT.display, fontSize: 15, fontWeight: 600, color: C.gold,
      letterSpacing: '0.2em', textShadow: '0 0 10px rgba(212,175,55,0.35)',
    }}>
      <span style={{ color: C.purpleBright, fontSize: 11 }}>◆</span>
      {children}
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,175,55,0.3), transparent)' }} />
      {right}
    </div>
  )
}

function fmtValue(v: number | null, unit: string) {
  if (v === null) return '—'
  const abs = Math.abs(v)
  const d = abs >= 100 ? 1 : 2
  return `${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`
}

/** Green when the move is good news, red when bad, neutral otherwise. */
function changeColor(ind: EconIndicator) {
  if (ind.change === null || ind.change === 0 || ind.direction === 'neutral') return C.textSoft
  const rising = ind.change > 0
  const good = ind.direction === 'up_good' ? rising : !rising
  return good ? C.up : C.down
}

function Sparkline({ points, color }: { points: { value: number }[]; color: string }) {
  if (points.length < 2) return null
  const w = 200, h = 40
  const vals = points.map(p => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const d = points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p.value - min) / span) * h).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.4} opacity={0.85} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const TRANSFORM_NOTE: Record<EconIndicator['transform'], string> = {
  level: '',
  yoy: 'YoY',
  mom_change: 'chg',
}

function IndicatorTile({ ind }: { ind: EconIndicator }) {
  const cc = changeColor(ind)
  const [ref, expanded] = useInExpandedTile<HTMLDivElement>()
  const arrow = ind.change === null || ind.change === 0 ? '' : ind.change > 0 ? '▲' : '▼'
  return (
    <div style={{ backgroundColor: C.card, border, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: FONT.terminal, fontSize: 15, color: C.text }}>{ind.label}</span>
        {TRANSFORM_NOTE[ind.transform] && (
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: C.muted, border: `1px solid ${goldA(0.15)}`, padding: '0 4px' }}>
            {TRANSFORM_NOTE[ind.transform]}
          </span>
        )}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted }}>{ind.sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
        <span style={{
          fontFamily: FONT.mono, fontSize: 24, fontWeight: 600, color: C.number,
          textShadow: '0 0 8px rgba(255,255,255,0.22)',
        }}>
          {fmtValue(ind.value, ind.unit)}
        </span>
        {ind.change !== null && (
          <span style={{ fontFamily: FONT.mono, fontSize: 13, color: cc }}>
            {arrow} {fmtValue(Math.abs(ind.change), ind.unit === '%' ? 'pp' : ind.unit)}
          </span>
        )}
      </div>
      {/* Collapsed: sparkline. Expanded (tile clicked): the same series as
          a full chart -- axis, gridlines, hover readout, dated x-axis. */}
      <div ref={ref}>
        {expanded
          ? (
            <div style={{ marginTop: 8 }}>
              <LineChart
                points={ind.history}
                formatValue={v => fmtValue(v, ind.unit)}
                height={260}
                detailed
              />
            </div>
          )
          : <Sparkline points={ind.history} color={cc === C.textSoft ? C.gold : cc} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 11, color: C.dim }}>
        <span>{fmtDate(ind.date)}</span>
        <span>{ind.source} · {ind.series_id}</span>
      </div>
    </div>
  )
}

function fmtDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return fmtDate(d)
}

function Calendar({ releases }: { releases: EconRelease[] }) {
  const [showPast, setShowPast] = useState(false)
  const list = releases.filter(r => showPast || !r.is_past)
  // Group by day so a busy morning reads as one block.
  const days = useMemo(() => {
    const m = new Map<string, EconRelease[]>()
    for (const r of list) {
      const k = r.date.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.entries()]
  }, [list])

  return (
    <div style={{ backgroundColor: C.card, border, padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          type="button" onClick={() => setShowPast(p => !p)}
          style={{
            fontFamily: FONT.terminal, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em',
            color: showPast ? C.gold : C.muted, background: showPast ? purpleA(0.35) : 'transparent',
            border: `1px solid ${goldA(0.2)}`, padding: '2px 9px',
          }}
        >
          {showPast ? 'HIDE PAST' : 'SHOW PAST'}
        </button>
      </div>
      {days.length === 0 && (
        <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>{'// no releases in this window'}</div>
      )}
      {days.map(([day, rs]) => (
        <div key={day} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, padding: '7px 0', borderTop: `1px solid ${goldA(0.06)}` }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 13, color: rs[0].is_past ? C.dim : C.gold }}>{fmtDay(day)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {rs.map(r => (
              <span key={`${r.release_id}-${r.name}`} style={{ fontFamily: FONT.mono, fontSize: 13, color: r.is_past ? C.muted : C.number }}>
                {r.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Economics() {
  const [data, setData] = useState<EconData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<string>('ALL')

  const load = () => {
    setError(null)
    setData(null)
    fetchEcon().then(setData).catch(e => setError(e.message))
  }
  useEffect(load, [])

  const shown = (data?.indicators ?? []).filter(i => group === 'ALL' || i.group === group)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <span style={{
          fontFamily: FONT.display, fontSize: 26, fontWeight: 600, color: C.text,
          letterSpacing: '0.12em', textShadow: '0 0 10px rgba(212,175,55,0.35)',
        }}>
          ECONOMICS
        </span>
        {data && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['ALL', ...data.groups].map(g => (
              <button key={g} type="button" onClick={() => setGroup(g)} style={{
                fontFamily: FONT.terminal, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer',
                color: group === g ? C.gold : C.muted,
                background: group === g ? purpleA(0.35) : 'transparent',
                border: `1px solid ${group === g ? goldA(0.35) : goldA(0.1)}`, padding: '4px 10px',
              }}>
                {g.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !data && <Loading label="PULLING MACRO INDICATORS" />}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 8 }}>
            {shown.map(ind => <IndicatorTile key={ind.key} ind={ind} />)}
          </div>
          {data.indicators.length === 0 && (
            <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>
              {'// no indicators came back — FRED_API_KEY may be unset (see backend/.env)'}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
            <div>
              <SectionHead>RELEASE CALENDAR</SectionHead>
              {data.calendar_error
                ? (
                  <div style={{ backgroundColor: C.card, border, padding: '14px 16px', fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>
                    {`// calendar unavailable: ${data.calendar_error}`}
                  </div>
                )
                : <Calendar releases={data.calendar} />}
            </div>

            <div>
              <SectionHead>FEDERAL RESERVE</SectionHead>
              <div style={{ backgroundColor: C.card, border, padding: '6px 16px' }}>
                {data.fed.length === 0 && (
                  <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted, padding: '8px 0' }}>{'// Fed feeds unavailable right now'}</div>
                )}
                {data.fed.slice(0, 14).map((p, i) => (
                  <div key={`${p.feed}-${i}`} style={{ padding: '9px 0', borderTop: i ? `1px solid ${goldA(0.06)}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.purpleSoft, letterSpacing: '0.08em' }}>
                        {p.feed_label.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.dim }}>
                        {p.published ? fmtDay(p.published) : ''}
                      </span>
                    </div>
                    {p.link ? (
                      <a href={p.link} target="_blank" rel="noreferrer" style={{ fontFamily: FONT.mono, fontSize: 13, color: C.number, textDecoration: 'none' }}>
                        {p.title}
                      </a>
                    ) : (
                      <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.number }}>{p.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(212,175,55,0.02)', border: '1px solid rgba(155,89,182,0.5)', fontFamily: FONT.mono, fontSize: 12, color: C.dim }}>
            {`// DATA: FRED (St. Louis Fed) indicators + release calendar · federalreserve.gov RSS · as of ${fmtDate(data.as_of, true)}`}
          </div>
        </>
      )}
    </div>
  )
}
