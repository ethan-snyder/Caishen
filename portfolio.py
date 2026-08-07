"""
portfolio.py — view_portfolio()

Lets the user maintain a simple portfolio by hand-editing a plain text file
(portfolio.txt, created next to this script on first run) with one holding
per line:

    TICKER, QUANTITY

Lines starting with # are treated as comments. This module reads the file,
pulls a live price for each ticker via yfinance, and prints a valued summary
(per-position value, day change, and a total).
"""

import os
import yfinance as yf
from utils import fmt_money, gradient_color, RESET_COLOR

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_FILE = os.path.join(SCRIPT_DIR, "portfolio.txt")

TEMPLATE = """\
# Caishen portfolio file
# One holding per line: TICKER, QUANTITY
# Lines starting with # are ignored.
#
# Edit this file directly (in any text editor), save it, then re-run the
# Portfolio option from the Caishen menu to see it valued.
#
# Example:
# AAPL, 10
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
            if len(parts) != 2:
                errors.append(f"Line {lineno}: expected 'TICKER, QUANTITY', got {raw_line!r}")
                continue
            ticker, qty_str = parts
            if not ticker:
                errors.append(f"Line {lineno}: missing ticker")
                continue
            try:
                qty = float(qty_str)
            except ValueError:
                errors.append(f"Line {lineno}: quantity '{qty_str}' isn't a number")
                continue
            holdings.append((ticker.upper(), qty))
    return holdings, errors


def view_portfolio():
    existed = _ensure_portfolio_file()
    if not existed:
        print(f"\nNo portfolio file found — created one at:\n  {PORTFOLIO_FILE}")
        print("Open it, add your holdings as 'TICKER, QUANTITY' (one per line), save, and re-run this option.\n")
        return None

    holdings, errors = _parse_portfolio_file()

    if errors:
        print(f"\n[warn] {len(errors)} line(s) in portfolio.txt couldn't be read:")
        for e in errors:
            print(f"  - {e}")

    if not holdings:
        print(f"\nNo valid holdings found in:\n  {PORTFOLIO_FILE}")
        print("Add lines like 'AAPL, 10' and try again.\n")
        return None

    print(f"\n===== Portfolio ({len(holdings)} holdings) =====")
    rows = []
    total_value = 0.0

    for ticker, qty in holdings:
        price = None
        prev_close = None
        try:
            info = yf.Ticker(ticker).info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        except Exception:
            pass

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

    return {"holdings": rows, "total_value": total_value}


if __name__ == "__main__":
    view_portfolio()