"""
portfolio.py — view_portfolio()

Lets the user maintain a simple portfolio by hand-editing a plain text file
(portfolio.txt, created next to this script on first run) with one holding
per line:

    TICKER, QUANTITY
    TICKER, QUANTITY, AVG_COST

The average cost column is optional -- add it for gain/loss tracking, omit
it for live-value-only tracking. Lines starting with # are treated as
comments. This module reads the file, pulls a live price for each ticker
via yfinance, and prints a valued summary (per-position value, day change,
and a total).
"""

import os
import time

import pandas as pd
import yfinance as yf
from utils import fmt_money, gradient_color, RESET_COLOR
from logger import log_event, warn

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_FILE = os.path.join(SCRIPT_DIR, "portfolio.txt")

TEMPLATE = """\
# Caishen portfolio file
# One holding per line: TICKER, QUANTITY
# Optionally add a third column for average cost (enables gain/loss):
#   TICKER, QUANTITY, AVG_COST
# Lines starting with # are ignored.
#
# Edit this file directly (in any text editor), save it, then re-run the
# Portfolio option from the Caishen menu to see it valued.
#
# Example:
# AAPL, 10, 171.22
# MSFT, 5.5
"""


def _ensure_portfolio_file():
    """Returns True if the file already existed, False if it was just created."""
    if not os.path.exists(PORTFOLIO_FILE):
        with open(PORTFOLIO_FILE, "w") as f:
            f.write(TEMPLATE)
        return False
    return True


def _parse_portfolio_file():
    holdings = []
    errors = []
    with open(PORTFOLIO_FILE, "r") as f:
        for lineno, raw_line in enumerate(f, start=1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) not in (2, 3):
                errors.append(f"Line {lineno}: expected 'TICKER, QUANTITY' or 'TICKER, QUANTITY, AVG_COST', got {raw_line!r}")
                continue
            ticker, qty_str = parts[0], parts[1]
            avg_cost_str = parts[2] if len(parts) == 3 else None
            if not ticker:
                errors.append(f"Line {lineno}: missing ticker")
                continue
            try:
                qty = float(qty_str)
            except ValueError:
                errors.append(f"Line {lineno}: quantity '{qty_str}' isn't a number")
                continue
            avg_cost = None
            if avg_cost_str:
                try:
                    avg_cost = float(avg_cost_str)
                except ValueError:
                    errors.append(f"Line {lineno}: avg cost '{avg_cost_str}' isn't a number")
                    continue
            holdings.append((ticker.upper(), qty, avg_cost))
    return holdings, errors


def add_holding(ticker, qty, avg_cost=None):
    """Appends a holding line to portfolio.txt (creating the file first if needed)."""
    _ensure_portfolio_file()
    ticker = ticker.strip().upper()
    line = f"{ticker}, {qty}" + (f", {avg_cost}" if avg_cost is not None else "")
    with open(PORTFOLIO_FILE, "a") as f:
        f.write(line + "\n")
    log_event(f"Added portfolio holding: {line}")


def remove_holding(ticker):
    """Removes all lines for a given ticker from portfolio.txt."""
    if not os.path.exists(PORTFOLIO_FILE):
        return
    ticker = ticker.strip().upper()
    with open(PORTFOLIO_FILE, "r") as f:
        lines = f.readlines()
    kept = []
    removed = False
    for raw_line in lines:
        stripped = raw_line.strip()
        if stripped and not stripped.startswith("#"):
            parts = [p.strip() for p in stripped.split(",")]
            if parts and parts[0].upper() == ticker:
                removed = True
                continue
        kept.append(raw_line)
    with open(PORTFOLIO_FILE, "w") as f:
        f.writelines(kept)
    if removed:
        log_event(f"Removed portfolio holding: {ticker}")
    return removed


# Above this, a computed dividend yield is treated as untrustworthy data
# noise (stale/mismatched yfinance fields, one-time distributions counted
# as dividends) rather than a real number worth displaying. See usage below.
DIVIDEND_YIELD_SANITY_CAP = 25


