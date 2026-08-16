"""
stock_info.py — current_stock_info()

Core metrics: Price, PE, forward PE, PEG, P/S, P/B, WACC, Dividend, Dividend
yield, EPS, 52-week range, Cash Per Share, CAPM.

Also pulls (best-effort, skipped gracefully if unavailable): open/previous
close, day range, market cap, volume/avg volume, most recent + next earnings
dates, analyst price targets & recommendation, a set of Yahoo-style
"financial highlights" (profitability, income statement, balance sheet, cash
flow), and a year of price history for later charting. None of this extra
section is critical — if a field can't be pulled it's just omitted rather
than failing the whole call.

Primary source is yfinance. A few core fields (P/S, P/B, cash per share,
PEG) are recomputed manually when the API's own field is missing or looks
unreliable, and WACC/CAPM are always computed manually since no free API
reports them.
"""

import time
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from utils import (
    calculate_capm,
    calculate_wacc,
    fmt_pct,
    fmt_pct_raw,
    fmt_num,
    fmt_money,
    fmt_large_num,
    DEFAULT_MARKET_RISK_PREMIUM,
)
from logger import log_event, log_error


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

    log_event(f"Fetching current stock info for {ticker_symbol}")
    print(f"\nFetching data for {ticker_symbol}...\n")
    tk = yf.Ticker(ticker_symbol)

    try:
        info = tk.info
    except Exception as e:
        log_error(f"Failed to fetch data for {ticker_symbol}", exc=e)
        print(f"Error fetching data for {ticker_symbol}: {e}")
        return None

    price = _safe(info, "currentPrice", "regularMarketPrice")
    if not info or price is None:
        log_error(f"No reliable data found for {ticker_symbol}")
        print(f"Could not find reliable data for '{ticker_symbol}'. Check the ticker symbol.")
        return None

    core = _build_core_metrics(tk, info, price)
    _print_table(f"{ticker_symbol} — Key Metrics", core["display"])

    price_detail = _build_price_detail(info)
    if price_detail["display"]:
        _print_table("Price & Volume", price_detail["display"])

    earnings = _build_earnings_info(tk)
    if earnings["display"]:
        _print_table("Earnings Dates", earnings["display"])

    analyst = _build_analyst_info(info)
    if analyst["display"]:
        _print_table("Analyst Info", analyst["display"])

    highlights = _build_financial_highlights(info)
    if highlights["display"]:
        _print_table("Financial Highlights", highlights["display"])

    price_history = _get_price_history(tk)

    log_event(f"Fetched current stock info for {ticker_symbol} (price={fmt_money(price)})")
    return {
        "ticker": ticker_symbol,
        "core": core["raw"],
        "price_detail": price_detail["raw"],
        "earnings": earnings["raw"],
        "analyst": analyst["raw"],
        "financial_highlights": highlights["raw"],
        "price_history": price_history,  # kept for later charting, not printed
    }


# ----------------------------------------------------------------------
# Core metrics (always shown)
# ----------------------------------------------------------------------

