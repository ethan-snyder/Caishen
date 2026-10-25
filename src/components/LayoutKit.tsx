// UI half of the layout system (state lives in src/lib/layout.tsx).
//
//   <EditModeButton />   top-bar toggle for edit mode
//   <Draggable>          wraps one reorderable item; inert outside edit mode
//   <AddWidgetTray>      in edit mode, lists hidden items to bring back
//   <EditHint>           in edit mode, a one-line "how this works" note

import { useState, type DragEvent, type ReactNode } from 'react'
import { useLayoutEdit, type SortableApi } from '@/lib/layout'
import { C, FONT, goldA, purpleA } from '@/lib/theme'

export function EditModeButton() {
  const { editing, setEditing } = useLayoutEdit()
  return (
    <button
      type="button"
      onClick={() => setEditing(!editing)}
      title={editing ? 'Done editing (Esc)' : 'Rearrange or hide sections, tiles and tabs'}
      style={{
        fontFamily: FONT.terminal, fontSize: 13, letterSpacing: '0.08em',
        color: editing ? C.bg : C.gold,
        background: editing ? C.gold : purpleA(0.25),
        border: `1px solid ${editing ? C.gold : goldA(0.35)}`,
        padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {editing ? '✓ DONE' : '✎ EDIT LAYOUT'}
    </button>
  )
}

export function EditHint() {
  const { editing } = useLayoutEdit()
  if (!editing) return null
  return (
    <div style={{
      fontFamily: FONT.mono, fontSize: 12, color: C.muted, margin: '0 0 10px',
      padding: '6px 10px', border: `1px dashed ${goldA(0.3)}`, background: purpleA(0.12),
    }}>
      {'// EDIT MODE — drag ⠿ to reorder (or use ◀ ▶), ✕ hides an item; hidden items can be added back from the tray. Esc or DONE when finished.'}
    </div>
  )
}

export function Draggable({
  id, label, api, variant = 'tile', allowHide = true, children,
}: {
  id: string
  label: string
  api: SortableApi
  /** 'section' = a full-width page section (bar above it); 'tile' = a
   * card/row (small handle overlaid in its corner). */
  variant?: 'section' | 'tile'
  allowHide?: boolean
  children: ReactNode
}) {
  const { editing, dragging, setDragging } = useLayoutEdit()
  const [over, setOver] = useState(false)

  if (!editing) return <>{children}</>

  const sameScope = dragging?.key === api.key
  const isDragging = sameScope && dragging?.id === id

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragging({ key: api.key, id })
  }
  const onDragOver = (e: DragEvent) => {
    if (!sameScope || isDragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!over) setOver(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (dragging && sameScope) api.moveTo(dragging.id, id)
    setDragging(null)
  }
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  const controls = (
    <div onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <SmallBtn title="Move earlier" onClick={() => api.nudge(id, -1)}>◀</SmallBtn>
      <SmallBtn title="Move later" onClick={() => api.nudge(id, 1)}>▶</SmallBtn>
      {allowHide && <SmallBtn title={`Hide ${label}`} onClick={() => api.hide(id)} danger>✕</SmallBtn>}
    </div>
  )

  const shell = {
    outline: `1px dashed ${over ? C.gold : goldA(0.35)}`,
    outlineOffset: 2,
    background: over ? purpleA(0.18) : undefined,
    opacity: isDragging ? 0.45 : 1,
    transition: 'opacity 0.1s, background 0.1s',
  }

  if (variant === 'section') {
    return (
      <div
        onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}
        style={{ ...shell, marginBottom: 6 }}
      >
        <div
          draggable onDragStart={onDragStart} onDragEnd={() => setDragging(null)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '3px 8px', background: purpleA(0.3), cursor: 'grab',
            fontFamily: FONT.mono, fontSize: 11, color: C.gold, letterSpacing: '0.12em',
          }}
        >
          <span>⠿ {label}</span>
          {controls}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={() => setDragging(null)}
      onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}
      style={{ ...shell, position: 'relative', cursor: 'grab' }}
    >
      <div style={{
        position: 'absolute', top: 2, right: 2, zIndex: 3,
        display: 'flex', alignItems: 'center', gap: 4,
        background: C.tooltip, border: `1px solid ${goldA(0.3)}`, padding: '1px 3px',
      }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.gold }} title={label}>⠿</span>
        {controls}
      </div>
      {/* While editing, clicks inside a tile shouldn't navigate/expand it. */}
      <div style={{ pointerEvents: 'none' }}>{children}</div>
    </div>
  )
}

function SmallBtn({ children, onClick, title, danger }: {
  children: ReactNode; onClick: () => void; title: string; danger?: boolean
}) {
  return (
    <button
      type="button" title={title} aria-label={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        fontFamily: FONT.mono, fontSize: 10, lineHeight: 1, padding: '2px 4px',
        color: danger ? C.down : C.textSoft, background: 'transparent',
        border: `1px solid ${danger ? 'rgba(255,77,77,0.35)' : goldA(0.25)}`, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export function AddWidgetTray({ api, title }: { api: SortableApi; title: string }) {
  const { editing } = useLayoutEdit()
  if (!editing || api.hidden.length === 0) return null
  return (
    <div style={{
      margin: '8px 0 12px', padding: '8px 10px',
      border: `1px dashed ${goldA(0.3)}`, background: purpleA(0.12),
    }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.muted, letterSpacing: '0.12em', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {api.hidden.map(item => (
          <button
            key={item.id} type="button" onClick={() => api.show(item.id)}
            style={{
              fontFamily: FONT.terminal, fontSize: 12, color: C.gold, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${goldA(0.35)}`, padding: '3px 8px',
            }}
          >
            + {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
