import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import StockInfo from './components/StockInfo'
import Projector from './components/Projector'
import MarketOverview from './components/MarketOverview'
import Economics from './components/Economics'
import Crypto from './components/Crypto'
import Bonds from './components/Bonds'
import Forex from './components/Forex'
import Portfolio from './components/Portfolio'
import Watchlist from './components/Watchlist'
import Futures from './components/Futures'
import Trade from './components/Trade'
import TradeLeaderboard from './components/TradeLeaderboard'
import TradeCompare from './components/TradeCompare'
import { LayoutProvider, useSortableLayout } from '@/lib/layout'
import { EditModeButton, Draggable, AddWidgetTray } from './components/LayoutKit'
import TickerTape from './components/TickerTape'
import { ErrorBoundary } from './components/ErrorBoundary'
import { C, FONT, border, purpleA } from './lib/theme'

type Tab =
  | 'stock' | 'projector' | 'market' | 'economics'
  | 'crypto' | 'bonds' | 'forex' | 'futures'
  | 'trade' | 'tradeLeaders' | 'tradeCompare'
  | 'portfolio' | 'watchlist'

const TABS: { id: Tab; label: string; group: string }[] = [
  { id: 'stock',        label: 'STOCK INFO',  group: 'ANALYSIS' },
  { id: 'projector',    label: 'PROJECTOR',   group: 'ANALYSIS' },
  { id: 'market',       label: 'MARKET',      group: 'ANALYSIS' },
  { id: 'economics',    label: 'ECONOMICS',   group: 'ANALYSIS' },
  { id: 'crypto',       label: 'CRYPTO',      group: 'MARKETS' },
  { id: 'bonds',        label: 'BONDS',       group: 'MARKETS' },
  { id: 'forex',        label: 'FOREX',       group: 'MARKETS' },
  { id: 'futures',      label: 'FUTURES',     group: 'MARKETS' },
  { id: 'trade',        label: 'COUNTRY',     group: 'TRADE' },
  { id: 'tradeLeaders', label: 'LEADERBOARD', group: 'TRADE' },
  { id: 'tradeCompare', label: 'COMPARE',     group: 'TRADE' },
  { id: 'portfolio',    label: 'PORTFOLIO',   group: 'TRACKING' },
  { id: 'watchlist',    label: 'WATCHLIST',   group: 'TRACKING' },
]

const GROUPS = ['ANALYSIS', 'MARKETS', 'TRADE', 'TRACKING']
// Hoisted so the identity is stable across renders -- useSortableLayout
// memoizes on this array, and rebuilding it inline every render would
// invalidate that memo on every keystroke elsewhere in the tree.
const GROUP_ITEMS = GROUPS.map(g => ({ id: g, label: g }))

// Height of the sidebar's wordmark block. The colonnade band across the main
// area uses the same height so its base line meets the block's bottom edge.
const BRAND_H = 96

function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of map) while (n >= v) { out += s; n -= v }
  return out
}

