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


def get_portfolio_full():
    """
    Data-only variant for API consumers: adds company name, sector, and
    gain/loss (when avg cost was provided) on top of what view_portfolio()
    prints to the console.
    """
    _ensure_portfolio_file()
    holdings, errors = _parse_portfolio_file()

    rows = []
    total_value = 0.0
    total_cost_basis = 0.0
    has_cost_basis = False

    for ticker, qty, avg_cost in holdings:
        try:
            info = yf.Ticker(ticker).info
        except Exception as e:
            warn(f"Couldn't fetch {ticker} ({e})")
            rows.append({
                "ticker": ticker, "name": None, "sector": None, "qty": qty,
                "avg_cost": avg_cost, "price": None, "value": None,
                "day_change_pct": None, "gain": None, "gain_pct": None,
            })
            continue

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        name = info.get("longName") or info.get("shortName") or ticker
        sector = info.get("sector")

        if price is None:
            rows.append({
                "ticker": ticker, "name": name, "sector": sector, "qty": qty,
                "avg_cost": avg_cost, "price": None, "value": None,
                "day_change_pct": None, "gain": None, "gain_pct": None,
            })
            continue

        value = price * qty
        total_value += value
        day_change_pct = (price - prev_close) / prev_close * 100 if prev_close else None

        gain = gain_pct = cost_basis = None
        if avg_cost is not None:
            cost_basis = avg_cost * qty
            gain = value - cost_basis
            gain_pct = (gain / cost_basis * 100) if cost_basis else None
            total_cost_basis += cost_basis
            has_cost_basis = True

        rows.append({
            "ticker": ticker, "name": name, "sector": sector, "qty": qty,
            "avg_cost": avg_cost, "price": price, "value": value,
            "day_change_pct": day_change_pct, "gain": gain, "gain_pct": gain_pct,
        })

    total_gain = (total_value - total_cost_basis) if has_cost_basis else None
    total_gain_pct = (total_gain / total_cost_basis * 100) if (has_cost_basis and total_cost_basis) else None

    return {
        "holdings": rows,
        "total_value": total_value,
        "total_cost_basis": total_cost_basis if has_cost_basis else None,
        "total_gain": total_gain,
        "total_gain_pct": total_gain_pct,
        "errors": errors,
    }


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