def _build_core_metrics(tk, info, price):
    pe = _safe(info, "trailingPE")
    forward_pe = _safe(info, "forwardPE")
    peg = _safe(info, "trailingPegRatio", "pegRatio")
    ps = _safe(info, "priceToSalesTrailing12Months")
    pb = _safe(info, "priceToBook")
    dividend_rate = _safe(info, "dividendRate")
    # yfinance returns dividendYield already scaled as a percent (e.g. 0.44
    # meaning 0.44%, not a 0.44 fraction) -- format with fmt_pct_raw, which
    # doesn't re-multiply by 100.
    dividend_yield = _safe(info, "dividendYield")
    eps = _safe(info, "trailingEps")
    week_low = _safe(info, "fiftyTwoWeekLow")
    week_high = _safe(info, "fiftyTwoWeekHigh")
    total_cash = _safe(info, "totalCash")
    shares_out = _safe(info, "sharesOutstanding")
    beta = _safe(info, "beta")

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

    capm_value, rf = calculate_capm(beta)
    wacc_value = calculate_wacc(tk, capm_value, rf)

    name = _safe(info, "longName", "shortName")
    prev_close_for_change = _safe(info, "previousClose", "regularMarketPreviousClose")
    change = _safe(info, "regularMarketChange")
    change_pct = _safe(info, "regularMarketChangePercent")
    if change is None and prev_close_for_change and price:
        change = price - prev_close_for_change
    if change_pct is None and prev_close_for_change and price:
        change_pct = (price - prev_close_for_change) / prev_close_for_change * 100

    raw = {
        "name": name, "price": price, "change": change, "change_pct": change_pct,
        "pe": pe, "forward_pe": forward_pe, "peg": peg,
        "ps": ps, "pb": pb, "wacc": wacc_value, "dividend_rate": dividend_rate,
        "dividend_yield": dividend_yield, "eps": eps, "week_low": week_low,
        "week_high": week_high, "cash_per_share": cash_per_share,
        "capm": capm_value, "beta": beta, "risk_free_rate": rf,
    }

    display = {
        "Price": fmt_money(price),
        "PE Ratio": fmt_num(pe),
        "Forward PE": fmt_num(forward_pe),
        "PEG Ratio": fmt_num(peg),
        "P/S Ratio": fmt_num(ps),
        "P/B Ratio": fmt_num(pb),
        "WACC": fmt_pct(wacc_value),
        "Dividend ($)": fmt_money(dividend_rate) if dividend_rate else "N/A",
        "Dividend Yield": fmt_pct_raw(dividend_yield),
        "EPS (TTM)": fmt_num(eps),
        "52W Range": f"{fmt_money(week_low)} - {fmt_money(week_high)}" if week_low and week_high else "N/A",
        "Cash Per Share": fmt_money(cash_per_share),
        "CAPM (Cost of Equity)": fmt_pct(capm_value),
    }
    return {"raw": raw, "display": display}


# ----------------------------------------------------------------------
# Price / volume detail
# ----------------------------------------------------------------------

def _build_price_detail(info):
    open_price = _safe(info, "open", "regularMarketOpen")
    prev_close = _safe(info, "previousClose", "regularMarketPreviousClose")
    day_low = _safe(info, "dayLow", "regularMarketDayLow")
    day_high = _safe(info, "dayHigh", "regularMarketDayHigh")
    market_cap = _safe(info, "marketCap")
    volume = _safe(info, "volume", "regularMarketVolume")
    avg_volume = _safe(info, "averageVolume", "averageVolume10days")

    raw = {
        "open": open_price, "previous_close": prev_close, "day_low": day_low,
        "day_high": day_high, "market_cap": market_cap, "volume": volume,
        "avg_volume": avg_volume,
    }

    display = {}
    if open_price is not None:
        display["Open"] = fmt_money(open_price)
    if prev_close is not None:
        display["Previous Close"] = fmt_money(prev_close)
    if day_low is not None and day_high is not None:
        display["Day Range"] = f"{fmt_money(day_low)} - {fmt_money(day_high)}"
    if market_cap is not None:
        display["Market Cap"] = fmt_large_num(market_cap)
    if volume is not None:
        display["Volume"] = fmt_large_num(volume, is_money=False)
    if avg_volume is not None:
        display["Avg Volume"] = fmt_large_num(avg_volume, is_money=False)

    return {"raw": raw, "display": display}


# ----------------------------------------------------------------------
# Earnings dates
# ----------------------------------------------------------------------

def _build_earnings_info(tk):
    """
    Most recent (past) and next (future) earnings date, with EPS
    estimate/actual/surprise when yfinance has them. Dates near-term are
    usually accurate; dates far in the future are frequently still
    provisional/unconfirmed by the company, so treat "next earnings" as an
    estimate rather than a confirmed date.
    """
    raw = {"most_recent": None, "next": None}
    display = {}
    try:
        edf = tk.get_earnings_dates(limit=12)
        if edf is None or edf.empty:
            return {"raw": raw, "display": display}

        edf = edf.sort_index()
        import pandas as pd
        today = pd.Timestamp.now(tz=edf.index.tz)

        past = edf[edf.index <= today]
        future = edf[edf.index > today]

        if not past.empty:
            row = past.iloc[-1]
            date = past.index[-1]
            raw["most_recent"] = {
                "date": date,
                "eps_estimate": row.get("EPS Estimate"),
                "eps_actual": row.get("Reported EPS"),
                "surprise_pct": row.get("Surprise(%)"),
            }
            parts = [f"{date.date()}"]
            if row.get("Reported EPS") is not None and pd.notna(row.get("Reported EPS")):
                parts.append(f"Actual EPS ${row['Reported EPS']:.2f}")
            if row.get("Surprise(%)") is not None and pd.notna(row.get("Surprise(%)")):
                parts.append(f"Surprise {row['Surprise(%)']:.1f}%")
            display["Most Recent Earnings"] = " | ".join(parts)

        if not future.empty:
            row = future.iloc[0]
            date = future.index[0]
            raw["next"] = {"date": date, "eps_estimate": row.get("EPS Estimate")}
            parts = [f"{date.date()}"]
            if row.get("EPS Estimate") is not None and pd.notna(row.get("EPS Estimate")):
                parts.append(f"Est. EPS ${row['EPS Estimate']:.2f}")
            display["Next Earnings (est.)"] = " | ".join(parts)

    except Exception:
        pass  # earnings dates are a nice-to-have, not critical

    return {"raw": raw, "display": display}