/** Small gold coin mark — a nod to the Temple of Juno Moneta, Rome's mint. */
function CoinMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id="coinFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#F3D77A" />
          <stop offset="55%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.goldDeep} />
        </radialGradient>
      </defs>
      <circle cx={20} cy={20} r={19} fill="url(#coinFace)" />
      <circle cx={20} cy={20} r={15.5} fill="none" stroke={C.shell} strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="1.2 1.6" />
      <text x={20} y={26.5} textAnchor="middle" fill={C.shell}
        style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700 }}>M</text>
    </svg>
  )
}

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

  // Ticks once a second. This used to be a one-shot useState initialiser,
  // which meant the sidebar clock froze at whatever time the page happened
  // to load and then sat there indefinitely claiming to be the current
  // time -- a clock that lies is worse than no clock.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', { hour12: false })

  // One sortable scope per sidebar group. Keeping groups separate (rather
  // than one flat list) means a drag can't accidentally fling a tab into
  // an unrelated group, and each group's saved order stays independent.
  const groupOrder = useSortableLayout('app.groups', GROUP_ITEMS)

  // The gold bar under the colonnade is half the distance from the band's
  // base to the bottom of the first sidebar group label ("ANALYSIS" unless
  // the groups have been reordered). Measured at runtime so it stays
  // proportional whatever fonts load.
  const firstGroupRef = useRef<HTMLSpanElement>(null)
  const [barH, setBarH] = useState(14)
  const firstGroup = groupOrder.visible[0]
  useLayoutEffect(() => {
    const measure = () => {
      const el = firstGroupRef.current
      if (!el) return
      const navScroll = el.closest('nav')?.scrollTop ?? 0
      const bottom = el.getBoundingClientRect().bottom + navScroll
      // -1: the inline box runs a hair below the capitals' baseline
      setBarH(Math.max(4, Math.round((bottom - BRAND_H - 1) / 2)))
    }
    measure()
    document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [firstGroup])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', color: C.text }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 210,
        backgroundColor: C.shell,
        backgroundImage: `linear-gradient(180deg, ${purpleA(0.22)} 0%, transparent 45%)`,
        borderRight: border,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Wordmark */}
        <div style={{
          height: BRAND_H, flexShrink: 0, padding: '0 16px', borderBottom: border,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CoinMark />
            <div style={{
              fontFamily: FONT.display,
              fontSize: 25,
              fontWeight: 700,
              color: C.gold,
              lineHeight: 1,
              letterSpacing: '0.12em',
              textShadow: '0 0 10px rgba(212,175,55,0.55), 0 0 28px rgba(212,175,55,0.25)',
            }}>
              MONETA
            </div>
          </div>
          <div style={{
            fontFamily: FONT.display,
            fontSize: 9,
            fontWeight: 600,
            color: C.muted,
            letterSpacing: '0.26em',
            whiteSpace: 'nowrap',
            marginTop: 10,
          }}>
            IVNO MONETA · TERMINAL
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {groupOrder.visible.map((group, gi) => (
            <Draggable key={group} id={group} label={group} api={groupOrder} variant="section">
              <div style={{ marginBottom: 6 }}>
                <div style={{
                  fontFamily: FONT.mono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#7A6A8E',
                  letterSpacing: '0.2em',
                  padding: '10px 18px 5px',
                }}>
                  <span
                    ref={gi === 0 ? firstGroupRef : undefined}
                    style={{ display: 'inline-block', lineHeight: 1 }}
                  >{group}</span>
                </div>
                <NavGroup group={group} active={active} setActive={setActive} />
              </div>
            </Draggable>
          ))}
          <AddWidgetTray api={groupOrder} title="HIDDEN NAV GROUPS" />
        </nav>

        {/* Footer status */}
        <div style={{ borderTop: border, padding: '10px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: C.up, fontSize: 11 }}>●</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: '#A391B5', letterSpacing: '0.08em' }}>
              SYS ONLINE
            </span>
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 12, color: '#7A6A8E' }}>
            {time} · <span style={{ letterSpacing: '0.08em' }}>{toRoman(now.getFullYear())}</span>
            <span className="blink" style={{ color: C.gold, marginLeft: 2 }}>_</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Sticky top: colonnade of gold Ionic columns holding up the top of
            the window, standing directly on a gold bar (the stylobate),
            then the ticker tape + EDIT LAYOUT row underneath. */}
        <div style={{
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 5,
          backgroundColor: C.bg,
        }}>
          <div aria-hidden="true" className="colonnade" style={{ height: BRAND_H }} />
          <div aria-hidden="true" style={{
            height: barH,
            background: `linear-gradient(180deg, ${C.goldBright} 0%, ${C.gold} 40%, ${C.goldDeep} 100%)`,
            boxShadow: '0 0 12px rgba(212,175,55,0.3)',
          }} />
          {/* Ticker tape. Only the EDIT LAYOUT button is kept beside it --
              it's the one control up here that actually does something. */}
          <header style={{
            borderBottom: border,
            padding: '0 0 0 12px',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: C.shell,
          }}>
            <TickerTape />
            <div style={{ flexShrink: 0, paddingRight: 28 }}>
              <EditModeButton />
            </div>
          </header>
        </div>

        {/* Content */}
        <main style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
          <ErrorBoundary key={active}>
            {active === 'stock'        && <StockInfo />}
            {active === 'projector'    && <Projector />}
            {active === 'market'       && <MarketOverview />}
            {active === 'economics'    && <Economics />}
            {active === 'crypto'       && <Crypto />}
            {active === 'bonds'        && <Bonds />}
            {active === 'forex'        && <Forex />}
            {active === 'futures'      && <Futures />}
            {active === 'trade'        && <Trade />}
            {active === 'tradeLeaders' && <TradeLeaderboard onNavigate={setActive} />}
            {active === 'tradeCompare' && <TradeCompare />}
            {active === 'portfolio'    && <Portfolio />}
            {active === 'watchlist'    && <Watchlist />}
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
              onClick={() => setActive(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '8px 18px',
                background: isActive ? `linear-gradient(90deg, ${purpleA(0.55)}, ${purpleA(0.08)})` : 'transparent',
                borderLeft: `2px solid ${isActive ? C.gold : 'transparent'}`,
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                cursor: 'pointer',
                fontFamily: FONT.terminal,
                fontSize: 15,
                fontWeight: 600,
                color: isActive ? C.gold : '#A391B5',
                letterSpacing: '0.08em',
                textShadow: isActive ? '0 0 8px rgba(212,175,55,0.55)' : 'none',
                textAlign: 'left',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = C.text
                  e.currentTarget.style.background = purpleA(0.15)
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#A391B5'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: 9, color: isActive ? C.gold : C.dim }}>◆</span>
              {t.label}
            </button>
          </Draggable>
        )
      })}
      <AddWidgetTray api={api} title={`HIDDEN ${group} TABS`} />
    </>
  )
}
