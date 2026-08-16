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

# Above this, a computed dividend yield is treated as untrustworthy data
# noise (stale/mismatched yfinance fields, one-time distributions counted
# as dividends) rather than a real number worth displaying -- see usage
# in get_watchlists_full(). Kept in sync with portfolio.py's constant of
# the same name.
DIVIDEND_YIELD_SANITY_CAP = 25

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
    watchlist, pulls price/change plus company name, valuation ratios,
    dividend detail and 52-week range when available (meaningful for
    stocks; naturally absent for FX/futures/bond tickers, which the
    frontend shows "--" for).

    Every field is a real yfinance value -- anything unavailable for a
    given ticker stays null rather than being estimated.
    """
    _ensure_watchlists_file()
    watchlists = _parse_watchlists_file()

    result = {}
    for name, tickers in watchlists.items():
        rows = []
        for ticker in tickers:
            row = {
                "ticker": ticker, "name": None, "price": None, "change": None,
                "change_pct": None, "pe": None, "forward_pe": None, "peg": None,
                "ps": None, "pb": None, "beta": None, "eps": None,
                "market_cap": None, "dividend_yield": None, "dividend_rate": None,
                "week52_high": None, "week52_low": None,
                "volume": None, "avg_volume": None, "sector": None,
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
                    row["sector"] = info.get("sector")
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

                    # Same normalization as portfolio.py: dividendRate
                    # ($/share/yr) is unambiguous, dividendYield isn't
                    # consistently a fraction vs. a percent across tickers.
                    price = row["price"] or info.get("currentPrice") or info.get("regularMarketPrice")
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

                    # Sanity cap -- see DIVIDEND_YIELD_SANITY_CAP above.
                    # yfinance's dividendRate can be stale/split-mismatched
                    # against the current price, or a one-time capital-gains
                    # distribution can get counted as a dividend and
                    # annualized, producing an implausible number (e.g. a
                    # leveraged ETF showing a "58% yield"). Null it out
                    # rather than display something misleading.
                    if computed_yield is not None and computed_yield > DIVIDEND_YIELD_SANITY_CAP:
                        computed_rate = None
                        computed_yield = None

                    if computed_rate is not None:
                        row["dividend_rate"] = computed_rate
                    if computed_yield is not None:
                        row["dividend_yield"] = computed_yield
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
