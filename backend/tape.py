"""
tape.py — data for the scrolling ticker tape in the top bar.

A fixed basket of headline symbols (index futures/indexes, rates, FX,
commodities, crypto), shared by every client:

    get_tape()                 -> {"items": [...], "as_of": iso}  (one-shot)
    await stream.register(send)    # push snapshots (and live ticks) to a socket
    await stream.unregister(send)

Item shape: {key, label, symbol, price, change, change_pct, live, updated_at}

How it stays current:
  * A poll loop refreshes the whole basket from yfinance every
    POLL_SECONDS (one batched download) and pushes a full snapshot.
  * If the installed yfinance has `AsyncWebSocket` (>= 0.2.55), Yahoo's
    streaming feed is used on top of that for per-symbol ticks between
    polls. If it's missing or the feed won't connect, the tape simply runs
    on polls -- `live` stays False for those items.
The background tasks only run while at least one client is connected.
"""

import asyncio
import json
import threading
import time
from datetime import datetime, timezone

import yfinance as yf

from logger import warn, log_event

POLL_SECONDS = 60
SNAPSHOT_TTL = 30  # get_tape() reuses a poll result this fresh

# (key, label, yahoo symbol)
BASKET = [
    ("spx", "S&P 500", "^GSPC"),
    ("ndx", "NASDAQ 100", "^NDX"),
    ("dji", "DOW", "^DJI"),
    ("rut", "RUSSELL 2K", "^RUT"),
    ("vix", "VIX", "^VIX"),
    ("es", "ES FUT", "ES=F"),
    ("nq", "NQ FUT", "NQ=F"),
    ("tnx", "10Y YIELD", "^TNX"),
    ("dxy", "DXY", "DX-Y.NYB"),
    ("eurusd", "EUR/USD", "EURUSD=X"),
    ("usdjpy", "USD/JPY", "JPY=X"),
    ("gbpusd", "GBP/USD", "GBPUSD=X"),
    ("gold", "GOLD", "GC=F"),
    ("silver", "SILVER", "SI=F"),
    ("crude", "WTI CRUDE", "CL=F"),
    ("natgas", "NAT GAS", "NG=F"),
    ("btc", "BTC", "BTC-USD"),
    ("eth", "ETH", "ETH-USD"),
    ("nikkei", "NIKKEI", "^N225"),
    ("dax", "DAX", "^GDAXI"),
    ("ftse", "FTSE 100", "^FTSE"),
]
_BY_SYMBOL = {sym: (key, label) for key, label, sym in BASKET}

_lock = threading.Lock()
_items = {}          # key -> item dict
_items_at = 0.0


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _blank(key, label, symbol):
    return {"key": key, "label": label, "symbol": symbol, "price": None,
            "change": None, "change_pct": None, "live": False, "updated_at": None}


def _fetch_all():
    """One batched daily download; last close vs. previous close."""
    symbols = [s for _, _, s in BASKET]
    out = {}
    try:
        df = yf.download(symbols, period="5d", interval="1d", group_by="ticker",
                         auto_adjust=False, progress=False, threads=True)
    except Exception as e:
        warn(f"tape: batch download failed ({e})")
        df = None
    for key, label, sym in BASKET:
        item = _blank(key, label, sym)
        try:
            closes = df[sym]["Close"].dropna() if df is not None else None
            if closes is not None and len(closes) >= 1:
                price = float(closes.iloc[-1])
                item["price"] = price
                if len(closes) >= 2:
                    prev = float(closes.iloc[-2])
                    if prev:
                        item["change"] = price - prev
                        item["change_pct"] = (price - prev) / prev * 100
                item["updated_at"] = _now_iso()
        except Exception:
            pass
        out[key] = item
    return out


def _refresh():
    global _items, _items_at
    fresh = _fetch_all()
    with _lock:
        # Keep live flags/prices from the streaming feed if a poll comes
        # back empty for a symbol (Yahoo hiccup) rather than blanking it.
        for key, item in fresh.items():
            old = _items.get(key)
            if item["price"] is None and old is not None:
                fresh[key] = old
        _items = fresh
        _items_at = time.monotonic()
    return _snapshot_items()


def _snapshot_items():
    with _lock:
        return [_items.get(k) or _blank(k, l, s) for k, l, s in BASKET]


def get_tape():
    if not _items or (time.monotonic() - _items_at) > SNAPSHOT_TTL:
        _refresh()
    return {"items": _snapshot_items(), "as_of": _now_iso()}


class TapeStream:
    def __init__(self):
        self._clients = set()
        self._poll_task = None
        self._live_task = None

    async def register(self, send):
        self._clients.add(send)
        # Paint immediately from whatever we have.
        if _items:
            await self._send(send, {"type": "snapshot", "items": _snapshot_items()})
        if self._poll_task is None or self._poll_task.done():
            self._poll_task = asyncio.create_task(self._poll_loop())
        if self._live_task is None or self._live_task.done():
            self._live_task = asyncio.create_task(self._live_loop())

    async def unregister(self, send):
        self._clients.discard(send)
        if not self._clients:
            for t in (self._poll_task, self._live_task):
                if t is not None:
                    t.cancel()
            self._poll_task = self._live_task = None

    async def _send(self, send, payload):
        try:
            await send(json.dumps(payload))
        except Exception:
            self._clients.discard(send)

    async def _broadcast(self, payload):
        for send in list(self._clients):
            await self._send(send, payload)

    async def _poll_loop(self):
        while True:
            try:
                items = await asyncio.to_thread(_refresh)
                await self._broadcast({"type": "snapshot", "items": items})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                warn(f"tape: poll failed ({e})")
            await asyncio.sleep(POLL_SECONDS)

    async def _live_loop(self):
        AsyncWebSocket = getattr(yf, "AsyncWebSocket", None)
        if AsyncWebSocket is None:
            return  # older yfinance: polls only
        backoff = 5
        while True:
            try:
                async with AsyncWebSocket(verbose=False) as ws:
                    await ws.subscribe([s for _, _, s in BASKET])
                    log_event("tape: Yahoo live feed connected")
                    backoff = 5
                    await ws.listen(self._on_live)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                warn(f"tape: live feed unavailable ({e}); polling only, retry in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 300)

    async def _on_live(self, msg):
        sym = msg.get("id") if isinstance(msg, dict) else None
        if sym not in _BY_SYMBOL:
            return
        key, label = _BY_SYMBOL[sym]
        price = msg.get("price")
        if price is None:
            return
        with _lock:
            item = dict(_items.get(key) or _blank(key, label, sym))
            item["price"] = float(price)
            if msg.get("change") is not None:
                item["change"] = float(msg["change"])
            if msg.get("change_percent") is not None:
                item["change_pct"] = float(msg["change_percent"])
            item["live"] = True
            item["updated_at"] = _now_iso()
            _items[key] = item
        await self._broadcast({"type": "tick", "item": item})


stream = TapeStream()
