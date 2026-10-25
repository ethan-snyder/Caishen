// src/lib/layout.tsx
//
// User-customizable layout: every reorderable list in the app (sidebar
// groups, tabs inside a group, page sections, tiles, table rows) is a
// "sortable scope" identified by a string key. A scope's order and its
// hidden items are saved in localStorage under `layout.<key>`, so a
// rearranged page survives reloads.
//
// Edit mode is global (one EDIT LAYOUT toggle in the top bar). Outside edit
// mode nothing is draggable and nothing looks different -- the layout
// system only shows itself while you're editing.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'

export interface SortableItem {
  id: string
  label: string
  /** Start hidden until the user adds it from the tray (e.g. extra
   * indexes or countries the backend offers but most people won't want). */
  defaultHidden?: boolean
}

interface SavedScope {
  order: string[]
  hidden: string[]
}

export interface SortableApi {
  key: string
  /** Visible ids, in display order. */
  visible: string[]
  /** Hidden items, in their saved order -- what the "add" tray lists. */
  hidden: SortableItem[]
  editing: boolean
  labelOf: (id: string) => string
  /** Move `id` so it sits where `targetId` is now. */
  moveTo: (id: string, targetId: string) => void
  /** Move one step earlier (-1) or later (+1) -- the keyboard path. */
  nudge: (id: string, delta: -1 | 1) => void
  hide: (id: string) => void
  show: (id: string) => void
  reset: () => void
}

interface LayoutCtx {
  editing: boolean
  setEditing: (v: boolean) => void
  /** Which scope + id is being dragged, so drops only land in the same scope. */
  dragging: { key: string; id: string } | null
  setDragging: (d: { key: string; id: string } | null) => void
}

const Ctx = createContext<LayoutCtx>({
  editing: false,
  setEditing: () => {},
  dragging: null,
  setDragging: () => {},
})

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState<{ key: string; id: string } | null>(null)

  // Esc leaves edit mode -- the natural "I'm done" key.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const value = useMemo(() => ({ editing, setEditing, dragging, setDragging }), [editing, dragging])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLayoutEdit() {
  return useContext(Ctx)
}

const STORAGE_PREFIX = 'layout.'

function load(key: string): SavedScope | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null
    return {
      order: parsed.order.filter((x: unknown) => typeof x === 'string'),
      hidden: parsed.hidden.filter((x: unknown) => typeof x === 'string'),
    }
  } catch {
    return null
  }
}

function save(key: string, scope: SavedScope | null) {
  try {
    if (scope === null) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(scope))
  } catch { /* storage unavailable -- layout just won't persist */ }
}

/**
 * Reconciles the saved order with the items that exist right now: saved
 * ids that no longer exist are dropped, new ids are appended in their
 * natural order (so a coin entering the top 10 shows up at the end rather
 * than vanishing), and `defaultHidden` only applies to ids the user has
 * never placed.
 */
function reconcile(items: SortableItem[], saved: SavedScope | null) {
  const ids = items.map(i => i.id)
  const exists = new Set(ids)
  const known = new Set([...(saved?.order ?? []), ...(saved?.hidden ?? [])])
  const order = (saved?.order ?? []).filter(id => exists.has(id))
  const hidden = new Set((saved?.hidden ?? []).filter(id => exists.has(id)))
  for (const it of items) {
    if (known.has(it.id)) continue
    if (it.defaultHidden) hidden.add(it.id)
    else order.push(it.id)
  }
  // Anything neither ordered nor hidden (e.g. hidden earlier, then shown)
  for (const id of ids) if (!order.includes(id) && !hidden.has(id)) order.push(id)
  return { order: order.filter(id => !hidden.has(id)), hidden: [...hidden] }
}

export function useSortableLayout(key: string, items: SortableItem[]): SortableApi {
  const { editing } = useContext(Ctx)
  const [saved, setSaved] = useState<SavedScope | null>(() => load(key))

  // Scopes keyed on something dynamic (e.g. the active watchlist) re-read
  // their own saved state when the key changes.
  useEffect(() => { setSaved(load(key)) }, [key])

  const { order, hidden } = useMemo(() => reconcile(items, saved), [items, saved])
  const labels = useMemo(() => new Map(items.map(i => [i.id, i.label])), [items])

  const commit = useCallback((next: SavedScope) => {
    setSaved(next)
    save(key, next)
  }, [key])

  const moveTo = useCallback((id: string, targetId: string) => {
    if (id === targetId) return
    const next = order.filter(x => x !== id)
    const at = next.indexOf(targetId)
    if (at < 0) return
    // Dropping onto an item that was after the dragged one lands after it;
    // onto one before lands before it -- matches what the eye expects.
    const from = order.indexOf(id)
    const to = order.indexOf(targetId)
    next.splice(from < to ? at + 1 : at, 0, id)
    commit({ order: next, hidden })
  }, [order, hidden, commit])

  const nudge = useCallback((id: string, delta: -1 | 1) => {
    const i = order.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit({ order: next, hidden })
  }, [order, hidden, commit])

  const hide = useCallback((id: string) => {
    commit({ order: order.filter(x => x !== id), hidden: [...hidden.filter(x => x !== id), id] })
  }, [order, hidden, commit])

  const show = useCallback((id: string) => {
    commit({ order: [...order.filter(x => x !== id), id], hidden: hidden.filter(x => x !== id) })
  }, [order, hidden, commit])

  const reset = useCallback(() => {
    setSaved(null)
    save(key, null)
  }, [key])

  return useMemo(() => ({
    key,
    visible: order,
    hidden: hidden.map(id => ({ id, label: labels.get(id) ?? id })),
    editing,
    labelOf: (id: string) => labels.get(id) ?? id,
    moveTo, nudge, hide, show, reset,
  }), [key, order, hidden, labels, editing, moveTo, nudge, hide, show, reset])
}
