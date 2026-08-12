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


def list_watchlist_names():
    _ensure_watchlists_file()
    return list(_parse_watchlists_file().keys())


def add_watchlist(name):
    """Creates a new empty watchlist section if it doesn't already exist."""
    _ensure_watchlists_file()
    watchlists = _parse_watchlists_file()
    name = name.strip()
    if not name or name in watchlists:
        return False
    with open(WATCHLISTS_FILE, "a") as f:
        f.write(f"\n[{name}]\n")
    log_event(f"Created watchlist: {name}")
    return True


def add_ticker(list_name, ticker):
    """Adds a ticker to a watchlist, creating the watchlist first if needed."""
    _ensure_watchlists_file()
    watchlists = _parse_watchlists_file()
    ticker = ticker.strip().upper()
    if not ticker:
        return False
    if list_name not in watchlists:
        add_watchlist(list_name)
    elif ticker in watchlists[list_name]:
        return False  # already there
    with open(WATCHLISTS_FILE, "r") as f:
        lines = f.readlines()

    out = []
    inserted = False
    current = None
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            if current == list_name and not inserted:
                out.append(f"{ticker}\n")
                inserted = True
            current = stripped[1:-1].strip()
        out.append(line)
    if current == list_name and not inserted:
        out.append(f"{ticker}\n")
        inserted = True

    with open(WATCHLISTS_FILE, "w") as f:
        f.writelines(out)
    log_event(f"Added {ticker} to watchlist '{list_name}'")
    return True


def remove_ticker(list_name, ticker):
    """Removes a ticker from a specific watchlist."""
    if not os.path.exists(WATCHLISTS_FILE):
        return False
    ticker = ticker.strip().upper()
    with open(WATCHLISTS_FILE, "r") as f:
        lines = f.readlines()

    out = []
    current = None
    removed = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            current = stripped[1:-1].strip()
            out.append(line)
            continue
        if current == list_name and stripped.upper() == ticker:
            removed = True
            continue
        out.append(line)

    with open(WATCHLISTS_FILE, "w") as f:
        f.writelines(out)
    if removed:
        log_event(f"Removed {ticker} from watchlist '{list_name}'")
    return removed


def get_watchlists_full():
    """
    Data-only variant for API consumers: for every ticker in every
    watchlist, pulls price/change plus company name and trailing PE when
    available (meaningful for stocks; naturally absent for FX/futures/bond
    tickers, which the frontend shows as "--" for).
    """
    _ensure_watchlists_file()
    watchlists = _parse_watchlists_file()

    result = {}
    for name, tickers in watchlists.items():
        rows = []
        for ticker in tickers:
            row = {
                "ticker": ticker, "name": None, "price": None, "change": None,
                "change_pct": None, "pe": None,
            }
            try:
                tk = yf.Ticker(ticker)
                hist = tk.history(period="5d")
                if len(hist) >= 2:
                    last = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2])
                    row["price"] = last
                    row["change"] = last - prev
                    row["change_pct"] = (last - prev) / prev * 100
                try:
                    info = tk.info
                    row["name"] = info.get("longName") or info.get("shortName")
                    row["pe"] = info.get("trailingPE")
                except Exception:
                    pass
            except Exception as e:
                warn(f"Couldn't fetch {ticker} ({e})")
            rows.append(row)
        result[name] = rows
    return result


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
