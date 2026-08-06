"""
stock_info.py — current_stock_info()

Pulls Price, PE, forward PE, PEG, P/S, P/B, WACC, Dividend, Dividend yield,
EPS, 52-week range, Cash Per Share, and CAPM for a given ticker.

Primary source is yfinance. A few fields (P/S, P/B, cash per share, PEG) are
recomputed manually when the API's own field is missing or looks unreliable,
and WACC/CAPM are always computed manually since no free API reports them.
"""

import yfinance as yf
from utils import calculate_capm, calculate_wacc, fmt_pct, fmt_num, fmt_money, normalize_pct


def _safe(info, *keys, default=None):
    for k in keys:
        v = info.get(k)
        if v is not None:
            return v
    return default


def current_stock_info(ticker_symbol=None):
    if ticker_symbol is None:
        ticker_symbol = input("Enter stock ticker: ").strip().upper()
    else:
        ticker_symbol = ticker_symbol.strip().upper()

    print(f"\nFetching data for {ticker_symbol}...\n")
    tk = yf.Ticker(ticker_symbol)

    try:
        info = tk.info
    except Exception as e:
        print(f"Error fetching data for {ticker_symbol}: {e}")
        return None

    price = _safe(info, "currentPrice", "regularMarketPrice")
    if not info or price is None:
        print(f"Could not find reliable data for '{ticker_symbol}'. Check the ticker symbol.")
        return None

    pe = _safe(info, "trailingPE")
    forward_pe = _safe(info, "forwardPE")
    peg = _safe(info, "trailingPegRatio", "pegRatio")
    ps = _safe(info, "priceToSalesTrailing12Months")
    pb = _safe(info, "priceToBook")
    dividend_rate = _safe(info, "dividendRate")
    dividend_yield = normalize_pct(_safe(info, "dividendYield"))
    eps = _safe(info, "trailingEps")
    week_low = _safe(info, "fiftyTwoWeekLow")
    week_high = _safe(info, "fiftyTwoWeekHigh")
    total_cash = _safe(info, "totalCash")
    shares_out = _safe(info, "sharesOutstanding")
    beta = _safe(info, "beta")

    # ---- manual fallbacks for fields that are often missing/unreliable ----
    if ps is None:
        market_cap = _safe(info, "marketCap")
        revenue = _safe(info, "totalRevenue")
        if market_cap and revenue:
            ps = market_cap / revenue

    if pb is None:
        book_value = _safe(info, "bookValue")
        if price and book_value:
            pb = price / book_value

    cash_per_share = _safe(info, "totalCashPerShare")
    if cash_per_share is None and total_cash and shares_out:
        cash_per_share = total_cash / shares_out

    if peg is None and pe:
        growth = _safe(info, "earningsGrowth")
        if growth and growth > 0:
            peg = pe / (growth * 100)

    # CAPM / WACC — always computed manually
    capm_value, rf = calculate_capm(beta)
    wacc_value = calculate_wacc(tk, capm_value, rf)

    results = {
        "Price": fmt_money(price),
        "PE Ratio": fmt_num(pe),
        "Forward PE": fmt_num(forward_pe),
        "PEG Ratio": fmt_num(peg),
        "P/S Ratio": fmt_num(ps),
        "P/B Ratio": fmt_num(pb),
        "WACC": fmt_pct(wacc_value),
        "Dividend ($)": fmt_money(dividend_rate) if dividend_rate else "N/A",
        "Dividend Yield": fmt_pct(dividend_yield),
        "EPS (TTM)": fmt_num(eps),
        "52W Range": f"{fmt_money(week_low)} - {fmt_money(week_high)}" if week_low and week_high else "N/A",
        "Cash Per Share": fmt_money(cash_per_share),
        "CAPM (Cost of Equity)": fmt_pct(capm_value),
    }

    _print_table(ticker_symbol, results)
    return results


def _print_table(ticker_symbol, results):
    print(f"===== {ticker_symbol} — Key Metrics =====")
    width = max(len(k) for k in results) + 2
    for k, v in results.items():
        print(f"  {k:<{width}} {v}")
    print("=" * 40)


if __name__ == "__main__":
    current_stock_info()
