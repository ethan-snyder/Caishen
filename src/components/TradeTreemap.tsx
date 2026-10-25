import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TradeProfile, TradeProduct, TradeSection } from '@/lib/api'
import { formatLargeNum } from '@/lib/format'
import { C, FONT, goldA } from '@/lib/theme'

// Tradle-style product treemap (after the OEC's games.oec.world/en/tradle):
// every tile is an HS4 product, its area is that product's share of the
// country's exports/imports, and products are grouped and coloured by HS
// section. The row of sector icons underneath doubles as the legend and as
// the zoom control: click one to expand that sector on its own, where
// percentages become shares of the sector and dollar values appear on the
// tiles that have room for them.

// ---------------------------------------------------------------------
// Sector colours + icons
// ---------------------------------------------------------------------

// One hue per HS section, tuned for the Moneta dark surface. Sector identity
// is never colour-alone: every tile is labelled and every swatch carries an
// icon + tooltip. Pure gain/loss green and red are avoided.
export const SECTION_COLORS: Record<string, string> = {
  I: '#D9896A',     // animal products
  II: '#8FB34A',    // vegetable products
  III: '#D4B44A',   // animal & vegetable fats
  IV: '#6FA88A',    // foodstuffs
  V: '#A65E2E',     // mineral products
  VI: '#C9569A',    // chemicals
  VII: '#8A6CC9',   // plastics & rubber
  VIII: '#B5835A',  // hides & leather
  IX: '#6E8B3D',    // wood
  X: '#BBA978',     // paper
  XI: '#2E9E6A',    // textiles
  XII: '#4F7CC9',   // footwear & headwear
  XIII: '#8F9AA8',  // stone & glass
  XIV: '#D4AF37',   // precious metals (Moneta gold)
  XV: '#8C6A4F',    // base metals
  XVI: '#3F86D9',   // machinery & electronics
  XVII: '#2BA3B5',  // transportation
  XVIII: '#B57DD0', // instruments
  XIX: '#7D7A80',   // arms
  XX: '#D9A05B',    // miscellaneous
  XXI: '#E08AA8',   // art & antiques
  '99': '#5E4D70',  // not specified
}

// Simple line icons (24x24, stroked) for each section.
const ICON_PATHS: Record<string, string> = {
  I: 'M6 7h12v6a6 6 0 0 1-12 0z M6 8C4 8 2.5 6.5 2.5 4.5c2 0 3.5.8 3.5 2.5 M18 8c2 0 3.5-1.5 3.5-3.5-2 0-3.5.8-3.5 2.5 M9.5 11v.5 M14.5 11v.5 M10 16h4',
  II: 'M12 21V11 M12 11C12 6 8.5 3 4 3c0 5 3.5 8 8 8z M12 14c0-4 3-7 8-7 0 4.5-3 7-8 7z',
  III: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z M9.5 15a2.5 2.5 0 0 0 2.5 2.5',
  IV: 'M6 6h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z M5 6h14 M6 10h12 M6 16h12',
  V: 'M12 3c.8 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.7-3.8 2.2-5.5 1 .9 1.8 2 1.8 3.2C11 8 11.8 5.5 12 3z',
  VI: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3 M7.3 15h9.4',
  VII: 'M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z M8 13h8 M8 17h8',
  VIII: 'M5 9h14l-1.2 11H6.2z M9 9V7a3 3 0 0 1 6 0v2 M12 13v3',
  IX: 'M12 21v-5 M12 3l6 8h-3l4 5H5l4-5H6z',
  X: 'M7 3h7l4 4v14H7z M14 3v4h4 M9.5 12h6 M9.5 15h6 M9.5 18h4',
  XI: 'M8 4L3 7l2 4 2-1v10h10V10l2 1 2-4-5-3c-1 1.5-2.5 2-4 2s-3-.5-4-2z',
  XII: 'M3 17V8h4l2 3.5 5 1.2 5.5 1.8a2 2 0 0 1 1.5 2V18H3z M3 15h18',
  XIII: 'M7.5 3h9L15.5 9a3.5 3.5 0 0 1-7 0z M12 12.5V20 M8.5 20.5h7',
  XIV: 'M6.5 4h11L21 9l-9 11L3 9z M3 9h18 M9.5 4L8 9l4 11 4-11-1.5-5',
  XV: 'M3.5 8h12c0 2 2 3.2 5 3.2V12h-6.5v2l2.5 3.5H7.5L10 14v-2H8C5 12 3.5 10.2 3.5 8z',
  XVI: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  XVII: 'M3 16v-3.5L5 8h14l2 4.5V16z M3 12.5h18 M5.5 17.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0 M15.3 17.5a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0',
  XVIII: 'M3.5 16.5a8.5 8.5 0 1 1 17 0 M12 16.5l4-5 M3.5 16.5h17 M6.5 11.5l1.2 1 M12 7.8v1.6 M17.5 11.5l-1.2 1',
  XIX: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16 M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7 M12 1.5v4 M12 18.5v4 M1.5 12h4 M18.5 12h4',
  XX: 'M9 3h6l3.5 7h-13z M12 10v8 M8 21h8 M12 18v3',
  XXI: 'M4 4h16v12H4z M6.5 13.5l3.2-4 3 3 2.3-2 2.5 3 M8 21l2.2-5 M16 21l-2.2-5',
  '99': 'M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8V15 M12 18.2v.6',
}

