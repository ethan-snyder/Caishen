import { useEffect, useMemo, useState } from 'react'
import StockInfo from './components/StockInfo'
import Projector from './components/Projector'
import MarketOverview from './components/MarketOverview'
import Crypto from './components/Crypto'
import Bonds from './components/Bonds'
import Forex from './components/Forex'
import Portfolio from './components/Portfolio'
import Watchlist from './components/Watchlist'
import Futures from './components/Futures'
import { LayoutProvider, useSortableLayout } from '@/lib/layout'
import { EditModeButton, Draggable, AddWidgetTray } from './components/LayoutKit'
import TickerTape from './components/TickerTape'
import { ErrorBoundary } from './components/ErrorBoundary'

type Tab = 'stock' | 'projector' | 'market' | 'crypto' | 'bonds' | 'forex' | 'portfolio' | 'watchlist' | 'futures'

const TABS: { id: Tab; label: string; icon: string; group: string }[] = [
  { id: 'stock',     label: 'STOCK INFO',    icon: '▸', group: 'ANALYSIS' },
  { id: 'projector', label: 'PROJECTOR',     icon: '▸', group: 'ANALYSIS' },
  { id: 'market',    label: 'MARKET',        icon: '▸', group: 'ANALYSIS' },
  { id: 'crypto',    label: 'CRYPTO',        icon: '▸', group: 'MARKETS' },
  { id: 'bonds',     label: 'BONDS',         icon: '▸', group: 'MARKETS' },
  { id: 'forex',     label: 'FOREX',         icon: '▸', group: 'MARKETS' },
  { id: 'futures',   label: 'FUTURES',       icon: '▸', group: 'MARKETS' },
  { id: 'portfolio', label: 'PORTFOLIO',     icon: '▸', group: 'TRACKING' },
  { id: 'watchlist', label: 'WATCHLIST',     icon: '▸', group: 'TRACKING' },
]

const G = 'rgba(0,255,136,'
const border = `1px solid ${G}0.12)`

const GROUPS = ['ANALYSIS', 'MARKETS', 'TRACKING']
// Hoisted so the identity is stable across renders -- useSortableLayout
// memoizes on this array, and rebuilding it inline every render would
// invalidate that memo on every keystroke elsewhere in the tree.
const GROUP_ITEMS = GROUPS.map(g => ({ id: g, label: g }))

export default function App() {
  return (
    <ErrorBoundary>
      <LayoutProvider>
        <AppShell />
      </LayoutProvider>
    </ErrorBoundary>
  )
}

const TAB_IDS = new Set<string>(TABS.map(t => t.id))
const ACTIVE_TAB_KEY = 'app.activeTab'