# ----------------------------------------------------------------------
# Analyst info
# ----------------------------------------------------------------------

def _build_analyst_info(info):
    target_mean = _safe(info, "targetMeanPrice")
    target_high = _safe(info, "targetHighPrice")
    target_low = _safe(info, "targetLowPrice")
    recommendation = _safe(info, "recommendationKey")
    num_analysts = _safe(info, "numberOfAnalystOpinions")

    raw = {
        "target_mean": target_mean, "target_high": target_high,
        "target_low": target_low, "recommendation": recommendation,
        "num_analysts": num_analysts,
    }

    display = {}
    if target_mean is not None:
        display["Analyst Target (mean)"] = fmt_money(target_mean)
    if target_low is not None and target_high is not None:
        display["Analyst Target Range"] = f"{fmt_money(target_low)} - {fmt_money(target_high)}"
    if recommendation:
        display["Recommendation"] = str(recommendation).replace("_", " ").title()
    if num_analysts is not None:
        display["# of Analysts"] = str(int(num_analysts))

    return {"raw": raw, "display": display}


# ----------------------------------------------------------------------
# Financial highlights (Yahoo "Statistics"-style summary)
# ----------------------------------------------------------------------

def _build_financial_highlights(info):
    # profitMargins/operatingMargins/returnOnAssets/returnOnEquity/revenueGrowth/
    # earningsGrowth are genuine fractions from yfinance (e.g. 0.243 for
    # 24.3%, or 1.5 for a legitimate 150% ROE) -- use fmt_pct directly rather
    # than trying to guess-rescale, since ROE/growth can exceed 100%
    # entirely validly and a ">1 means already-percent" heuristic misreads
    # that as a scaling issue.
    profit_margin = _safe(info, "profitMargins")
    operating_margin = _safe(info, "operatingMargins")
    roa = _safe(info, "returnOnAssets")
    roe = _safe(info, "returnOnEquity")

    revenue = _safe(info, "totalRevenue")
    revenue_per_share = _safe(info, "revenuePerShare")
    qtr_rev_growth = _safe(info, "revenueGrowth")
    gross_profit = _safe(info, "grossProfits")
    ebitda = _safe(info, "ebitda")
    net_income = _safe(info, "netIncomeToCommon")
    diluted_eps = _safe(info, "trailingEps")
    eps_growth = _safe(info, "earningsGrowth")

    total_cash = _safe(info, "totalCash")
    total_debt = _safe(info, "totalDebt")
    debt_to_equity = _safe(info, "debtToEquity")
    current_ratio = _safe(info, "currentRatio")
    book_value_per_share = _safe(info, "bookValue")

    operating_cashflow = _safe(info, "operatingCashflow")
    levered_fcf = _safe(info, "freeCashflow")

    raw = {
        "profit_margin": profit_margin, "operating_margin": operating_margin,
        "return_on_assets": roa, "return_on_equity": roe, "revenue": revenue,
        "revenue_per_share": revenue_per_share, "quarterly_revenue_growth": qtr_rev_growth,
        "gross_profit": gross_profit, "ebitda": ebitda, "net_income": net_income,
        "diluted_eps": diluted_eps, "eps_growth": eps_growth,
        "total_cash": total_cash, "total_debt": total_debt,
        "debt_to_equity": debt_to_equity, "current_ratio": current_ratio,
        "book_value_per_share": book_value_per_share,
        "operating_cashflow": operating_cashflow, "levered_free_cashflow": levered_fcf,
    }

    display = {}
    if profit_margin is not None:
        display["Profit Margin"] = fmt_pct(profit_margin)
    if operating_margin is not None:
        display["Operating Margin"] = fmt_pct(operating_margin)
    if roa is not None:
        display["Return on Assets"] = fmt_pct(roa)
    if roe is not None:
        display["Return on Equity"] = fmt_pct(roe)
    if revenue is not None:
        display["Revenue (TTM)"] = fmt_large_num(revenue)
    if revenue_per_share is not None:
        display["Revenue Per Share (TTM)"] = fmt_money(revenue_per_share)
    if qtr_rev_growth is not None:
        display["Qtrly Revenue Growth (YoY)"] = fmt_pct(qtr_rev_growth)
    if gross_profit is not None:
        display["Gross Profit (TTM)"] = fmt_large_num(gross_profit)
    if ebitda is not None:
        display["EBITDA (TTM)"] = fmt_large_num(ebitda)
    if net_income is not None:
        display["Net Income (TTM)"] = fmt_large_num(net_income)
    if diluted_eps is not None:
        display["Diluted EPS (TTM)"] = fmt_num(diluted_eps)
    if eps_growth is not None:
        display["EPS Growth (YoY)"] = fmt_pct(eps_growth)
    if total_cash is not None:
        display["Total Cash"] = fmt_large_num(total_cash)
    if total_debt is not None:
        display["Total Debt"] = fmt_large_num(total_debt)
    if debt_to_equity is not None:
        display["Debt / Equity"] = fmt_num(debt_to_equity)
    if current_ratio is not None:
        display["Current Ratio"] = fmt_num(current_ratio)
    if book_value_per_share is not None:
        display["Book Value / Share"] = fmt_money(book_value_per_share)
    if operating_cashflow is not None:
        display["Operating Cash Flow"] = fmt_large_num(operating_cashflow)
    if levered_fcf is not None:
        display["Levered Free Cash Flow"] = fmt_large_num(levered_fcf)

    return {"raw": raw, "display": display}