export function SectionIcon({ id, size = 18, color = '#FFFFFF' }: { id: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[id] ?? ICON_PATHS['99']} />
    </svg>
  )
}

/** Dark text on light tiles, white on dark ones (WCAG relative luminance). */
function inkFor(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return L > 0.28 ? '#1A1022' : '#FFFFFF'
}

// ---------------------------------------------------------------------
// Shared hooks (also used by Trade.tsx)
// ---------------------------------------------------------------------

/** Measures an element's width so SVG/absolute layouts can be responsive. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** One floating tooltip that follows the cursor. */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const node = tip ? (
    <div style={{
      position: 'fixed', left: Math.min(tip.x + 14, window.innerWidth - 290), top: Math.min(tip.y + 14, window.innerHeight - 170),
      zIndex: 50, pointerEvents: 'none', backgroundColor: C.tooltip, border: `1px solid ${goldA(0.4)}`,
      padding: '9px 11px', fontFamily: FONT.mono, fontSize: 11, color: C.text, maxWidth: 280,
      boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
    }}>{tip.content}</div>
  ) : null
  return {
    node,
    show: (e: { clientX: number; clientY: number }, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content }),
    hide: () => setTip(null),
  }
}

export function TipRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: color ?? C.number }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------
// Squarified treemap layout
// ---------------------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number }

export function squarify<T>(data: { value: number; item: T }[], rect: Rect): { item: T; rect: Rect }[] {
  const out: { item: T; rect: Rect }[] = []
  const items = data.filter(d => d.value > 0).sort((a, b) => b.value - a.value)
  const total = items.reduce((s, d) => s + d.value, 0)
  if (!total || rect.w <= 0 || rect.h <= 0) return out
  const scale = (rect.w * rect.h) / total
  const queue = items.map(d => ({ item: d.item, area: d.value * scale }))

  const worst = (row: { area: number }[], side: number) => {
    const s = row.reduce((a, r) => a + r.area, 0)
    let max = -Infinity, min = Infinity
    for (const r of row) { max = Math.max(max, r.area); min = Math.min(min, r.area) }
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min))
  }

  const layoutRow = (row: { item: T; area: number }[], r: Rect): Rect => {
    const s = row.reduce((a, x) => a + x.area, 0)
    if (r.w >= r.h) {
      const colW = s / r.h
      let y = r.y
      for (const x of row) { const h = x.area / colW; out.push({ item: x.item, rect: { x: r.x, y, w: colW, h } }); y += h }
      return { x: r.x + colW, y: r.y, w: r.w - colW, h: r.h }
    }
    const rowH = s / r.w
    let x0 = r.x
    for (const x of row) { const w = x.area / rowH; out.push({ item: x.item, rect: { x: x0, y: r.y, w, h: rowH } }); x0 += w }
    return { x: r.x, y: r.y + rowH, w: r.w, h: r.h - rowH }
  }

  let r = { ...rect }
  let row: { item: T; area: number }[] = []
  while (queue.length) {
    const side = Math.min(r.w, r.h)
    const next = queue[0]
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next)
      queue.shift()
    } else {
      r = layoutRow(row, r)
      row = []
    }
  }
  if (row.length) layoutRow(row, r)
  return out
}