function AppShell() {
  // Persisted so the current page survives a reload. Without this, any
  // stray full-page navigation (a form submit that slips through, a
  // refresh, a crash-and-reload) silently dumped the user back on the
  // default STOCK INFO tab, which read as "the button took me home".
  const [active, setActive] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY)
      if (saved && TAB_IDS.has(saved)) return saved as Tab
    } catch { /* storage unavailable */ }
    return 'stock'
  })

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_TAB_KEY, active) } catch { /* storage unavailable */ }
  }, [active])

  const [time] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }))

  // One sortable scope per sidebar group. Keeping groups separate (rather
  // than one flat list) means a drag can't accidentally fling a tab into
  // an unrelated group, and each group's saved order stays independent.
  const groupOrder = useSortableLayout('app.groups', GROUP_ITEMS)

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: '#03080F',
      color: '#C8FFD4',
    }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 200,
        minHeight: '100vh',
        backgroundColor: '#020710',
        borderRight: border,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: border,
        }}>
          <div style={{
            fontFamily: "'VT323', monospace",
            fontSize: 36,
            color: '#00FF88',
            lineHeight: 1,
            textShadow: '0 0 10px #00FF88, 0 0 30px rgba(0,255,136,0.4)',
            letterSpacing: 2,
          }}>
            CAISHEN
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: '#2D6644',
            letterSpacing: '0.12em',
            marginTop: 3,
          }}>
            v0.1 // INVESTING TERMINAL
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {groupOrder.visible.map(group => (
            <Draggable key={group} id={group} label={group} api={groupOrder} variant="section">
              <div style={{ marginBottom: 4 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: '#1D4A30',
                  letterSpacing: '0.16em',
                  padding: '8px 16px 4px',
                }}>
                  {group}
                </div>
                <NavGroup group={group} active={active} setActive={setActive} />
              </div>
            </Draggable>
          ))}
          <AddWidgetTray api={groupOrder} title="HIDDEN NAV GROUPS" />
        </nav>

        {/* Footer status */}
        <div style={{
          borderTop: border,
          padding: '10px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: '#00FF88', fontSize: 8, textShadow: '0 0 6px #00FF88' }}>●</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#2D6644', letterSpacing: '0.08em' }}>
              SYS ONLINE
            </span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1D4A30' }}>
            {time}
            <span className="blink" style={{ color: '#00FF88', marginLeft: 2 }}>_</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar. Previously a shell prompt, the current page's name and
            a row of data-source status dots -- all of which were purely
            decorative (the sidebar already shows which page you're on, and
            the dots were hardcoded rather than reflecting real source
            health). That space now carries the ticker tape; only the
            EDIT LAYOUT button, which actually does something, is kept. */}
        <header style={{
          borderBottom: border,
          padding: '0 0 0 12px',
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          backgroundColor: '#020710',
          flexShrink: 0,
        }}>
          <TickerTape />
          <div style={{ flexShrink: 0, paddingRight: 28 }}>
            <EditModeButton />
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
          <ErrorBoundary key={active}>
            {active === 'stock'     && <StockInfo />}
            {active === 'projector' && <Projector />}
            {active === 'market'    && <MarketOverview />}
            {active === 'crypto'    && <Crypto />}
            {active === 'bonds'     && <Bonds />}
            {active === 'forex'     && <Forex />}
            {active === 'futures'   && <Futures />}
            {active === 'portfolio' && <Portfolio />}
            {active === 'watchlist' && <Watchlist />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

/** The tab buttons inside one sidebar group -- individually reorderable. */
function NavGroup({
  group, active, setActive,
}: {
  group: string
  active: Tab
  setActive: (t: Tab) => void
}) {
  const items = useMemo(
    () => TABS.filter(t => t.group === group).map(t => ({ id: t.id, label: t.label })),
    [group],
  )
  const api = useSortableLayout(`app.tabs.${group}`, items)
  const byId = useMemo(() => new Map(TABS.map(t => [t.id as string, t])), [])

  return (
    <>
      {api.visible.map(id => {
        const t = byId.get(id)
        if (!t) return null
        const isActive = active === t.id
        return (
          <Draggable key={t.id} id={t.id} label={t.label} api={api}>
            <button
              type="button"
              onClick={() => setActive(t.id as Tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 16px',
                background: isActive ? 'rgba(0,255,136,0.07)' : 'transparent',
                borderLeft: isActive ? '2px solid #00FF88' : '2px solid transparent',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                cursor: 'pointer',
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 13,
                color: isActive ? '#00FF88' : '#2D6644',
                letterSpacing: '0.06em',
                textAlign: 'left',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#4DCC88'
                  e.currentTarget.style.background = 'rgba(0,255,136,0.03)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#2D6644'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{
                fontSize: 10,
                color: isActive ? '#00FF88' : '#1D4A30',
                textShadow: isActive ? '0 0 6px #00FF88' : 'none',
              }}>
                {isActive ? '▶' : '▷'}
              </span>
              <span style={{ textShadow: isActive ? '0 0 8px rgba(0,255,136,0.6)' : 'none' }}>
                {t.label}
              </span>
            </button>
          </Draggable>
        )
      })}
      <AddWidgetTray api={api} title={`HIDDEN ${group} TABS`} />
    </>
  )
}