def _empty_row(ticker, qty, avg_cost, name=None, sector=None):
    """Every metric the frontend can display, all null -- used when a
    ticker can't be fetched at all, so the row shape stays consistent
    rather than the frontend having to guard every field."""
    return {
        "ticker": ticker, "name": name, "sector": sector, "qty": qty,
        "avg_cost": avg_cost, "price": None, "value": None, "cost_basis": None,
        "day_change": None, "day_change_pct": None, "day_gain": None,
        "gain": None, "gain_pct": None,
        "pe": None, "forward_pe": None, "peg": None, "ps": None, "pb": None,
        "beta": None, "eps": None, "market_cap": None,
        "dividend_yield": None, "dividend_rate": None, "annual_dividend": None,
        "week52_high": None, "week52_low": None, "volume": None, "avg_volume": None,
    }


def get_portfolio_full():
    """
    Data-only variant for API consumers: company name, sector, valuation
    ratios, dividend detail, 52-week range and gain/loss (when avg cost
    was provided) on top of what view_portfolio() prints to the console.

    Everything here is a real yfinance field -- anything yfinance doesn't
    have for a given ticker comes back as null rather than being
    estimated, so the frontend can show "—" instead of a made-up number.
    """
    _ensure_portfolio_file()
    holdings, errors = _parse_portfolio_file()

    rows = []
    total_value = 0.0
    total_cost_basis = 0.0
    total_day_gain = 0.0
    total_annual_dividend = 0.0
    has_cost_basis = False
    has_day_change = False

    for ticker, qty, avg_cost in holdings:
        try:
            info = yf.Ticker(ticker).info
        except Exception as e:
            warn(f"Couldn't fetch {ticker} ({e})")
            rows.append(_empty_row(ticker, qty, avg_cost))
            continue

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        name = info.get("longName") or info.get("shortName") or ticker
        sector = info.get("sector")

        if price is None:
            rows.append(_empty_row(ticker, qty, avg_cost, name=name, sector=sector))
            continue

        row = _empty_row(ticker, qty, avg_cost, name=name, sector=sector)

        value = price * qty
        total_value += value
        row["price"] = price
        row["value"] = value

        # Day move, both per-share and as this position's dollar P/L.
        if prev_close:
            day_change = price - prev_close
            row["day_change"] = day_change
            row["day_change_pct"] = day_change / prev_close * 100
            row["day_gain"] = day_change * qty
            total_day_gain += day_change * qty
            has_day_change = True

        if avg_cost is not None:
            cost_basis = avg_cost * qty
            gain = value - cost_basis
            row["cost_basis"] = cost_basis
            row["gain"] = gain
            row["gain_pct"] = (gain / cost_basis * 100) if cost_basis else None
            total_cost_basis += cost_basis
            has_cost_basis = True

        row["pe"] = info.get("trailingPE")
        row["forward_pe"] = info.get("forwardPE")
        row["peg"] = info.get("trailingPegRatio") or info.get("pegRatio")
        row["ps"] = info.get("priceToSalesTrailing12Months")
        row["pb"] = info.get("priceToBook")
        row["beta"] = info.get("beta")
        row["eps"] = info.get("trailingEps")
        row["market_cap"] = info.get("marketCap")
        row["week52_high"] = info.get("fiftyTwoWeekHigh")
        row["week52_low"] = info.get("fiftyTwoWeekLow")
        row["volume"] = info.get("volume") or info.get("regularMarketVolume")
        row["avg_volume"] = info.get("averageVolume")

        # yfinance reports dividendYield inconsistently across tickers --
        # sometimes a fraction (0.0052), sometimes already a percent
        # (0.52). dividendRate (annual $/share) is the unambiguous one, so
        # yield is derived from it against price where possible, and only
        # falls back to the raw field when there's no rate to work from.
        div_rate = info.get("dividendRate")
        div_yield = info.get("dividendYield")
        computed_rate = None
        computed_yield = None
        if div_rate:
            computed_rate = div_rate
            computed_yield = (div_rate / price * 100) if price else None
        elif div_yield:
            pct = div_yield * 100 if div_yield < 1 else div_yield
            computed_yield = pct
            computed_rate = (price * pct / 100) if price else None

        # Sanity cap. Even the "unambiguous" dividendRate field can be
        # stale or split-mismatched against the current price (yfinance's
        # cached fields don't always refresh in lockstep), and leveraged/
        # inverse funds sometimes have one-time capital-gains distributions
        # counted as a dividend and annualized -- either way the result can
        # come out as an implausible number like "58% yield". Above this
        # threshold the figure isn't trustworthy enough to show, so it's
        # nulled out rather than displayed as if it were real.
        if computed_yield is not None and computed_yield > DIVIDEND_YIELD_SANITY_CAP:
            computed_rate = None
            computed_yield = None

        if computed_rate is not None:
            row["dividend_rate"] = computed_rate
            row["annual_dividend"] = computed_rate * qty
            total_annual_dividend += computed_rate * qty
        if computed_yield is not None:
            row["dividend_yield"] = computed_yield

        rows.append(row)

    total_gain = (total_value - total_cost_basis) if has_cost_basis else None
    total_gain_pct = (total_gain / total_cost_basis * 100) if (has_cost_basis and total_cost_basis) else None
    # Portfolio-level day move: yesterday's value is today's minus the
    # summed per-position dollar move, which is the only basis we can
    # compute a real percentage against.
    prev_total_value = total_value - total_day_gain
    total_day_gain_pct = (
        (total_day_gain / prev_total_value * 100)
        if (has_day_change and prev_total_value) else None
    )

    return {
        "holdings": rows,
        "total_value": total_value,
        "total_cost_basis": total_cost_basis if has_cost_basis else None,
        "total_gain": total_gain,
        "total_gain_pct": total_gain_pct,
        "total_day_gain": total_day_gain if has_day_change else None,
        "total_day_gain_pct": total_day_gain_pct,
        "total_annual_dividend": total_annual_dividend or None,
        "total_dividend_yield": (
            (total_annual_dividend / total_value * 100)
            if (total_annual_dividend and total_value) else None
        ),
        "errors": errors,
    }


