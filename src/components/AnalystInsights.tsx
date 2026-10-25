// Wall Street coverage for one ticker: price-target range vs. today's
// price, the buy/hold/sell mix over recent months, and the latest rating
// changes. Fetched separately from the main stock payload (it's a slower,
// optional call) so the rest of STOCK INFO never waits on it.

import { useEffect, useState } from 'react'
import { fetchAnalystInsights, type AnalystInsights as Data, type RecommendationPeriod } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import { C, FONT, border, goldA } from '@/lib/theme'
import { WhenExpanded, HistoryTileChart } from './TileChart'

const REC_COLORS: { key: keyof Omit<RecommendationPeriod, 'period' | 'total'>; label: string; color: string }[] = [
  { key: 'strong_buy', label: 'STRONG BUY', color: '#1FAE63' },
  { key: 'buy', label: 'BUY', color: '#3DDC84' },
  { key: 'hold', label: 'HOLD', color: '#F2C94C' },
  { key: 'sell', label: 'SELL', color: '#FF8A3D' },
  { key: 'strong_sell', label: 'STRONG SELL', color: '#FF4D4D' },
]

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `$${v.toFixed(2)}`

function periodLabel(p: string) {
  const m = /^(-?\d+)m$/.exec(p)
  if (!m) return p
  const n = Number(m[1])
  if (n === 0) return 'THIS MO'
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
}

function TargetRange({ t, ticker }: { t: NonNullable<Data['price_targets']>; ticker: string }) {
  const { low, high, mean, median, current } = t
  if (low === null || high === null || high <= low) return null
  const lo = Math.min(low, current ?? low)
  const hi = Math.max(high, current ?? high)
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  const upside = mean !== null && current ? ((mean - current) / current) * 100 : null
  return (
    <div style={{ backgroundColor: C.card, border, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em' }}>12-MO PRICE TARGET</span>
        {upside !== null && (
          <span style={{ fontFamily: FONT.mono, fontSize: 14, color: upside >= 0 ? C.up : C.down }}>
            {upside >= 0 ? '▲' : '▼'} {Math.abs(upside).toFixed(1)}% to mean
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height: 8, background: goldA(0.08), margin: '18px 4px 26px' }}>
        <div style={{
          position: 'absolute', left: pos(low), width: `calc(${pos(high)} - ${pos(low)})`, height: '100%',
          background: `linear-gradient(90deg, ${goldA(0.25)}, ${goldA(0.6)})`,
        }} />
        {mean !== null && <Marker at={pos(mean)} label={`MEAN ${money(mean)}`} color={C.gold} above />}
        {median !== null && median !== mean && <Marker at={pos(median)} label="" color={C.goldBright} />}
        {current !== null && <Marker at={pos(current)} label={`NOW ${money(current)}`} color={C.number} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 13 }}>
        <span style={{ color: C.textSoft }}>LOW <span style={{ color: C.number }}>{money(low)}</span></span>
        <span style={{ color: C.textSoft }}>HIGH <span style={{ color: C.number }}>{money(high)}</span></span>
      </div>
      <WhenExpanded>
        <HistoryTileChart kind="stock" id={ticker} title={`${ticker} price vs. targets`} note={`// analyst 12-mo targets: low ${money(low)} · mean ${money(mean)} · high ${money(high)}`} />
      </WhenExpanded>
    </div>
  )
}

function Marker({ at, label, color, above }: { at: string; label: string; color: string; above?: boolean }) {
  return (
    <div style={{ position: 'absolute', left: at, top: '50%', transform: 'translate(-50%, -50%)' }}>
      <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: color, border: `1px solid ${C.bg}` }} />
      {label && (
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          [above ? 'bottom' : 'top']: 14, whiteSpace: 'nowrap',
          fontFamily: FONT.mono, fontSize: 11, color,
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

function RecBars({ periods }: { periods: RecommendationPeriod[] }) {
  const shown = [...periods].reverse().slice(-4)
  return (
    <div style={{ backgroundColor: C.card, border, padding: '14px 16px' }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em', marginBottom: 12 }}>
        RECOMMENDATION MIX
      </div>
      {shown.map(p => (
        <div key={p.period} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 34px', gap: 10, alignItems: 'center', marginBottom: 7 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.textSoft }}>{periodLabel(p.period)}</span>
          <div style={{ display: 'flex', height: 12, gap: 1 }}>
            {p.total > 0 && REC_COLORS.map(rc => (
              p[rc.key] > 0 ? (
                <div key={rc.key} title={`${rc.label}: ${p[rc.key]}`}
                  style={{ width: `${(p[rc.key] / p.total) * 100}%`, background: rc.color, opacity: 0.85 }} />
              ) : null
            ))}
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.number, textAlign: 'right' }}>{p.total}</span>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {REC_COLORS.map(rc => (
          <span key={rc.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT.mono, fontSize: 10, color: C.muted }}>
            <span style={{ width: 8, height: 8, background: rc.color }} />{rc.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AnalystInsights({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setErr(null)
    fetchAnalystInsights(ticker)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setErr(e.message) })
    return () => { cancelled = true }
  }, [ticker])

  const note = (text: string) => (
    <div style={{ backgroundColor: C.card, border, padding: '14px 16px', fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>
      {text}
    </div>
  )

  if (err) return note(`// analyst data unavailable: ${err}`)
  if (!data) return note('// loading analyst coverage…')
  const hasAny = data.price_targets || (data.recommendations && data.recommendations.length) || (data.latest_ratings && data.latest_ratings.length)
  if (!hasAny) return note('// no analyst coverage for this ticker')

  return (
    <div>
      {(data.recommendation || data.num_analysts) && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap' }}>
          {data.recommendation && (
            <span style={{ fontFamily: FONT.terminal, fontSize: 18, color: C.gold, letterSpacing: '0.08em' }}>
              CONSENSUS: {data.recommendation.replace(/_/g, ' ').toUpperCase()}
            </span>
          )}
          {data.num_analysts !== null && (
            <span style={{ fontFamily: FONT.mono, fontSize: 13, color: C.muted }}>{data.num_analysts} analysts</span>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 8 }}>
        {data.price_targets && <TargetRange t={data.price_targets} ticker={ticker} />}
        {data.recommendations && data.recommendations.length > 0 && <RecBars periods={data.recommendations} />}
      </div>

      {data.latest_ratings && data.latest_ratings.length > 0 && (
        <div style={{ backgroundColor: C.card, border, padding: '12px 16px', marginTop: 8 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: '0.12em', marginBottom: 8 }}>
            LATEST RATING CHANGES
          </div>
          {data.latest_ratings.slice(0, 8).map((r, i) => (
            <div key={`${r.date}-${r.firm}-${i}`} style={{
              display: 'grid', gridTemplateColumns: '96px minmax(120px, 1fr) 110px 1fr', gap: 10,
              fontFamily: FONT.mono, fontSize: 13, padding: '5px 0',
              borderTop: i ? `1px solid ${goldA(0.06)}` : 'none',
            }}>
              <span style={{ color: C.muted }}>{fmtDate(r.date)}</span>
              <span style={{ color: C.number }}>{r.firm ?? '—'}</span>
              <span style={{ color: C.textSoft, textTransform: 'uppercase' }}>{r.action ?? ''}</span>
              <span style={{ color: C.textSoft }}>
                {r.from_grade ? `${r.from_grade} → ` : ''}<span style={{ color: C.gold }}>{r.to_grade ?? '—'}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
