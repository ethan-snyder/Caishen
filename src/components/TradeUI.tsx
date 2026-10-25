import type { CSSProperties, ReactNode } from 'react'
import { formatLargeNum } from '@/lib/format'
import { C, FONT, border, goldA } from '@/lib/theme'

// Building blocks shared by the TRADE tabs (COUNTRY, LEADERBOARD, COMPARE).

const SURFACE = C.card
const MONO = FONT.mono
const TECH = FONT.terminal

export const money = (v: number | null | undefined) => formatLargeNum(v, '$')
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`)

/** Page title block in the house style (Cinzel heading + mono subtitle). */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
      <div>
        <span style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: '0.12em', textShadow: `0 0 10px ${goldA(0.35)}`, display: 'block', marginBottom: 4 }}>
          {title}
        </span>
        {subtitle && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: '0.08em' }}>{subtitle}</span>}
      </div>
      {right && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.gold, letterSpacing: '0.14em' }}>{children}</div>
      {right}
    </div>
  )
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ backgroundColor: SURFACE, border, padding: '16px 18px', ...style }}>{children}</div>
}

export function SourceNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: '0.04em' }}>
      {'// '}{children}
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: C.muted, border: `1px dashed ${goldA(0.12)}` }}>
      {children}
    </div>
  )
}

export const selectStyle: CSSProperties = {
  backgroundColor: SURFACE, border: `1px solid ${goldA(0.25)}`, color: C.text,
  fontFamily: TECH, fontSize: 13, padding: '6px 10px', outline: 'none', cursor: 'pointer',
}

export function Toggle<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${goldA(0.25)}` }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            fontFamily: TECH, fontSize: 12, letterSpacing: '0.08em', padding: '6px 12px', cursor: 'pointer',
            border: 'none', background: on ? goldA(0.14) : 'transparent',
            color: on ? C.gold : C.muted, textShadow: on ? `0 0 6px ${goldA(0.5)}` : 'none',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{ backgroundColor: SURFACE, border, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: MONO, fontSize: 20, fontWeight: 600, color: C.number, textShadow: '0 0 8px rgba(255,255,255,0.22)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: C.gold, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