# ----------------------------------------------------------------------
# Portfolio value history (for the performance chart)
# ----------------------------------------------------------------------
#
# Same period-then-trim approach used in forex.py/futures.py: fetch via
# `period=` (the reliable yfinance code path) and trim client-side,
# anchored to the latest timestamp actually in the data rather than
# wall-clock "now".
#
# IMPORTANT interpretation note: portfolio.txt records current quantity
# and average cost, not a dated transaction log -- there's no record of
# *when* shares were bought. So this values TODAY's share counts at
# historical prices: "what would this exact basket have been worth back
# then". That's a real, well-defined series (and the standard way tools
# show this without transaction history), but it is NOT the same as the
# realized historical value of the account if positions changed over the
# window. The frontend labels it accordingly rather than implying it's a
# true account-balance history.
PORTFOLIO_RANGE_SPECS = {
    "1d":  {"period": "5d", "interval": "5m", "trim_hours": 24},
    "1w":  {"period": "1mo", "interval": "1h", "trim_days": 7},
    "1mo": {"period": "1mo", "interval": "1d"},
    "3mo": {"period": "3mo", "interval": "1d"},
    "6mo": {"period": "6mo", "interval": "1d"},
    "1y":  {"period": "1y", "interval": "1d"},
    "3y":  {"period": "5y", "interval": "1wk", "trim_days": 365 * 3},
    "5y":  {"period": "5y", "interval": "1wk"},
    "all": {"period": "max", "interval": "1mo"},
}

HISTORY_TTL_SECONDS = 300
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


