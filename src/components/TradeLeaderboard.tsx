import { useEffect, useMemo, useState } from 'react'
import { fetchTradeLeaderboard, type LeaderboardRow, type TradeLeaderboard as LeaderboardData } from '@/lib/api'
import { C, FONT, goldA } from '@/lib/theme'
import { COMPARE_MAX, setTradeCountry, toggleCompare, useTradeNav } from '@/lib/tradeNav'
import { Loading, ErrorBlock } from './StatusBlock'
import Delta from './Delta'
import { EmptyNote, Kpi, PageHeader, Panel, PanelTitle, SourceNote, Toggle, money, pct, selectStyle } from './TradeUI'

// TRADE › LEADERBOARD — every economy ranked by merchandise trade, from the
// World Bank's WTO-sourced series (one request per indicator covers ~200
// economies). Click a country to open its product profile on COUNTRY; tick
// ⇄ to add it to COMPARE.

type RankBy = 'total' | 'exports' | 'imports' | 'balance'
type Navigate = (tab: 'trade' | 'tradeCompare') => void

const MONO = FONT.mono
const TECH = FONT.terminal
const RANK_LABEL: Record<RankBy, string> = {
  total: 'TOTAL TRADE', exports: 'EXPORTS', imports: 'IMPORTS', balance: 'TRADE SURPLUS',
}

