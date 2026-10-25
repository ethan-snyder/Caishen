"""
coinbase_stream.py — live crypto prices for the CRYPTO tab.

One shared upstream connection to Coinbase's public Exchange WebSocket feed
(ticker channel, no API key needed) is multiplexed to every browser
connected to /ws/crypto. Each browser declares the symbols it is showing;
the manager keeps the upstream subscription equal to the union of what all
clients want, and relays each trade tick only to clients that asked for
that symbol.

    supported, unsupported = symbols_to_products(["BTC", "ETH", "XYZ"])
    await manager.update_subscription(send, supported)   # per client
    await manager.unregister(send)                        # on disconnect

Messages sent to clients (JSON text):
    {"type": "tick", "symbol": "BTC", "product_id": "BTC-USD", "price": ...,
     "open_24h": ..., "high_24h": ..., "low_24h": ..., "volume_24h": ...,
     "time": "..."}

The upstream task starts on the first subscription, reconnects with
backoff if Coinbase drops it, and shuts down when no client wants anything.
"""

import asyncio
import json

from logger import warn, log_event

FEED_URL = "wss://ws-feed.exchange.coinbase.com"

# CoinGecko symbols (what the frontend has) -> Coinbase USD products.
# Stablecoins pegged to USD have no "<X>-USD" market worth streaming, and a
# few majors aren't listed on Coinbase at all; those come back unsupported
# and the frontend keeps showing the CoinGecko snapshot for them.
_UNLISTED = {"USDT", "USDC", "BNB", "TRX", "LEO", "TON", "WBTC", "STETH", "WSTETH", "WEETH", "USDE", "DAI"}
_OVERRIDES = {"WETH": "ETH-USD"}


def symbols_to_products(symbols):
    """Returns ({symbol: product_id}, [unsupported symbols])."""
    supported, unsupported = {}, []
    for raw in symbols:
        sym = str(raw).upper().strip()
        if not sym or not sym.isalnum() or len(sym) > 10:
            continue
        if sym in _UNLISTED:
            unsupported.append(sym)
            continue
        supported[sym] = _OVERRIDES.get(sym, f"{sym}-USD")
    return supported, unsupported


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class CoinbaseStreamManager:
    def __init__(self):
        # send coroutine -> {symbol: product_id}
        self._clients = {}
        self._task = None
        self._ws = None
        self._subscribed = set()   # product ids currently subscribed upstream
        self._invalid = set()      # products Coinbase rejected (not listed)
        self._lock = asyncio.Lock()

    # -- client side ----------------------------------------------------

    async def update_subscription(self, send, supported):
        async with self._lock:
            self._clients[send] = dict(supported)
            await self._sync_upstream()

    async def unregister(self, send):
        async with self._lock:
            self._clients.pop(send, None)
            await self._sync_upstream()

    def _wanted(self):
        out = set()
        for subs in self._clients.values():
            out.update(p for p in subs.values() if p not in self._invalid)
        return out

    async def _sync_upstream(self):
        wanted = self._wanted()
        if not wanted:
            if self._task is not None:
                self._task.cancel()
                self._task = None
            self._subscribed = set()
            return
        if self._task is None or self._task.done():
            self._subscribed = set()
            self._task = asyncio.create_task(self._run())
            return
        await self._apply_diff(wanted)

    async def _apply_diff(self, wanted):
        ws = self._ws
        if ws is None:
            return  # _run subscribes to the full wanted set once connected
        add = sorted(wanted - self._subscribed)
        drop = sorted(self._subscribed - wanted)
        try:
            if add:
                await ws.send(json.dumps({"type": "subscribe", "product_ids": add, "channels": ["ticker"]}))
            if drop:
                await ws.send(json.dumps({"type": "unsubscribe", "product_ids": drop, "channels": ["ticker"]}))
            self._subscribed = set(wanted)
        except Exception as e:
            warn(f"coinbase_stream: subscription update failed ({e})")

    # -- upstream side --------------------------------------------------

    async def _run(self):
        import websockets  # imported lazily so the API still boots without it

        backoff = 1
        while True:
            try:
                async with websockets.connect(FEED_URL, ping_interval=20, ping_timeout=20, max_size=2 ** 22) as ws:
                    self._ws = ws
                    wanted = self._wanted()
                    if wanted:
                        await ws.send(json.dumps({"type": "subscribe", "product_ids": sorted(wanted), "channels": ["ticker"]}))
                    self._subscribed = set(wanted)
                    log_event(f"coinbase_stream: connected ({len(wanted)} products)")
                    backoff = 1
                    async for raw in ws:
                        await self._handle(raw)
            except asyncio.CancelledError:
                self._ws = None
                raise
            except Exception as e:
                warn(f"coinbase_stream: upstream dropped ({e}); retrying in {backoff}s")
            self._ws = None
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

    async def _handle(self, raw):
        try:
            msg = json.loads(raw)
        except ValueError:
            return
        kind = msg.get("type")
        if kind == "error":
            # Typically "Failed to subscribe" for a product that doesn't
            # exist. Remember it so we stop asking; the client just never
            # sees ticks for that symbol and keeps its snapshot price.
            reason = str(msg.get("reason") or msg.get("message") or "")
            for pid in list(self._subscribed):
                if pid in reason:
                    self._invalid.add(pid)
                    self._subscribed.discard(pid)
            warn(f"coinbase_stream: feed error ({reason or msg})")
            return
        if kind != "ticker":
            return
        pid = msg.get("product_id")
        price = _num(msg.get("price"))
        if not pid or price is None:
            return
        base = pid.split("-")[0]
        payload_base = {
            "type": "tick",
            "product_id": pid,
            "price": price,
            "open_24h": _num(msg.get("open_24h")),
            "high_24h": _num(msg.get("high_24h")),
            "low_24h": _num(msg.get("low_24h")),
            "volume_24h": _num(msg.get("volume_24h")),
            "time": msg.get("time"),
        }
        dead = []
        for send, subs in list(self._clients.items()):
            for sym, p in subs.items():
                if p != pid:
                    continue
                try:
                    await send(json.dumps({**payload_base, "symbol": sym or base}))
                except Exception:
                    dead.append(send)
                break
        for send in dead:
            self._clients.pop(send, None)


manager = CoinbaseStreamManager()