// ---------------------------------------------------------------------
// Label fitting — Tradle scales type with the tile, so big products shout
// ---------------------------------------------------------------------

const CHAR_W = 0.6 // JetBrains Mono advance width, in em

/** Greedy word-wrap line count (long words are broken, like CSS break-word). */
function wrapCount(text: string, perLine: number) {
  let lines = 1, col = 0
  for (const word of text.split(' ')) {
    let len = word.length
    const need = col === 0 ? len : col + 1 + len
    if (need <= perLine) { col = need; continue }
    if (col > 0) { lines++; col = 0 }
    while (len > perLine) { lines++; len -= perLine }
    col = len
  }
  return lines
}

interface Fit { name: number; pct: number; money: number; lines: number }

function fitLabel(name: string, pctText: string, moneyText: string | null, w: number, h: number): Fit | null {
  const W = w - 12, H = h - 8
  if (W < 22 || H < 12) return null

  // Name: as large as the tile allows, wrapping to at most 3 lines and
  // never taking more than ~45% of the tile height.
  let nameSize = Math.min(Math.sqrt(W * H) / 5.2, 46)
  const longestWord = Math.max(...name.split(' ').map(w => w.length))
  let lines = 1
  for (let i = 0; i < 40; i++) {
    const perLine = Math.max(1, Math.floor(W / (CHAR_W * nameSize)))
    lines = wrapCount(name, perLine)
    // Don't split a word across lines unless it can't fit even at small sizes.
    const wordFits = longestWord <= perLine || nameSize < 11
    if (wordFits && lines <= 3 && lines * nameSize * 1.12 <= H * 0.45) break
    nameSize *= 0.9
  }
  if (nameSize < 8.5) nameSize = 0

  const used = nameSize ? lines * nameSize * 1.12 + 4 : 0
  let pctSize = Math.min(nameSize ? nameSize * 1.35 : 40, W / (pctText.length * CHAR_W), (H - used) / 1.15, 64)
  if (pctSize < 8.5) pctSize = 0

  let moneySize = 0
  if (moneyText && pctSize) {
    moneySize = Math.min(Math.max(pctSize * 0.42, 10), 18, W / (moneyText.length * CHAR_W))
    if (moneySize < 9.5 || used + pctSize * 1.15 + moneySize * 1.4 > H) moneySize = 0
  }
  if (!nameSize && !pctSize) return null
  return { name: nameSize, pct: pctSize, money: moneySize, lines }
}

// ---------------------------------------------------------------------
// The treemap
// ---------------------------------------------------------------------

const money = (v: number | null | undefined) => formatLargeNum(v, '$')
const pctFmt = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—'
  if (v >= 10) return `${v.toFixed(1)}%`
  if (v >= 1) return `${v.toFixed(2)}%`
  return `${v.toFixed(2)}%`
}

/** A tile: one product, or the per-sector "Other" bucket holding the
 *  products too small to carry a label (`members`). */
type TileProduct = TradeProduct & { members?: TradeProduct[] }
type Placed = { p: TileProduct; sec: TradeSection; rect: Rect }

const OTHER_SUFFIX = '*other'
const canShowPct = (p: TradeProduct, r: Rect) => (fitLabel(p.name, pctFmt(p.share), null, r.w - 1, r.h - 1)?.pct ?? 0) > 0

/** Overview layout for one sector. Products whose tile would be too small to
 *  show a percentage are folded into a single "Other" tile (re-laying out
 *  until it settles), so slivers don't pile up in each block's corner. The
 *  full breakdown is still available by expanding the sector. */