def get_portfolio_history(range_key="1y"):
    """
    Portfolio value over time: each holding's close price series times its
    current quantity, summed across holdings per timestamp.

    Only timestamps where EVERY held ticker has a price are included --
    partial sums would show fake drops when one ticker's series starts
    later than another's (a newly-listed holding would look like the
    portfolio cratering). Returns {"range", "points": [{date, value}],
    "cost_basis": float|None, "skipped": [tickers with no usable history]}.
    """
    spec = PORTFOLIO_RANGE_SPECS.get(range_key)
    if not spec:
        raise ValueError(f"unknown range {range_key}")

    _ensure_portfolio_file()
    holdings, _ = _parse_portfolio_file()
    if not holdings:
        return {"range": range_key, "points": [], "cost_basis": None, "skipped": []}

    cache_key = (range_key, tuple(sorted((t, q) for t, q, _ in holdings)))
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    series_by_ticker = {}
    skipped = []
    for ticker, qty, _avg in holdings:
        try:
            hist = yf.Ticker(ticker).history(period=spec["period"], interval=spec["interval"])
            if hist.empty or "Close" not in hist.columns:
                raise ValueError("no history")
            closes = hist["Close"].dropna()
            if closes.empty:
                raise ValueError("no closes")
            idx = closes.index
            closes.index = idx.tz_convert("UTC") if idx.tz is not None else idx.tz_localize("UTC")
            # Same ticker listed twice in portfolio.txt should accumulate,
            # not overwrite.
            if ticker in series_by_ticker:
                series_by_ticker[ticker] = series_by_ticker[ticker].add(closes * qty, fill_value=0)
            else:
                series_by_ticker[ticker] = closes * qty
        except Exception as e:
            warn(f"Couldn't fetch history for {ticker} ({e})")
            skipped.append(ticker)

    if not series_by_ticker:
        raise ValueError(f"no usable history for any holding ({range_key})")

    # Align on the union of every ticker's timestamps, then forward-fill.
    # Different tickers' bars don't always land on identical timestamps
    # (intraday especially), so an inner join would throw away most of the
    # series -- or all of it. Forward-filling carries each holding's last
    # known price across its neighbours' timestamps, which is the correct
    # valuation for a moment where that ticker simply hasn't printed a new
    # bar yet.
    #
    # Rows *before* a ticker's first observation stay NaN (ffill has
    # nothing to carry) and are dropped, so a holding whose history starts
    # partway through the window can't make the portfolio look like it
    # cratered before that date -- the chart just starts where all
    # holdings have real data.
    frame = pd.DataFrame(series_by_ticker).sort_index().ffill().dropna(how="any")
    if frame.empty:
        raise ValueError(f"no overlapping history across holdings ({range_key})")

    trim_hours, trim_days = spec.get("trim_hours"), spec.get("trim_days")
    if trim_hours or trim_days:
        cutoff = frame.index.max() - pd.Timedelta(hours=trim_hours or 0, days=trim_days or 0)
        frame = frame[frame.index >= cutoff]
        if frame.empty:
            raise ValueError(f"no history in the trimmed window ({range_key})")

    totals = frame.sum(axis=1)
    points = [
        {"date": ts.isoformat(), "value": float(v)}
        for ts, v in totals.items()
        if pd.notna(v)
    ]

    cost_basis = sum(avg * qty for _t, qty, avg in holdings if avg is not None) or None

    result = {
        "range": range_key, "points": points,
        "cost_basis": cost_basis, "skipped": skipped,
    }
    _cache_set(cache_key, result, HISTORY_TTL_SECONDS)
    return result


def view_portfolio():
    existed = _ensure_portfolio_file()
    if not existed:
        print(f"\nNo portfolio file found — created one at:\n  {PORTFOLIO_FILE}")
        print("Open it, add your holdings as 'TICKER, QUANTITY' (one per line), save, and re-run this option.\n")
        return None

    holdings, errors = _parse_portfolio_file()

    if errors:
        warn(f"{len(errors)} line(s) in portfolio.txt couldn't be read:")
        for e in errors:
            print(f"  - {e}")

    if not holdings:
        print(f"\nNo valid holdings found in:\n  {PORTFOLIO_FILE}")
        print("Add lines like 'AAPL, 10' and try again.\n")
        return None

    log_event(f"Viewing portfolio ({len(holdings)} holdings)")
    print(f"\n===== Portfolio ({len(holdings)} holdings) =====")
    rows = []
    total_value = 0.0

    for ticker, qty, avg_cost in holdings:
        price = None
        prev_close = None
        try:
            info = yf.Ticker(ticker).info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        except Exception as e:
            warn(f"Couldn't fetch {ticker} ({e})")

        if price is None:
            print(f"  {ticker:<8} qty {qty:<10.2f} price N/A (couldn't fetch — check the ticker)")
            continue

        value = price * qty
        total_value += value

        day_change_pct = None
        if prev_close:
            day_change_pct = (price - prev_close) / prev_close * 100

        if day_change_pct is not None:
            color = gradient_color(day_change_pct, neutral=0.0, max_dev=5.0)
            chg_str = f"{color}({day_change_pct:+.2f}%){RESET_COLOR}"
        else:
            chg_str = ""

        print(f"  {ticker:<8} qty {qty:<10.2f} {fmt_money(price):>12}   value {fmt_money(value):>14}  {chg_str}")

        rows.append({
            "ticker": ticker, "qty": qty, "price": price,
            "value": value, "day_change_pct": day_change_pct,
        })

    print(f"\n  Total Portfolio Value: {fmt_money(total_value)}")
    print("=" * 45)
    print()

    log_event(f"Portfolio valued at {fmt_money(total_value)} across {len(rows)} holdings")
    return {"holdings": rows, "total_value": total_value}


if __name__ == "__main__":
    view_portfolio()