# ----------------------------------------------------------------------
# Price history (for later charting — not printed)
# ----------------------------------------------------------------------

def _get_price_history(tk, period="1y"):
    try:
        hist = tk.history(period=period)
        return hist if not hist.empty else None
    except Exception:
        return None


# ----------------------------------------------------------------------
# Printing
# ----------------------------------------------------------------------

def _print_table(title, display_dict):
    if not display_dict:
        return

    label_width = max(len(k) for k in display_dict) + 2
    lines = [f"  {k:<{label_width}} {v}" for k, v in display_dict.items()]
    content_width = max((len(line) for line in lines), default=0)

    title_str = f" {title} "
    total_width = max(content_width, len(title_str) + 2)

    pad = total_width - len(title_str)
    left = pad // 2
    right = pad - left

    top = "=" * left + title_str + "=" * right
    bottom = "=" * total_width

    print(top)
    for line in lines:
        print(line)
    print(bottom)
    print()


def get_stock_data_full(ticker_symbol):
    """
    Data-only variant for API consumers: same underlying fetch as
    current_stock_info(), but returns a single flat, frontend-shaped dict
    instead of printing console tables. Percent-like fields are
    pre-formatted here (e.g. "9.20%") since the frontend's StockInfo card
    was built expecting ready-to-display strings for those.
    """
    ticker_symbol = ticker_symbol.strip().upper()
    log_event(f"Fetching stock data (full) for {ticker_symbol}")
    tk = yf.Ticker(ticker_symbol)

    try:
        info = tk.info
    except Exception as e:
        log_error(f"Failed to fetch data for {ticker_symbol}", exc=e)
        return None

    price = _safe(info, "currentPrice", "regularMarketPrice")
    if not info or price is None:
        log_error(f"No reliable data found for {ticker_symbol}")
        return None

    core = _build_core_metrics(tk, info, price)["raw"]
    price_detail = _build_price_detail(info)["raw"]
    # Already computed for the CLI's tables but never surfaced to the API
    # until now -- profit margin, ROA/ROE, revenue, cash and leverage all
    # come straight out of here rather than being re-derived.
    fin = _build_financial_highlights(info)["raw"]

    return {
        "ticker": ticker_symbol,
        "name": core["name"] or ticker_symbol,
        "price": price,
        "change": core["change"],
        "changePct": core["change_pct"],
        "pe": core["pe"],
        "forwardPe": core["forward_pe"],
        "peg": core["peg"],
        "ps": core["ps"],
        "pb": core["pb"],
        "wacc": fmt_pct(core["wacc"]),
        "capm": fmt_pct(core["capm"]),
        "dividend": core["dividend_rate"],
        "dividendYield": fmt_pct_raw(core["dividend_yield"]),
        "eps": core["eps"],
        "week52High": core["week_high"],
        "week52Low": core["week_low"],
        "cashPerShare": core["cash_per_share"],
        "beta": core["beta"],
        "marketCap": fmt_large_num(price_detail["market_cap"], is_money=False),
        "rf": fmt_pct(core["risk_free_rate"]),
        "erp": fmt_pct(DEFAULT_MARKET_RISK_PREMIUM),

        # -- trading --
        "volume": _safe(info, "volume", "regularMarketVolume"),
        "avgVolume": _safe(info, "averageVolume"),

        # -- dividend dates --
        # Two genuinely different dates that get conflated constantly:
        # exDividendDate is the cutoff you must own the stock by,
        # dividendDate is when the cash actually lands. Both are epoch
        # seconds from yfinance; converted to ISO here so the frontend
        # never has to know that.
        "exDividendDate": _epoch_to_date(_safe(info, "exDividendDate")),
        "dividendDate": _epoch_to_date(_safe(info, "dividendDate")),

        # -- profitability --
        # Fractions from yfinance (0.243 = 24.3%). Left raw rather than
        # pre-formatted: ROE especially can legitimately exceed 100%, and
        # the frontend needs the number to colour it.
        "profitMargin": fin["profit_margin"],
        "operatingMargin": fin["operating_margin"],
        "returnOnAssets": fin["return_on_assets"],
        "returnOnEquity": fin["return_on_equity"],

        # -- balance sheet / income --
        "revenue": fin["revenue"],
        "totalCash": fin["total_cash"],
        "totalDebt": fin["total_debt"],
        # yfinance reports debtToEquity as a percentage-style number
        # (e.g. 154.5 meaning 1.545x), not a ratio -- passed through as-is
        # and labelled accordingly rather than silently rescaled.
        "debtToEquity": fin["debt_to_equity"],
        "netIncome": fin["net_income"],
        "ebitda": fin["ebitda"],
    }


