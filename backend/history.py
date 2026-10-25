"""
history.py — price/yield history for the click-to-chart popups.

Every row that represents a tradeable instrument (watchlist / portfolio
tickers, market indexes, crypto, FX pairs, futures, Treasury yields) can be
clicked in the UI to open a chart. The frontend sends what it already knows
about the row -- a `kind` plus the identifier it displays -- and this module
maps that to the yfinance symbol using the same tables the data modules use
(market_info.INDEXES, futures.FUTURES, bonds.TREASURIES, forex.FX_PAIRS), so
the two never drift apart.

Data: yfinance `Ticker.history()`. Intraday ranges (1D/5D) are only as good
as Yahoo's intraday feed; outside market hours 1D falls back to the last
session that has data.
"""

import math
import threading
import time

import yfinance as yf

from logger import log_event, warn
import market_info
import futures
import bonds
import forex

# UI range -> (yfinance period, interval)
RANGES = {
    "1D": ("1d", "5m"),
    "5D": ("5d", "30m"),
    "1M": ("1mo", "1d"),
    "6M": ("6mo", "1d"),
    "YTD": ("ytd", "1d"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
    "MAX": ("max", "1mo"),
}
INTRADAY = {"1D", "5D"}

KINDS = ("stock", "index", "crypto", "fx", "future", "bond")

_cache = {}
_lock = threading.Lock()


def _resolve(kind, ident):
    """(kind, display id) -> (yfinance symbol, display name, unit).

    unit is how the frontend should format values: 'usd' (prices), 'points'
    (index levels), 'rate' (FX), 'yield' (percent)."""
    ident = (ident or "").strip()
    if not ident:
        raise ValueError("missing id")
    if kind == "stock":
        return ident.upper(), ident.upper(), "usd"
    if kind == "crypto":
        sym = ident.upper()
        return f"{sym}-USD", sym, "usd"
    if kind == "index":
        if ident in market_info.INDEXES:
            return market_info.INDEXES[ident], ident, "points"
        for name, meta in market_info.INDEX_META.items():  # display symbol, e.g. "SPX"
            if meta.get("symbol", "").upper() == ident.upper():
                return market_info.INDEXES[name], name, "points"
        raise KeyError(f"Unknown index '{ident}'")
    if kind == "future":
        if ident in futures.FUTURES:
            return futures.FUTURES[ident], ident, "usd"
        for name, sym in futures.FUTURES.items():
            if futures.FUTURES_SYMBOLS.get(name, sym).upper() == ident.upper() or sym.upper() == ident.upper():
                return sym, name, "usd"
        raise KeyError(f"Unknown futures contract '{ident}'")
    if kind == "bond":
        if ident in bonds.TREASURIES:
            return bonds.TREASURIES[ident], ident, "yield"
        terms = getattr(bonds, "TREASURY_TERMS", {})
        for name, sym in bonds.TREASURIES.items():
            if terms.get(name, "").upper() == ident.upper():
                return sym, name, "yield"
        raise KeyError(f"Unknown Treasury '{ident}'")
    if kind == "fx":
        pair = ident.upper().replace("-", "/")
        for base, quote, sym in forex.FX_PAIRS:
            if f"{base}/{quote}" == pair:
                return sym, pair, "rate"
        if "/" in pair:  # not in the curated list: build Yahoo's symbol
            base, quote = pair.split("/", 1)
            return (f"{quote}=X" if base == "USD" else f"{base}{quote}=X"), pair, "rate"
        raise KeyError(f"Unknown currency pair '{ident}'")
    raise KeyError(f"Unknown kind '{kind}' (expected one of {', '.join(KINDS)})")


def _fetch(symbol, rng):
    period, interval = RANGES[rng]
    hist = yf.Ticker(symbol).history(period=period, interval=interval)
    if rng == "1D" and len(hist) < 2:
        # Weekend/holiday: show the most recent session instead of nothing.
        hist = yf.Ticker(symbol).history(period="5d", interval="5m")
        if len(hist):
            last_day = hist.index[-1].date()
            hist = hist[[ts.date() == last_day for ts in hist.index]]
    points = []
    for ts, close in zip(hist.index, hist["Close"]):
        if close is None or (isinstance(close, float) and math.isnan(close)):
            continue
        points.append({"t": ts.isoformat(), "v": float(close)})
    return points


def get_history_full(kind, ident, rng="1Y"):
    rng = (rng or "1Y").upper()
    if rng not in RANGES:
        raise ValueError(f"range must be one of {', '.join(RANGES)}")
    symbol, name, unit = _resolve(kind, ident)

    key = (symbol, rng)
    ttl = 120 if rng in INTRADAY else 900
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        points = hit[1]
    else:
        log_event(f"Fetching history {symbol} {rng}")
        try:
            points = _fetch(symbol, rng)
        except Exception as e:
            warn(f"Couldn't fetch history for {symbol} ({e})")
            raise
        with _lock:
            _cache[key] = (time.time(), points)

    values = [p["v"] for p in points]
    first = values[0] if values else None
    last = values[-1] if values else None
    change = (last - first) if values else None
    change_pct = (change / first * 100) if values and first else None
    return {
        "kind": kind, "id": ident, "symbol": symbol, "name": name, "unit": unit,
        "range": rng, "ranges": list(RANGES), "intraday": rng in INTRADAY,
        "points": points, "first": first, "last": last, "change": change, "change_pct": change_pct,
        "high": max(values) if values else None, "low": min(values) if values else None,
        "source": "yfinance",
    }
