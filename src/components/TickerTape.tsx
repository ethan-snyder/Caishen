// Scrolling market ticker in the top bar, on every page.
//
// Paints from a one-shot /api/tape snapshot, then stays current over the
// /ws/tape socket (full snapshots after each backend poll, plus per-symbol
// ticks when the backend has a live feed). If the socket can't connect,
// it falls back to re-polling the snapshot endpoint.
//
// The track holds two copies of the list and slides by -50% (see the
// tape-scroll keyframes in index.css), so the loop has no seam. Speed is a
// constant px/sec, not a fixed duration, so adding symbols doesn't make it
// race. Hover pauses it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface TapeItem {
  key: string
  label: string
  symbol: string
  price: number | null
  change: number | null
  change_pct: number | null
  live: boolean
  updated_at: string | null
}

const PX_PER_SEC = 45
const POLL_MS = 60_000

function fmtPrice(v: number | null) {
  if (v === null) return '—'
  const d = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 10 ? 2 : 4
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function Entry({ it }: { it: TapeItem }) {
  const pct = it.change_pct
  const up = pct !== null && pct > 0
  const down = pct !== null && pct < 0
  const color = up ? '#3DDC84' : down ? '#FF4D4D' : '#A391B5'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, padding: '0 18px', whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#D4AF37', letterSpacing: '0.06em' }}>
        {it.label}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#FFFFFF' }}>
        {fmtPrice(it.price)}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color }}>
        {pct === null ? '' : `${up ? '▲' : down ? '▼' : '◆'} ${Math.abs(pct).toFixed(2)}%`}
      </span>
      {it.live && <span title="live" style={{ color: '#3DDC84', fontSize: 7 }}>●</span>}
      <span style={{ color: '#5E4D70', marginLeft: 11 }}>◆</span>
    </span>
  )
}

export default function TickerTape() {
  const [items, setItems] = useState<TapeItem[]>([])
  const trackRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(60)

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const loadSnapshot = () => {
      fetch('/api/tape')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled && d && Array.isArray(d.items)) setItems(d.items) })
        .catch(() => { /* tape is decorative -- stay quiet */ })
    }

    const startPolling = () => {
      if (poll === null) poll = setInterval(loadSnapshot, POLL_MS)
    }
    const stopPolling = () => {
      if (poll !== null) { clearInterval(poll); poll = null }
    }

    const connect = () => {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      try {
        ws = new WebSocket(`${proto}//${window.location.host}/ws/tape`)
      } catch {
        startPolling()
        return
      }
      ws.onopen = () => { attempts = 0; stopPolling() }
      ws.onmessage = ev => {
        let msg: { type: string; items?: TapeItem[]; item?: TapeItem }
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.type === 'snapshot' && Array.isArray(msg.items)) setItems(msg.items)
        else if (msg.type === 'tick' && msg.item) {
          const t = msg.item
          setItems(prev => prev.map(p => (p.key === t.key ? t : p)))
        }
      }
      ws.onclose = () => {
        ws = null
        if (cancelled) return
        startPolling()
        retry = setTimeout(connect, Math.min(60_000, 2000 * 2 ** attempts++))
      }
      ws.onerror = () => ws?.close()
    }

    loadSnapshot()
    connect()
    return () => {
      cancelled = true
      stopPolling()
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [])

  // Half the track (one copy of the list) scrolls past at PX_PER_SEC.
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const half = el.scrollWidth / 2
    if (half > 0) setDuration(Math.max(10, half / PX_PER_SEC))
  }, [items])

  return (
    <div
      className="tape-viewport"
      style={{
        flex: 1, minWidth: 0, overflow: 'hidden', height: '100%',
        display: 'flex', alignItems: 'center',
        maskImage: 'linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent)',
      }}
    >
      {items.length === 0 ? (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#5E4D70', paddingLeft: 12 }}>
          {'// waiting for market tape…'}
        </span>
      ) : (
        <div
          ref={trackRef}
          className="tape-track"
          style={{
            display: 'inline-flex', width: 'max-content',
            animation: `tape-scroll ${duration.toFixed(1)}s linear infinite`,
          }}
        >
          {[0, 1].map(copy => (
            <div key={copy} aria-hidden={copy === 1} style={{ display: 'inline-flex' }}>
              {items.map(it => <Entry key={`${copy}-${it.key}`} it={it} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