def _epoch_to_date(value):
    """Epoch seconds -> "YYYY-MM-DD", or None. yfinance hands back Unix
    timestamps for the dividend dates; anything unparseable becomes None
    rather than a misleading 1970 date."""
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def get_quote(ticker_symbol):
    """
    Lightweight lookup used by features that just need price/EPS/name (the
    Projector's base numbers, enriching a newly-added Watchlist ticker) --
    skips the WACC/CAPM/earnings-date/financial-highlights work that
    current_stock_info() does, since none of that is needed here.
    """
    ticker_symbol = ticker_symbol.strip().upper()
    tk = yf.Ticker(ticker_symbol)
    try:
        info = tk.info
    except Exception:
        return None

    price = _safe(info, "currentPrice", "regularMarketPrice")
    if not info or price is None:
        return None

    prev_close = _safe(info, "previousClose", "regularMarketPreviousClose")
    change = _safe(info, "regularMarketChange")
    change_pct = _safe(info, "regularMarketChangePercent")
    if change is None and prev_close and price:
        change = price - prev_close
    if change_pct is None and prev_close and price:
        change_pct = (price - prev_close) / prev_close * 100

    return {
        "ticker": ticker_symbol,
        "name": _safe(info, "longName", "shortName", default=ticker_symbol),
        "price": price,
        "change": change,
        "change_pct": change_pct,
        "pe": _safe(info, "trailingPE"),
        "eps": _safe(info, "trailingEps") or _safe(info, "forwardEps"),
    }


if __name__ == "__main__":
    current_stock_info()


