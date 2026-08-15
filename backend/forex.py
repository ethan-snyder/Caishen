"""
forex.py — fx_rates()

General info (last rate, day change, high/low/volume, bid/ask) plus
range-filterable price history for a curated set of major currency pairs,
via yfinance's FX tickers (e.g. "EURUSD=X").

Named "forex" rather than "fx" to avoid colliding with any third-party
package that happens to be installed under the name "fx" -- that exact
collision is what caused `from fx import fx_rates` to fail with an
ImportError (Python loaded someone else's "fx" instead of this file).
"""

import time

import pandas as pd
import yfinance as yf
from logger import log_event, warn

# (base currency, quote currency, yfinance ticker)
FX_PAIRS = [
    ("EUR", "USD", "EURUSD=X"),
    ("GBP", "USD", "GBPUSD=X"),
    ("USD", "JPY", "JPY=X"),
    ("USD", "CHF", "CHF=X"),
    ("USD", "CAD", "CAD=X"),
    ("AUD", "USD", "AUDUSD=X"),
    ("NZD", "USD", "NZDUSD=X"),
    ("USD", "CNY", "CNY=X"),
]

# "EURUSD" (no separator) -> yfinance ticker, for the history endpoint's
# pair-key lookup. URL-safe, unlike "EUR/USD".
SYMBOL_BY_PAIR = {f"{base}{quote}": symbol for base, quote, symbol in FX_PAIRS}

# ISO 3166-1 alpha-2 country codes (plus "eu" for the EU, which flagcdn.com
# also serves as a supranational flag) -- used to build flagcdn.com SVG
# URLs on the frontend. Swapped in for the old Unicode flag emoji, which
# rendered inconsistently (wrong size/baseline, sometimes falling back to
# plain "EU"/"GB" text) since no color-emoji font is loaded anywhere in
# this app; an actual SVG image has no font dependency to fall back from.
CURRENCY_FLAG_CODES = {
    "USD": "us", "EUR": "eu", "GBP": "gb", "JPY": "jp", "CHF": "ch",
    "CAD": "ca", "AUD": "au", "NZD": "nz", "CNY": "cn",
}

# Real-world currency symbols. Several nominally share a bare glyph (CAD/
# AUD/NZD all "$", CNY sometimes "¥" same as JPY) -- C$/A$/NZ$/CN¥ are also
# standard usage and read unambiguously next to a plain "$" or "¥" for
# USD/JPY, so those are used instead of a naive symbol lookup that would
# print "$/$" or "¥/¥" for some pairs.
CURRENCY_SYMBOLS = {
    "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "Fr",
    "CAD": "C$", "AUD": "A$", "NZD": "NZ$", "CNY": "CN¥",
}


def _get_fx_data():
    results = {}
    for base, quote, symbol in FX_PAIRS:
        label = f"{base}/{quote}"
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[label] = {"last": last, "change_pct": change_pct}
        except Exception as e:
            warn(f"Couldn't fetch {label} ({e})")
            results[label] = {"last": None, "change_pct": None}
    return results