function layoutSector(sec: TradeSection, rect: Rect): Placed[] {
  let items: TileProduct[] = sec.products
  let members: TradeProduct[] = []
  let placed = squarify(items.map(p => ({ value: p.value, item: p })), rect)
  for (let iter = 0; iter < 8; iter++) {
    const small = placed.filter(t => !t.item.code.endsWith(OTHER_SUFFIX) && !canShowPct(t.item, t.rect)).map(t => t.item)
    // Nothing to fold, or a lone sliver with no bucket to join: done.
    if (small.length === 0 || (small.length === 1 && members.length === 0)) break
    members = [...members, ...small].sort((a, b) => b.value - a.value)
    const smallCodes = new Set(small.map(p => p.code))
    const value = members.reduce((n, p) => n + p.value, 0)
    const other: TileProduct = {
      code: `${sec.id}${OTHER_SUFFIX}`, name: 'Other', chapter: '',
      full: `${members.length} smaller ${sec.name.toLowerCase()} products, click to expand the sector`,
      value,
      share: members.reduce((n, p) => n + (p.share ?? 0), 0),
      section_share: members.reduce((n, p) => n + (p.section_share ?? 0), 0),
      members,
    }
    items = [...items.filter(p => !smallCodes.has(p.code) && !p.code.endsWith(OTHER_SUFFIX)), other]
    placed = squarify(items.map(p => ({ value: p.value, item: p })), rect)
  }
  return placed.map(({ item, rect: r }) => ({ p: item, sec, rect: r }))
}

