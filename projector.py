"""
projector.py — projector()

Walks the user through bear/base/bull assumptions (PE ratio + expected EPS)
for each of the next 3 calendar years, and maps out the implied stock price
each year using Price = EPS x PE.
"""

import datetime
import yfinance as yf
from logger import log_event


def _prompt_float(prompt_text):
    while True:
        raw = input(prompt_text).strip().replace("%", "").replace("$", "")
        try:
            return float(raw)
        except ValueError:
            print("  Please enter a valid number.")


def _get_starting_eps(ticker_symbol):
    tk = yf.Ticker(ticker_symbol)
    try:
        info = tk.info
    except Exception:
        return None, None
    eps = info.get("trailingEps") or info.get("forwardEps")
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    return eps, price


def projector():
    ticker_symbol = input("Enter stock ticker: ").strip().upper()
    log_event(f"Running price projector for {ticker_symbol}")
    starting_eps, current_price = _get_starting_eps(ticker_symbol)

    if starting_eps is not None:
        price_str = f"${current_price:,.2f}" if current_price else "N/A"
        print(f"\nCurrent price: {price_str} | Current EPS (TTM): ${starting_eps:.2f}")
    else:
        print(f"Could not auto-fetch current EPS for {ticker_symbol}; that's fine, just for reference.")

    current_year = datetime.date.today().year
    target_years = [current_year + 1, current_year + 2, current_year + 3]

    scenarios = ["Bear", "Base", "Bull"]
    projections = {s: [] for s in scenarios}

    for scenario in scenarios:
        print(f"\n--- {scenario} Case ---")
        for year in target_years:
            print(f" {year}:")
            pe = _prompt_float("   Expected PE ratio: ")
            eps = _prompt_float("   Expected EPS (TTM): ")
            price = eps * pe
            projections[scenario].append({"year": year, "pe": pe, "eps": eps, "price": price})

    _print_projection_table(ticker_symbol, current_price, projections, target_years)
    log_event(f"Completed price projection for {ticker_symbol} ({target_years[0]}-{target_years[-1]})")
    return projections


def _print_projection_table(ticker_symbol, current_price, projections, target_years):
    span = f"{target_years[0]}-{target_years[-1]}"
    print(f"\n===== {ticker_symbol} — {span} Price Projection =====")
    if current_price:
        print(f"Current Price: ${current_price:,.2f}")
    for scenario, years in projections.items():
        print(f"\n{scenario} Case:")
        for y in years:
            print(f"  {y['year']}: EPS (TTM) ${y['eps']:.2f}  x  PE {y['pe']:.1f}  =  ${y['price']:,.2f}")
    print("\n" + "=" * 45)


if __name__ == "__main__":
    projector()