export default function TradeLeaderboard({ onNavigate }: { onNavigate?: Navigate }) {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [rankBy, setRankBy] = useState<RankBy>('total')
  const [region, setRegion] = useState('')
  const [limit, setLimit] = useState(25)
  const [reload, setReload] = useState(0)
  const { compare } = useTradeNav()

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    fetchTradeLeaderboard(year)
      .then(d => !cancelled && setData(d))
      .catch(e => !cancelled && setError(e.message))
    return () => { cancelled = true }
  }, [year, reload])

  // Rank across ALL economies by the chosen measure; the region filter only
  // hides rows, so a country keeps its world rank.
  const ranked = useMemo(() => {
    if (!data) return []
    const key = (r: LeaderboardRow) => r[rankBy]
    return [...data.countries].sort((a, b) => key(b) - key(a)).map((r, i) => ({ ...r, pos: i + 1 }))
  }, [data, rankBy])

  const visible = ranked.filter(r => !region || r.region === region)
  const shown = visible.slice(0, limit)
  const maxVal = Math.max(1, ...shown.map(r => Math.abs(r[rankBy])))

  const open = (r: LeaderboardRow) => {
    if (!r.has_profile) return
    setTradeCountry(r.iso3)
    onNavigate?.('trade')
  }

  const top10Share = data ? ranked.slice(0, 10).reduce((n, r) => n + (r.world_share ?? 0), 0) : null
  const surplus = data ? [...data.countries].sort((a, b) => b.balance - a.balance)[0] : null
  const deficit = data ? [...data.countries].sort((a, b) => a.balance - b.balance)[0] : null
  const leader = ranked[0]

  const cols = '46px minmax(170px,1.6fr) 1fr 1fr 1fr 1.05fr minmax(120px,1.2fr) 0.8fr 36px'

  return (
    <div>
      <PageHeader
        title="LEADERBOARD"
        subtitle={<>THE WORLD&apos;S BIGGEST TRADERS{data ? ` · ${data.year}` : ''}</>}
        right={<>
          <Toggle value={rankBy} onChange={setRankBy} options={[
            { value: 'total', label: 'TOTAL' }, { value: 'exports', label: 'EXPORTS' },
            { value: 'imports', label: 'IMPORTS' }, { value: 'balance', label: 'SURPLUS' },
          ]} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={selectStyle} aria-label="Region">
            <option value="">ALL REGIONS</option>
            {data?.regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={year ?? ''} onChange={e => setYear(e.target.value ? Number(e.target.value) : null)} style={selectStyle} aria-label="Year">
            <option value="">LATEST</option>
            {data?.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </>}
      />

      {error && <ErrorBlock message={error} onRetry={() => setReload(r => r + 1)} />}
      {!error && !data && <Loading label="RANKING THE WORLD'S TRADERS" />}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 14 }}>
            <Kpi label="WORLD MERCHANDISE TRADE" value={money(data.world_total)} sub={`${data.year} · exports + imports`} />
            <Kpi label="#1 TRADER" value={leader ? `${leader.flag ?? ''} ${leader.iso3}`.trim() : '—'} sub={leader ? `${leader.name} · ${pct(leader.world_share)} of world` : undefined} />
            <Kpi label="TOP 10 SHARE" value={pct(top10Share)} sub="of world trade" />
            <Kpi label="BIGGEST SURPLUS" value={surplus ? `${surplus.flag ?? ''} ${surplus.iso3}`.trim() : '—'} sub={surplus ? money(surplus.balance) : undefined} />
            <Kpi label="BIGGEST DEFICIT" value={deficit ? `${deficit.flag ?? ''} ${deficit.iso3}`.trim() : '—'} sub={deficit ? money(Math.abs(deficit.balance)) : undefined} />
          </div>

          <Panel>
            <PanelTitle right={
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>
                {visible.length} ECONOMIES · ⇄ {compare.length}/{COMPARE_MAX} IN COMPARE
                {compare.length > 0 && onNavigate && (
                  <button onClick={() => onNavigate('tradeCompare')} style={{
                    marginLeft: 10, fontFamily: TECH, fontSize: 11, color: C.gold, background: 'transparent',
                    border: `1px solid ${goldA(0.3)}`, padding: '3px 8px', cursor: 'pointer', letterSpacing: '0.06em',
                  }}>OPEN COMPARE ▸</button>
                )}
              </span>
            }>
              {'// RANKED BY '}{RANK_LABEL[rankBy]}{region ? ` · ${region.toUpperCase()}` : ''}
            </PanelTitle>

            {shown.length === 0 && <EmptyNote>No economies reported for this selection.</EmptyNote>}
            {shown.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 900 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 6px 6px' }}>
                    {['RANK', 'ECONOMY', 'TOTAL', 'EXPORTS', 'IMPORTS', 'BALANCE', 'SHARE OF WORLD', 'YOY', '⇄'].map(h => (
                      <div key={h} style={{ fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: '0.1em', textAlign: h === '⇄' ? 'center' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {shown.map(r => {
                    const inCompare = compare.includes(r.iso3)
                    const barVal = Math.abs(r[rankBy])
                    return (
                      <div key={r.iso3}
                        onClick={() => open(r)}
                        title={r.has_profile ? `Open ${r.name} on the COUNTRY tab` : 'Product detail not available for this economy yet'}
                        style={{
                          display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '7px 6px',
                          borderTop: `1px solid ${goldA(0.06)}`, cursor: r.has_profile ? 'pointer' : 'default',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = goldA(0.04))}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: r.pos <= 3 ? C.gold : C.number, fontWeight: r.pos <= 3 ? 600 : 400 }}>{r.pos}</span>
                          {rankBy === 'total' && r.rank_change !== null && r.rank_change !== 0 && (
                            <span title={`Rank change vs ${data.year - 1}`}><Delta value={r.rank_change} format={v => String(v)} size={9} /></span>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: TECH, fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.flag && <span style={{ marginRight: 6 }}>{r.flag}</span>}{r.name}
                            {r.has_profile && <span style={{ color: C.dim, fontSize: 10, marginLeft: 6 }}>▸</span>}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.region}</div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.number, fontWeight: rankBy === 'total' ? 600 : 400 }}>{money(r.total)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.number, fontWeight: rankBy === 'exports' ? 600 : 400 }}>{money(r.exports)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.number, fontWeight: rankBy === 'imports' ? 600 : 400 }}>{money(r.imports)}</div>
                        <div><Delta value={r.balance} format={money} size={12} weight={rankBy === 'balance' ? 600 : 400} /></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, backgroundColor: goldA(0.06) }}>
                            <div style={{ width: `${(barVal / maxVal) * 100}%`, height: '100%', backgroundColor: C.gold, opacity: 0.85, borderRadius: '0 2px 2px 0' }} />
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSoft, width: 44, textAlign: 'right' }}>{pct(r.world_share, 2)}</span>
                        </div>
                        <div><Delta value={r.growth} format={v => `${v.toFixed(1)}%`} size={11} /></div>
                        <div style={{ textAlign: 'center' }}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleCompare(r.iso3) }}
                            disabled={!inCompare && compare.length >= COMPARE_MAX}
                            aria-pressed={inCompare}
                            title={inCompare ? 'Remove from COMPARE' : compare.length >= COMPARE_MAX ? `COMPARE holds up to ${COMPARE_MAX}` : 'Add to COMPARE'}
                            style={{
                              width: 24, height: 22, fontFamily: TECH, fontSize: 12, cursor: 'pointer',
                              color: inCompare ? C.bg : C.muted, background: inCompare ? C.gold : 'transparent',
                              border: `1px solid ${inCompare ? C.gold : goldA(0.25)}`,
                              opacity: !inCompare && compare.length >= COMPARE_MAX ? 0.35 : 1,
                            }}>⇄</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {visible.length > limit && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button onClick={() => setLimit(l => l + 50)} style={{ ...selectStyle, fontSize: 11, color: C.gold }}>
                  SHOW MORE ({visible.length - limit} LEFT)
                </button>
              </div>
            )}
            <SourceNote>
              {data.source} · {data.note} · bar = {RANK_LABEL[rankBy].toLowerCase()} relative to the top row · YOY = change in total trade vs {data.year - 1} · ▸ = product detail available on COUNTRY
            </SourceNote>
          </Panel>
        </>
      )}
    </div>
  )
}