export default function TradeTreemap({ profile, height = 540 }: { profile: TradeProfile; height?: number }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [focus, setFocus] = useState<string | null>(null)
  const tip = useTooltip()

  const sections = profile.sections.filter(s => s.value > 0)
  const focused = focus ? sections.find(s => s.id === focus) ?? null : null

  // Drop the zoom if the new country/flow doesn't trade in that sector.
  useEffect(() => {
    if (focus && !profile.sections.some(s => s.id === focus && s.value > 0)) setFocus(null)
  }, [profile, focus])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tiles: Placed[] = useMemo(() => {
    if (!width) return []
    const full = { x: 0, y: 0, w: width, h: height }
    if (focused) {
      return squarify(focused.products.map(p => ({ value: p.value, item: p })), full)
        .map(({ item, rect }) => ({ p: item, sec: focused, rect }))
    }
    // Overview: lay out sectors first so each colour stays in one block,
    // then the products inside each sector's rectangle.
    return squarify(sections.map(s => ({ value: s.value, item: s })), full).flatMap(({ item: sec, rect }) =>
      layoutSector(sec, { x: rect.x + 1, y: rect.y + 1, w: Math.max(0, rect.w - 2), h: Math.max(0, rect.h - 2) }),
    )
  }, [width, height, focused, sections])

  const total = focused ? focused.value : profile.total
  const flowWord = profile.flow === 'X' ? 'exports' : 'imports'

  return (
    <div>
      {/* Header: Tradle's "Total: $X" (or the zoomed sector's total) */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: 12, minHeight: 34 }}>
        {focused && (
          <button onClick={() => setFocus(null)} style={{
            position: 'absolute', left: 0, top: 4, fontFamily: FONT.terminal, fontSize: 12, letterSpacing: '0.08em',
            color: C.gold, background: 'transparent', border: `1px solid ${goldA(0.3)}`, padding: '4px 10px', cursor: 'pointer',
          }}>◂ ALL SECTORS</button>
        )}
        {focused && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT.display, fontSize: 13, fontWeight: 600, letterSpacing: '0.14em', color: C.textSoft, marginBottom: 2 }}>
            <span style={{ display: 'inline-flex', padding: 3, backgroundColor: SECTION_COLORS[focused.id] }}>
              <SectionIcon id={focused.id} size={14} color={inkFor(SECTION_COLORS[focused.id])} />
            </span>
            {focused.name.toUpperCase()}
          </div>
        )}
        <div style={{ fontFamily: FONT.mono, fontSize: 20, color: C.number }}>
          Total: <span style={{ fontWeight: 600 }}>{money(total)}</span>
          {focused && (
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>{pctFmt(focused.share)} of {flowWord}</span>
          )}
        </div>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height, backgroundColor: C.inset, overflow: 'hidden' }}
        onMouseLeave={tip.hide}>
        {tiles.map(({ p, sec, rect }) => {
          const color = SECTION_COLORS[sec.id] ?? C.muted
          const ink = inkFor(color)
          const share = focused ? p.section_share : p.share
          const pctText = pctFmt(share)
          const moneyText = focused ? money(p.value) : null
          const fit = fitLabel(p.name, pctText, moneyText, rect.w - 1, rect.h - 1)
          return (
            <div key={p.code}
              onMouseMove={e => tip.show(e, (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <span style={{ display: 'inline-flex', padding: 2, backgroundColor: color }}><SectionIcon id={sec.id} size={12} color={ink} /></span>
                    <span style={{ color: C.gold, fontWeight: 600 }}>{p.name}</span>
                  </div>
                  {p.full && p.full !== p.name && (
                    <div style={{ color: C.textSoft, fontSize: 10, marginBottom: 6, lineHeight: 1.35 }}>
                      {p.full.length > 140 ? `${p.full.slice(0, 138)}…` : p.full}
                    </div>
                  )}
                  {p.members && (
                    <div style={{ marginBottom: 6 }}>
                      {p.members.slice(0, 6).map(m => (
                        <TipRow key={m.code} label={m.name.length > 26 ? `${m.name.slice(0, 25)}…` : m.name} value={pctFmt(m.share)} />
                      ))}
                      {p.members.length > 6 && <div style={{ color: C.dim, fontSize: 10 }}>+ {p.members.length - 6} more</div>}
                    </div>
                  )}
                  {!p.members && <TipRow label="HS CODE" value={p.code.replace('..', '')} />}
                  <TipRow label="SECTOR" value={sec.name} />
                  <TipRow label="VALUE" value={money(p.value)} />
                  <TipRow label={`SHARE OF ${flowWord.toUpperCase()}`} value={pctFmt(p.share)} />
                  <TipRow label="SHARE OF SECTOR" value={pctFmt(p.section_share)} />
                </div>
              ))}
              onClick={p.members ? () => { tip.hide(); setFocus(sec.id) } : undefined}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.12)')}
              onMouseOut={e => (e.currentTarget.style.filter = 'none')}
              style={{
                position: 'absolute', left: rect.x + 0.5, top: rect.y + 0.5,
                width: Math.max(0, rect.w - 1), height: Math.max(0, rect.h - 1),
                backgroundColor: color, color: ink, overflow: 'hidden', boxSizing: 'border-box',
                padding: '4px 6px', display: 'flex', flexDirection: 'column', cursor: p.members ? 'zoom-in' : 'default',
                transition: 'left 0.35s ease, top 0.35s ease, width 0.35s ease, height 0.35s ease',
              }}
            >
              {fit && fit.name > 0 && (
                <div style={{
                  fontFamily: FONT.mono, fontSize: fit.name, lineHeight: 1.12, fontWeight: 500,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word', letterSpacing: '-0.01em',
                }}>{p.name}</div>
              )}
              {fit && fit.pct > 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: fit.pct, lineHeight: 1.1, opacity: 0.92, whiteSpace: 'nowrap' }}>{pctText}</div>
                  {fit.money > 0 && moneyText && (
                    <div style={{ fontFamily: FONT.mono, fontSize: fit.money, lineHeight: 1.3, opacity: 0.78, whiteSpace: 'nowrap' }}>{moneyText}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Sector icons: legend + zoom control */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 12 }}>
        {profile.sections.map(s => {
          const has = s.value > 0
          const active = focus === s.id
          const dimmed = focus !== null && !active
          const color = SECTION_COLORS[s.id]
          return (
            <button key={s.id}
              disabled={!has}
              onClick={() => setFocus(active ? null : s.id)}
              onMouseMove={e => tip.show(e, (
                <div>
                  <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                  <TipRow label="VALUE" value={money(s.value)} />
                  <TipRow label={`SHARE OF ${flowWord.toUpperCase()}`} value={pctFmt(s.share)} />
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>{has ? (active ? 'click to show all sectors' : 'click to expand') : 'none reported'}</div>
                </div>
              ))}
              onMouseLeave={tip.hide}
              aria-label={`${s.name}${active ? ' (expanded)' : ''}`}
              aria-pressed={active}
              style={{
                width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: dimmed || !has ? C.inset : color,
                border: active ? `2px solid ${C.goldBright}` : `1px solid ${dimmed || !has ? goldA(0.14) : 'transparent'}`,
                boxShadow: active ? `0 0 10px ${goldA(0.5)}` : 'none',
                opacity: has ? 1 : 0.35, cursor: has ? 'pointer' : 'default', padding: 0,
                transition: 'background-color 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => has && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseOut={e => (e.currentTarget.style.transform = 'none')}
            >
              <SectionIcon id={s.id} size={18} color={dimmed || !has ? C.muted : inkFor(color)} />
            </button>
          )
        })}
      </div>
      {tip.node}
    </div>
  )
}
