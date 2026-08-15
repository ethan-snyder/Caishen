"""
futures.py — futures_info()

General info (last price, day change, 1-year change, volume) plus
range-filterable price history for a curated set of important futures
contracts -- major equity index futures, key metals/energy, and (as of
this file's latest update) two agricultural staples -- via yfinance.
"""

import datetime
import time

import pandas as pd
import yfinance as yf
from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

FUTURES = {
    "E-mini S&P 500": "ES=F",
    "E-mini Nasdaq 100": "NQ=F",
    "E-mini Dow": "YM=F",
    "E-mini Russell 2000": "RTY=F",
    "Crude Oil (WTI)": "CL=F",
    "Gold": "GC=F",
    "Silver": "SI=F",
    "Natural Gas": "NG=F",
    "Wheat": "ZW=F",
    "Corn": "ZC=F",
}

FUTURES_SYMBOLS = {
    "E-mini S&P 500": "ES",
    "E-mini Nasdaq 100": "NQ",
    "E-mini Dow": "YM",
    "E-mini Russell 2000": "RTY",
    "Crude Oil (WTI)": "CL",
    "Gold": "GC",
    "Silver": "SI",
    "Natural Gas": "NG",
    "Wheat": "ZW",
    "Corn": "ZC",
}

# yfinance ticker by our short symbol (ES, CL, ZW, ...), for the history
# endpoint's URL-safe lookup key.
SYMBOL_BY_CONTRACT = {FUTURES_SYMBOLS[name]: ticker for name, ticker in FUTURES.items()}

# Which contracts are actually dollar-denominated per unit (oil/barrel,
# gold+silver/troy oz, natgas/mmBtu, wheat+corn/bushel) vs. equity index
# futures, whose "price" is an index level (the E-mini's *notional* value
# is dollars, but the quoted number itself isn't one) -- so a "$" prefix
# is only added where the number on screen is genuinely a dollar price.
DOLLAR_DENOMINATED = {"CL", "GC", "SI", "NG", "ZW", "ZC"}


def _get_futures_data():
    results = {}
    for name, symbol in FUTURES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[name] = {"last": last, "change_pct": change_pct}
        except Exception as e:
            warn(f"Couldn't fetch {name} ({e})")
            results[name] = {"last": None, "change_pct": None}
    return results