def fx_rates():
    log_event("Fetching FX rates")
    print("\n===== Major Currency Pairs =====")
    data = _get_fx_data()

    from utils import gradient_color, RESET_COLOR
    label_width = max((len(name) for name in data), default=10)

    for name, d in data.items():
        pad = " " * max(0, label_width - len(name))
        if d["last"] is None:
            print(f"  {name}{pad} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            color = gradient_color(d["change_pct"], neutral=0.0, max_dev=2.0)
            print(f"  {name}{pad} {d['last']:>10,.4f}   {color}({sign}{d['change_pct']:.2f}%){RESET_COLOR}")
    print("=" * 40)
    print()
    log_event("FX rates fetched")
    return data


def get_fx_data_full():
    """
    Data-only variant for API consumers: last rate, absolute + percent
    change, day's high/low, volume, exchange name, and bid/ask -- all real
    fields off the same yfinance ticker used for the rate itself. yfinance
    doesn't reliably expose bid/ask for FX tickers, so when they're
    missing this approximates a tight spread around the last price
    (flagged via "bid_ask_is_estimate") rather than leaving the frontend
    with nothing to show. Volume is real too, but most FX tickers report 0
    (spot FX has no centralized tape the way exchange-traded instruments
    do) -- that's reported as null rather than a misleading "0".
    """
    results = []
    for base, quote, symbol in FX_PAIRS:
        try:
            tk = yf.Ticker(symbol)
            hist = tk.history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change = last - prev
            change_pct = (change / prev) * 100

            latest = hist.iloc[-1]
            high = float(latest["High"]) if "High" in hist.columns and pd.notna(latest["High"]) else None
            low = float(latest["Low"]) if "Low" in hist.columns and pd.notna(latest["Low"]) else None
            volume = None
            if "Volume" in hist.columns and pd.notna(latest["Volume"]) and float(latest["Volume"]) > 0:
                volume = float(latest["Volume"])

            info = {}
            try:
                info = tk.info
            except Exception:
                pass
            bid = info.get("bid")
            ask = info.get("ask")
            bid_ask_is_estimate = not bid or not ask
            if bid_ask_is_estimate:
                spread = last * 0.0001
                bid = last - spread
                ask = last + spread
            exchange = info.get("fullExchangeName") or info.get("exchange")

            results.append({
                "pair": f"{base}/{quote}", "base": base, "quote": quote,
                "base_flag_code": CURRENCY_FLAG_CODES.get(base), "quote_flag_code": CURRENCY_FLAG_CODES.get(quote),
                "base_symbol": CURRENCY_SYMBOLS.get(base), "quote_symbol": CURRENCY_SYMBOLS.get(quote),
                "rate": last, "change": change, "change_pct": change_pct,
                "high": high, "low": low, "volume": volume, "exchange": exchange,
                "bid": bid, "ask": ask, "bid_ask_is_estimate": bid_ask_is_estimate,
            })
        except Exception as e:
            warn(f"Couldn't fetch {base}/{quote} ({e})")
            results.append({
                "pair": f"{base}/{quote}", "base": base, "quote": quote,
                "base_flag_code": CURRENCY_FLAG_CODES.get(base), "quote_flag_code": CURRENCY_FLAG_CODES.get(quote),
                "base_symbol": CURRENCY_SYMBOLS.get(base), "quote_symbol": CURRENCY_SYMBOLS.get(quote),
                "rate": None, "change": None, "change_pct": None,
                "high": None, "low": None, "volume": None, "exchange": None,
                "bid": None, "ask": None, "bid_ask_is_estimate": True,
            })
    return results


# ----------------------------------------------------------------------
# Per-pair price history (for the expandable chart on each tile)
# ----------------------------------------------------------------------
#
# yfinance supports a wider `.history()` window directly on the same
# "EURUSD=X"-style tickers already used for the live rate, so no new data
# source is needed here. IMPORTANT: `period=` (a plain string like "5d" or
# "1y") is the well-supported code path -- `start=`/`end=` combined with
# an intraday `interval` reliably came back *empty* for FX tickers in
# practice (Yahoo's chart API doesn't like that combination for these
# symbols, and yfinance doesn't surface an error for it, just an empty
# frame), so every range below fetches via `period=` and, for the ranges
# that need a narrower window than the nearest valid period string offers
# (sub-day ranges, and "3y" which isn't a valid yfinance period at all),
# trims the returned frame down to the actual window client-side. Same
# over-fetch-then-trim approach crypto_info.py already uses for its own
# sub-day ranges (see RANGE_TRIM_HOURS there). Interval is chosen per
# range to keep payloads reasonable (intraday bars for the sub-day
# ranges, weekly/monthly bars for the multi-year ones) -- nothing here
# ever interpolates a point that wasn't actually returned.
FX_RANGE_SPECS = {
    "1h":  {"period": "5d", "interval": "5m", "trim_hours": 1},
    "12h": {"period": "5d", "interval": "5m", "trim_hours": 12},
    "24h": {"period": "5d", "interval": "15m", "trim_hours": 24},
    "3mo": {"period": "3mo", "interval": "1d"},
    "1y":  {"period": "1y", "interval": "1d"},
    "3y":  {"period": "5y", "interval": "1wk", "trim_days": 365 * 3},
    "5y":  {"period": "5y", "interval": "1wk"},
    "10y": {"period": "10y", "interval": "1wk"},
    "all": {"period": "max", "interval": "1mo"},
}

HISTORY_TTL_SECONDS = 300  # 5 min -- charts, not live quotes
_history_cache = {}


def _cache_get(key):
    entry = _history_cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() >= expires_at:
        del _history_cache[key]
        return None
    return value


def _cache_set(key, value, ttl_seconds):
    _history_cache[key] = (value, time.monotonic() + ttl_seconds)


def get_fx_history(pair_key, range_key="24h"):
    """
    Real price history for one pair (e.g. pair_key="EURUSD"), straight
    from yfinance -- same ticker as the live rate, just queried over a
    wider window/interval. Returns {"pair", "range", "points": [{date
    (ISO), value}]}. No interpolation: whatever bars yfinance actually
    returns are what gets charted, gaps (weekends, thin history) included.
    """
    spec = FX_RANGE_SPECS.get(range_key)
    if not spec:
        raise ValueError(f"unknown range {range_key}")
    symbol = SYMBOL_BY_PAIR.get(pair_key)
    if not symbol:
        raise ValueError(f"unknown pair {pair_key}")

    cache_key = (pair_key, range_key)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    tk = yf.Ticker(symbol)
    hist = tk.history(period=spec["period"], interval=spec["interval"])

    if hist.empty:
        raise ValueError(f"no history returned for {pair_key} ({range_key})")

    # Trim the over-fetched period down to the actual requested window.
    # Anchored to the LATEST timestamp actually present in the data, not
    # wall-clock "now" -- Yahoo's free FX feed can lag real time by a few
    # hours, and spot FX is closed over the weekend, so "now" can be well
    # ahead of the most recent bar Yahoo actually has. Anchoring to "now"
    # was cutting the trim window past all the real data and returning
    # empty for every intraday range, even though the fetch itself
    # succeeded -- this way, "last 1h" means the last 1h *of data that
    # exists*, which is what the chart should show either way.
    # yfinance's DatetimeIndex is tz-aware for intraday data (exchange
    # timezone) -- normalized to UTC before comparing.
    trim_hours, trim_days = spec.get("trim_hours"), spec.get("trim_days")
    if trim_hours or trim_days:
        idx = hist.index
        idx_utc = idx.tz_convert("UTC") if idx.tz is not None else idx.tz_localize("UTC")
        cutoff = idx_utc.max() - pd.Timedelta(hours=trim_hours or 0, days=trim_days or 0)
        hist = hist[idx_utc >= cutoff]
        if hist.empty:
            raise ValueError(f"no history in the trimmed window for {pair_key} ({range_key})")

    points = [
        {"date": idx.isoformat(), "value": float(row["Close"])}
        for idx, row in hist.iterrows()
        if pd.notna(row["Close"])
    ]
    if not points:
        raise ValueError(f"no usable close prices for {pair_key} ({range_key})")

    result = {"pair": pair_key, "range": range_key, "points": points}
    _cache_set(cache_key, result, HISTORY_TTL_SECONDS)
    return result


if __name__ == "__main__":
    fx_rates()