# ----------------------------------------------------------------------
# Price history (for the Stock Info chart)
# ----------------------------------------------------------------------
#
# Same period-then-trim approach as forex.py/futures.py/portfolio.py:
# fetch with `period=` (the reliable yfinance code path -- `start=`/`end=`
# returns empty for intraday) and trim client-side, anchored to the LATEST
# timestamp actually present in the data rather than wall-clock "now".
# Yahoo's feed can lag real time, and markets close, so "the last 1h"
# means the last hour *of data that exists*.

STOCK_RANGE_SPECS = {
    "1d":  {"period": "5d",  "interval": "5m",  "trim_hours": 24},
    "1w":  {"period": "1mo", "interval": "1h",  "trim_days": 7},
    "1mo": {"period": "3mo", "interval": "1d",  "trim_days": 31},
    "3mo": {"period": "3mo", "interval": "1d"},
    "6mo": {"period": "6mo", "interval": "1d"},
    "1y":  {"period": "1y",  "interval": "1d"},
    "3y":  {"period": "5y",  "interval": "1wk", "trim_days": 365 * 3},
    "5y":  {"period": "5y",  "interval": "1wk"},
    "all": {"period": "max", "interval": "1mo"},
}

STOCK_HISTORY_TTL_SECONDS = 300  # charts, not live quotes
_stock_history_cache = {}


def _stock_cache_get(key):
    entry = _stock_history_cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() >= expires_at:
        del _stock_history_cache[key]
        return None
    return value


def _stock_cache_set(key, value, ttl_seconds):
    _stock_history_cache[key] = (value, time.monotonic() + ttl_seconds)


def get_stock_history(ticker_symbol, range_key="1y"):
    """
    {"ticker", "range", "points": [{date (ISO), value}]} -- real closes
    only. No interpolation or gap filling: whatever bars yfinance returns
    are what gets charted, weekends and holidays included as gaps.
    """
    spec = STOCK_RANGE_SPECS.get(range_key)
    if not spec:
        raise ValueError(f"unknown range {range_key}")
    ticker_symbol = ticker_symbol.strip().upper()

    cache_key = (ticker_symbol, range_key)
    cached = _stock_cache_get(cache_key)
    if cached is not None:
        return cached

    hist = yf.Ticker(ticker_symbol).history(
        period=spec["period"], interval=spec["interval"],
    )
    if hist.empty:
        raise ValueError(f"no history returned for {ticker_symbol} ({range_key})")

    trim_hours, trim_days = spec.get("trim_hours"), spec.get("trim_days")
    if trim_hours or trim_days:
        idx = hist.index
        idx_utc = idx.tz_convert("UTC") if idx.tz is not None else idx.tz_localize("UTC")
        cutoff = idx_utc.max() - pd.Timedelta(hours=trim_hours or 0, days=trim_days or 0)
        hist = hist[idx_utc >= cutoff]
        if hist.empty:
            raise ValueError(f"no history in the trimmed window for {ticker_symbol} ({range_key})")

    points = [
        {"date": idx.isoformat(), "value": float(row["Close"])}
        for idx, row in hist.iterrows()
        if pd.notna(row["Close"])
    ]
    if not points:
        raise ValueError(f"no usable close prices for {ticker_symbol} ({range_key})")

    result = {"ticker": ticker_symbol, "range": range_key, "points": points}
    _stock_cache_set(cache_key, result, STOCK_HISTORY_TTL_SECONDS)
    return result


# ----------------------------------------------------------------------
# Analyst insights
# ----------------------------------------------------------------------
#
# Three separate yfinance surfaces, deliberately kept independent: any one
# of them can be missing for a given ticker (small caps, ADRs, ETFs) and
# the other two should still render. Each comes back as None rather than
# an empty shell, so the frontend can hide the panel instead of drawing an
# empty chart that looks like "zero analysts".

# yfinance's upgrades_downgrades Action codes -> readable text.
_GRADE_ACTIONS = {
    "up": "Upgrades", "down": "Downgrades", "main": "Maintains",
    "init": "Initiates", "reit": "Reiterates",
}