def futures_info():
    log_event("Fetching futures data")
    print("\n===== Major Futures =====")
    data = _get_futures_data()
    for name, d in data.items():
        if d["last"] is None:
            print(f"  {name:<20} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            color = gradient_color(d["change_pct"], neutral=0.0, max_dev=5.0)
            print(f"  {name:<20} {d['last']:>12,.2f}   {color}({sign}{d['change_pct']:.2f}%){RESET_COLOR}")
    print("=" * 45)
    print()
    log_event("Futures data fetched")
    return data


def _year_change_pct(tk):
    """
    1-year performance: (latest close - close from ~1y ago) / that close
    * 100, off a single extra `period="1y"` yfinance call. Real data, not
    interpolated -- returns None (not 0) if yfinance doesn't have enough
    history for this contract (e.g. a recently-listed one) rather than
    guessing.
    """
    try:
        hist = tk.history(period="1y")
        if len(hist) < 2:
            return None
        first = float(hist["Close"].iloc[0])
        last = float(hist["Close"].iloc[-1])
        if first == 0:
            return None
        return (last - first) / first * 100
    except Exception:
        return None


def get_futures_data_full():
    """
    Data-only variant for API consumers: last price, absolute + percent
    change, 1-year change, volume (from the most recent daily bar), and
    expiry when yfinance has it. Open interest isn't available through
    yfinance for continuous futures contracts, so it's returned as None
    rather than guessed at -- the frontend shows "N/A" for it.
    """
    results = []
    for name, symbol in FUTURES.items():
        contract_symbol = FUTURES_SYMBOLS.get(name, symbol)
        try:
            tk = yf.Ticker(symbol)
            hist = tk.history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change = last - prev
            change_pct = (change / prev) * 100
            volume = int(hist["Volume"].iloc[-1]) if "Volume" in hist.columns else None
            year_change_pct = _year_change_pct(tk)

            expiry = None
            try:
                info = tk.info
                ts = info.get("expireDate") or info.get("expireIsoDate")
                if isinstance(ts, (int, float)):
                    expiry = datetime.datetime.utcfromtimestamp(ts).strftime("%b %Y").upper()
            except Exception:
                pass

            results.append({
                "name": name, "symbol": contract_symbol,
                "currency_symbol": "$" if contract_symbol in DOLLAR_DENOMINATED else None,
                "expiry": expiry, "price": last, "change": change,
                "change_pct": change_pct, "year_change_pct": year_change_pct,
                "volume": volume, "open_interest": None,
            })
        except Exception as e:
            warn(f"Couldn't fetch {name} ({e})")
            results.append({
                "name": name, "symbol": contract_symbol,
                "currency_symbol": "$" if contract_symbol in DOLLAR_DENOMINATED else None,
                "expiry": None, "price": None, "change": None,
                "change_pct": None, "year_change_pct": None,
                "volume": None, "open_interest": None,
            })
    return results


# ----------------------------------------------------------------------
# Per-contract price history (for the expandable chart on each tile)
# ----------------------------------------------------------------------
#
# Same approach as forex.py's get_fx_history: fetch via `period=` (the
# well-supported yfinance code path -- `start=`/`end=` combined with an
# intraday interval unreliably comes back empty) and, for ranges needing
# a narrower window than the nearest valid period offers, trim the
# returned frame down to it client-side, anchored to the LATEST
# timestamp actually in the data rather than wall-clock "now" (futures
# markets have their own trading-halt windows and yfinance's free feed
# can lag real time, so anchoring to "now" can cut the window past all
# the real data and return empty even though the fetch succeeded).
FUTURES_RANGE_SPECS = {
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


def get_futures_history(contract_symbol, range_key="24h"):
    """
    Real price history for one contract (e.g. contract_symbol="CL"),
    straight from yfinance -- same ticker as the live quote, just queried
    over a wider window/interval. Returns {"symbol", "range", "points":
    [{date (ISO), value}]}. No interpolation: whatever bars yfinance
    actually returns are what gets charted, gaps included.
    """
    spec = FUTURES_RANGE_SPECS.get(range_key)
    if not spec:
        raise ValueError(f"unknown range {range_key}")
    ticker = SYMBOL_BY_CONTRACT.get(contract_symbol)
    if not ticker:
        raise ValueError(f"unknown contract {contract_symbol}")

    cache_key = (contract_symbol, range_key)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    tk = yf.Ticker(ticker)
    hist = tk.history(period=spec["period"], interval=spec["interval"])

    if hist.empty:
        raise ValueError(f"no history returned for {contract_symbol} ({range_key})")

    trim_hours, trim_days = spec.get("trim_hours"), spec.get("trim_days")
    if trim_hours or trim_days:
        idx = hist.index
        idx_utc = idx.tz_convert("UTC") if idx.tz is not None else idx.tz_localize("UTC")
        cutoff = idx_utc.max() - pd.Timedelta(hours=trim_hours or 0, days=trim_days or 0)
        hist = hist[idx_utc >= cutoff]
        if hist.empty:
            raise ValueError(f"no history in the trimmed window for {contract_symbol} ({range_key})")

    points = [
        {"date": idx.isoformat(), "value": float(row["Close"])}
        for idx, row in hist.iterrows()
        if pd.notna(row["Close"])
    ]
    if not points:
        raise ValueError(f"no usable close prices for {contract_symbol} ({range_key})")

    result = {"symbol": contract_symbol, "range": range_key, "points": points}
    _cache_set(cache_key, result, HISTORY_TTL_SECONDS)
    return result


if __name__ == "__main__":
    futures_info()
