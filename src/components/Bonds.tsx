import { useEffect, useState } from 'react'
import { fetchBonds, type BondYield } from '@/lib/api'
import { Loading, ErrorBlock } from './StatusBlock'
import { useSortableLayout } from '@/lib/layout'
import { Draggable, AddWidgetTray, EditHint } from './LayoutKit'

const border = '1px solid rgba(0,255,136,0.12)'

const BOND_SECTIONS = [
  { id: 'curve', label: 'US TREASURY YIELD CURVE' },
  { id: 'corporate', label: 'CORPORATE BONDS' },
]

export default function Bonds() {
  const [yields, setYields] = useState<BondYield[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    setYields(null)
    fetchBonds().then(setYields).catch(e => setError(e.message))
  }

  useEffect(load, [])

  const available = yields?.filter(t => t.yield !== null) ?? []
  const maxYield = available.length ? Math.max(...available.map(t => t.yield as number)) : 1

  const sections = useSortableLayout('bonds.sections', BOND_SECTIONS)

  return (
    <div>
      <span style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: '#C8FFD4', letterSpacing: '0.04em', textShadow: '0 0 10px rgba(200,255,212,0.3)', display: 'block', marginBottom: 20 }}>
        BONDS {'&'} FIXED INCOME
      </span>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {!error && !yields && <Loading label="PULLING TREASURY YIELDS" />}

      {yields && <EditHint />}

      {yields && sections.visible.map(sectionId => {
        if (sectionId === 'curve') return (
          <Draggable key="curve" id="curve" label="US TREASURY YIELD CURVE" api={sections} variant="section">
        <div style={{ backgroundColor: '#060E18', border, padding: '18px' }}>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#00FF88', letterSpacing: '0.1em', textShadow: '0 0 6px rgba(0,255,136,0.4)', marginBottom: 14 }}>
            {'/// US TREASURY YIELD CURVE'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${yields.length}, 1fr)`, gap: 6, alignItems: 'end', height: 100, marginBottom: 10 }}>
            {yields.map(t => (
              <div key={t.term} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#00FF88', textShadow: '0 0 4px #00FF88' }}>
                  {t.yield !== null ? t.yield.toFixed(2) : '—'}
                </div>
                <div style={{
                  width: '100%',
                  height: t.yield !== null ? `${(t.yield / maxYield) * 64}px` : '2px',
                  backgroundColor: 'rgba(0,255,136,0.15)',
                  border: '1px solid rgba(0,255,136,0.3)',
                  boxShadow: 'inset 0 0 6px rgba(0,255,136,0.1)',
                  position: 'relative',
                }}>
                  {t.yield !== null && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${(t.yield / maxYield) * 64}px`,
                      background: 'linear-gradient(0deg, rgba(0,255,136,0.25), transparent)',
                    }} />
                  )}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.06em' }}>{t.term}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: t.change !== null && t.change >= 0 ? '#00FF88' : '#FF3B3B' }}>
                  {t.change !== null ? `${t.change >= 0 ? '+' : ''}${t.change.toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30' }}>
            {'// U.S. Treasury curve only -- 13-week, 5-year, 10-year, 30-year are the tenors with reliable free data (yfinance). '}
            {'Other maturities and other countries\u2019 sovereign yields aren\u2019t consistently available for free, so they\u2019re left out rather than estimated.'}
          </div>
        </div>
          </Draggable>
        )

        if (sectionId === 'corporate') return (
          <Draggable key="corporate" id="corporate" label="CORPORATE BONDS" api={sections} variant="section">
      <div style={{ marginTop: 14, padding: '18px', backgroundColor: '#060E18', border, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#2D6644' }}>
        {'/// CORPORATE BONDS'}
        <div style={{ marginTop: 8, color: '#1D4A30' }}>
          {'No free, reliable data source for individual corporate bond quotes was found -- rather than show fabricated bonds/yields, this section is left out. Open to wiring a real source if one turns up.'}
        </div>
      </div>
          </Draggable>
        )

        return null
      })}

      {yields && <AddWidgetTray api={sections} title="HIDDEN SECTIONS" />}

      <div style={{ marginTop: 12, padding: '9px 12px', backgroundColor: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.07)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#1D4A30' }}>
        {'// DATA SOURCE: yfinance (Treasury yield tickers)'}
      </div>
    </div>
  )
}
