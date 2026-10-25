// src/lib/cryptoStream.ts
//
// Live crypto prices over the backend's /ws/crypto socket, which relays
// Coinbase's public ticker channel (see backend/coinbase_stream.py).
//
// The page passes the symbols it is showing; the hook (re)subscribes with
// that full list whenever it changes. Symbols Coinbase doesn't list come
// back as "unsupported" and simply never appear in `liveSymbols`, so those
// cards keep showing their CoinGecko snapshot price.
//
// The socket reconnects with backoff if it drops (backend restart, sleep),
// and closes when the page unmounts.

import { useEffect, useRef, useState } from 'react'

export interface LiveTick {
  price: number
  /** 24h percent change computed from Coinbase's rolling 24h open. */
  pricePctChg24h: number | null
  high24h: number | null
  low24h: number | null
  volume24h: number | null
  /** ms epoch of the last trade we saw. */
  updatedAt: number
}

interface TickMsg {
  type: 'tick'
  symbol: string
  price: number
  open_24h: number | null
  high_24h: number | null
  low_24h: number | null
  volume_24h: number | null
}

interface SubscribedMsg {
  type: 'subscribed'
  symbols: string[]
  unsupported: string[]
}

function socketUrl(path: string) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

export function useCryptoStream(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<string, LiveTick>>({})
  const [liveSymbols, setLiveSymbols] = useState<Set<string>>(() => new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const symbolsRef = useRef<string[]>(symbols)
  const key = [...symbols].sort().join(',')

  symbolsRef.current = symbols

  // Connection lifecycle -- independent of which symbols are wanted.
  useEffect(() => {
    let closed = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    // Batch tick bursts into one state update per animation frame; BTC
    // alone can trade dozens of times a second.
    let pending: Record<string, LiveTick> = {}
    let raf: number | null = null
    const flush = () => {
      raf = null
      const batch = pending
      pending = {}
      setTicks(prev => ({ ...prev, ...batch }))
    }

    const connect = () => {
      if (closed) return
      let ws: WebSocket
      try {
        ws = new WebSocket(socketUrl('/ws/crypto'))
      } catch {
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        retry = 0
        ws.send(JSON.stringify({ action: 'subscribe', symbols: symbolsRef.current }))
      }
      ws.onmessage = ev => {
        let msg: TickMsg | SubscribedMsg
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.type === 'subscribed') {
          setLiveSymbols(new Set(msg.symbols))
        } else if (msg.type === 'tick' && typeof msg.price === 'number') {
          const open = msg.open_24h
          pending[msg.symbol] = {
            price: msg.price,
            pricePctChg24h: open ? ((msg.price - open) / open) * 100 : null,
            high24h: msg.high_24h,
            low24h: msg.low_24h,
            volume24h: msg.volume_24h,
            updatedAt: Date.now(),
          }
          if (raf === null) raf = requestAnimationFrame(flush)
        }
      }
      ws.onclose = () => {
        wsRef.current = null
        setLiveSymbols(new Set())
        if (closed) return
        const delay = Math.min(30000, 1000 * 2 ** retry++)
        timer = setTimeout(connect, delay)
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      if (raf !== null) cancelAnimationFrame(raf)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  // Re-subscribe whenever the wanted set changes.
  useEffect(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'subscribe', symbols: symbolsRef.current }))
    }
  }, [key])

  return { ticks, liveSymbols }
}