def _num_or_none(v):
    """float(v) unless it's None/NaN/non-numeric."""
    try:
        if v is None or pd.isna(v):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _price_targets(tk, info):
    """{current, low, mean, median, high} -- the Analyst Price Targets bar.

    Prefers tk.analyst_price_targets (a dedicated endpoint that also
    carries `current`), falling back to the target* fields on .info, which
    are the same numbers sourced from the quote summary.
    """
    raw = {}
    try:
        raw = tk.analyst_price_targets or {}
    except Exception:
        raw = {}

    out = {
        "current": _num_or_none(raw.get("current")) or _safe(info, "currentPrice", "regularMarketPrice"),
        "low": _num_or_none(raw.get("low")) or _safe(info, "targetLowPrice"),
        "mean": _num_or_none(raw.get("mean")) or _safe(info, "targetMeanPrice"),
        "median": _num_or_none(raw.get("median")) or _safe(info, "targetMedianPrice"),
        "high": _num_or_none(raw.get("high")) or _safe(info, "targetHighPrice"),
    }
    # Without a low/high there's no bar to draw, and without a mean
    # there's nothing to mark on it.
    if out["low"] is None or out["high"] is None or out["mean"] is None:
        return None
    return out


def _recommendation_trend(tk):
    """[{period, strong_buy, buy, hold, sell, strong_sell, total}] oldest
    first -- the monthly stacked bars.

    yfinance labels periods relative to now ("0m" = current month, "-1m" =
    last month...), which is meaningless on a chart axis, so they're
    reversed into chronological order and left as-is for the frontend to
    label.
    """
    try:
        df = tk.recommendations
    except Exception:
        return None
    if df is None or len(df) == 0:
        return None

    rows = []
    for _, r in df.iterrows():
        def col(name):
            v = r.get(name)
            n = _num_or_none(v)
            return int(n) if n is not None else 0
        entry = {
            "period": str(r.get("period", "")),
            "strong_buy": col("strongBuy"),
            "buy": col("buy"),
            "hold": col("hold"),
            "sell": col("sell"),
            "strong_sell": col("strongSell"),
        }
        entry["total"] = (
            entry["strong_buy"] + entry["buy"] + entry["hold"]
            + entry["sell"] + entry["strong_sell"]
        )
        # A period with no analysts at all is a hole in the data, not a
        # real "zero rating" -- dropping it beats drawing an empty column.
        if entry["total"] > 0:
            rows.append(entry)

    if not rows:
        return None
    # "0m" (current) comes first from yfinance; charts read left-to-right
    # oldest-to-newest.
    return list(reversed(rows))


def _latest_ratings(tk, limit=6):
    """[{date, firm, action, to_grade, from_grade}] most recent first.

    Note on scope: Yahoo's own "Latest Rating" card also shows a price
    target change ("79 -> 85"). yfinance's upgrades_downgrades table
    carries no price-target columns, so that row is genuinely unavailable
    here rather than omitted by choice -- see the frontend's footnote.
    """
    try:
        df = tk.upgrades_downgrades
    except Exception:
        return None
    if df is None or len(df) == 0:
        return None

    df = df.sort_index(ascending=False).head(limit)
    rows = []
    for idx, r in df.iterrows():
        try:
            date = idx.date().isoformat()
        except Exception:
            date = str(idx)
        action = str(r.get("Action", "") or "")
        rows.append({
            "date": date,
            "firm": str(r.get("Firm", "") or "") or None,
            "action": _GRADE_ACTIONS.get(action.lower(), action.title() or None),
            "to_grade": str(r.get("ToGrade", "") or "") or None,
            "from_grade": str(r.get("FromGrade", "") or "") or None,
        })
    return rows or None


def get_analyst_insights(ticker_symbol):
    """Everything behind the Stock Info page's Analyst Insights section."""
    ticker_symbol = ticker_symbol.strip().upper()
    log_event(f"Fetching analyst insights for {ticker_symbol}")
    tk = yf.Ticker(ticker_symbol)
    try:
        info = tk.info or {}
    except Exception:
        info = {}

    recommendation = _safe(info, "recommendationKey")
    return {
        "ticker": ticker_symbol,
        "price_targets": _price_targets(tk, info),
        "recommendations": _recommendation_trend(tk),
        "latest_ratings": _latest_ratings(tk),
        "recommendation": str(recommendation).replace("_", " ").title() if recommendation else None,
        "num_analysts": _safe(info, "numberOfAnalystOpinions"),
    }
