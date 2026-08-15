"""
watchlist.py — view_watchlists()

Lets the user maintain multiple watchlists by hand-editing a plain text
file (watchlists.txt, created next to this script on first run). Each
watchlist is a bracketed section header followed by one ticker per line:

    [Tech Stocks]
    AAPL
    MSFT
    NVDA

    [Macro]
    EURUSD=X
    GC=F
    ^TNX
    BTC-USD

Any ticker yfinance can resolve works here -- stocks, indexes (^GSPC),
FX pairs (EURUSD=X), futures (GC=F), Treasury yields (^TNX), or crypto
(BTC-USD) -- so one file covers all the asset types in one place rather
than needing a separate mechanism per category.
"""

import os
import yfinance as yf
from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WATCHLISTS_FILE = os.path.join(SCRIPT_DIR, "watchlists.txt")

TEMPLATE = """\
# Caishen watchlists file
# Start a new watchlist with a line like [Watchlist Name], then list one
# ticker per line underneath it. Lines starting with # are ignored.
#
# Works with any ticker yfinance can resolve: stocks (AAPL), indexes
# (^GSPC), FX pairs (EURUSD=X), futures (GC=F), Treasury yields (^TNX),
# or crypto (BTC-USD).
#
# Example:
# [Tech Stocks]
# AAPL
# MSFT
# NVDA
#
# [Macro]
# EURUSD=X
# GC=F
# ^TNX
# BTC-USD
"""


def _ensure_watchlists_file():
    """Returns True if the file already existed, False if it was just created."""
    if not os.path.exists(WATCHLISTS_FILE):
        with open(WATCHLISTS_FILE, "w") as f:
            f.write(TEMPLATE)
        return False
    return True


def _parse_watchlists_file():
    watchlists = {}
    current = None
    with open(WATCHLISTS_FILE, "r") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                current = line[1:-1].strip()
                watchlists.setdefault(current, [])
                continue
            if current is None:
                continue  # ticker line before any [Watchlist Name] header -- skip
            watchlists[current].append(line.upper())
    return watchlists


def _fetch_quote(ticker):
    try:
        hist = yf.Ticker(ticker).history(period="5d")
        if len(hist) < 2:
            raise ValueError("insufficient history")
        last = float(hist["Close"].iloc[-1])
        prev = float(hist["Close"].iloc[-2])
        change_pct = (last - prev) / prev * 100
        return last, change_pct
    except Exception as e:
        warn(f"Couldn't fetch {ticker} ({e})")
        return None, None


def view_watchlists():
    existed = _ensure_watchlists_file()
    if not existed:
        print(f"\nNo watchlists file found — created one at:\n  {WATCHLISTS_FILE}")
        print("Open it, add watchlists with [Name] headers and one ticker per line, save, and re-run this option.\n")
        return None

    watchlists = _parse_watchlists_file()
    if not watchlists:
        print(f"\nNo watchlists found in:\n  {WATCHLISTS_FILE}")
        print("Add a section like '[My List]' followed by tickers and try again.\n")
        return None

    log_event(f"Viewing {len(watchlists)} watchlist(s)")
    all_results = {}

    for name, tickers in watchlists.items():
        if not tickers:
            continue
        print(f"\n===== Watchlist: {name} =====")
        rows = []
        for ticker in tickers:
            last, change_pct = _fetch_quote(ticker)
            if last is None:
                print(f"  {ticker:<12} N/A")
                continue
            sign = "+" if change_pct >= 0 else ""
            color = gradient_color(change_pct, neutral=0.0, max_dev=5.0)
            print(f"  {ticker:<12} {last:>12,.4f}   {color}({sign}{change_pct:.2f}%){RESET_COLOR}")
            rows.append({"ticker": ticker, "last": last, "change_pct": change_pct})
        print("=" * 40)
        all_results[name] = rows

    print()
    log_event("Finished displaying watchlists")
    return all_results


if __name__ == "__main__":
    view_watchlists()