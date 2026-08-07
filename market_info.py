"""
market_info.py — market_info()

Pulls major index levels (via yfinance) plus three broad sentiment gauges:
CNN Fear & Greed Index, CBOE put/call ratio, and the AAII weekly investor
sentiment survey.

Beyond just printing a summary, this also assembles and RETURNS the
underlying time-series data behind each of these (index price history, the
CNN Fear & Greed component breakdown + 1-year history, the full AAII
historical sentiment spreadsheet) so it's available later for recreating
each source's own charts, without a second round of fetching.

Fear & Greed and put/call are unofficial/scraped sources with no public API
and can change format without notice. AAII's data comes straight from their
official downloadable spreadsheet, which is sturdier, but the parsing here
is still defensive (matches columns by name rather than position) in case
they adjust the sheet layout.
"""

import re
import io
import yfinance as yf
import requests
import pandas as pd

INDEXES = {
    "Dow Jones (DJI)": "^DJI",
    "NASDAQ": "^IXIC",
    "S&P 500": "^GSPC",
    "Russell 2000": "^RUT",
    "Nikkei 225": "^N225",
    "KOSPI": "^KS11",
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

AAII_XLS_URL = "https://www.aaii.com/files/surveys/sentiment.xls"


# ----------------------------------------------------------------------
# Major indexes
# ----------------------------------------------------------------------

def _get_index_data(period="1y"):
    """
    Returns {name: (last_price, change_pct, history_df)}. A full 1y history
    is kept (not just the last close) so it can be charted later without a
    second call.
    """
    results = {}
    for name, symbol in INDEXES.items():
        try:
            hist = yf.Ticker(symbol).history(period=period)
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[name] = {"last": last, "change_pct": change_pct, "history": hist}
        except Exception:
            results[name] = {"last": None, "change_pct": None, "history": None}
    return results


# ----------------------------------------------------------------------
# CNN Fear & Greed Index
# ----------------------------------------------------------------------

def _get_fear_greed_data():
    """
    CNN Fear & Greed Index — unofficial internal endpoint CNN's own site uses
    to power its gauge + trend chart. The response includes the current
    score/rating, each of the 7 component indicators (market momentum, stock
    price strength/breadth, put/call options, volatility, junk bond demand,
    safe haven demand), and roughly a year of historical daily scores for
    the headline index — everything needed to rebuild their chart later.
    """
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  [warn] Couldn't fetch Fear & Greed data ({e})")
        return None


def _parse_fear_greed(fg_data):
    """Pulls out (current_score, current_rating, {component_name: (score, rating)})."""
    if not fg_data:
        return None, None, {}
    current = fg_data.get("fear_and_greed", {})
    score = current.get("score")
    rating = current.get("rating")
    score = round(float(score), 1) if score is not None else None
    rating = str(rating).title() if rating else None

    components = {}
    for key, val in fg_data.items():
        if key in ("fear_and_greed", "fear_and_greed_historical"):
            continue
        if isinstance(val, dict) and "score" in val:
            components[key] = (
                round(float(val["score"]), 1) if val.get("score") is not None else None,
                str(val.get("rating")).title() if val.get("rating") else None,
            )
    return score, rating, components


# ----------------------------------------------------------------------
# CBOE put/call ratio
# ----------------------------------------------------------------------

def _get_put_call_ratio():
    """
    CBOE total put/call ratio. CBOE doesn't offer a stable free JSON API for
    this, so this is a best-effort scrape of their market statistics page —
    it only yields the latest reading, not history. May need updating if
    CBOE changes their site structure.
    """
    url = "https://www.cboe.com/us/options/market_statistics/daily/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        match = re.search(r"TOTAL PUT/CALL RATIO[^\d]*([\d.]+)", resp.text, re.IGNORECASE)
        return float(match.group(1)) if match else None
    except Exception:
        return None


# ----------------------------------------------------------------------
# AAII sentiment survey — official spreadsheet
# ----------------------------------------------------------------------

def _get_aaii_sentiment_data():
    """
    Pulls AAII's own downloadable historical spreadsheet instead of scraping
    HTML. Gives us the full weekly Bull/Neutral/Bear time series (plus the
    S&P 500 close AAII includes alongside it), which is what's needed to
    recreate their history chart later.

    AAII's sheet has a few explanatory rows above the real header, hence
    skiprows=3. Columns are matched by name (case/whitespace-insensitive)
    rather than position, so small formatting shifts in the sheet don't
    silently break this.
    """
    try:
        df = pd.read_excel(AAII_XLS_URL, skiprows=3)
    except Exception as e:
        print(f"  [warn] Couldn't pull AAII spreadsheet ({e})")
        return None

    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")

    # Trim to the columns we actually care about if we can identify them,
    # but don't fail hard if the sheet has extra/renamed columns.
    def _find_col(candidates):
        for col in df.columns:
            norm = col.lower().replace(" ", "")
            for cand in candidates:
                if cand in norm:
                    return col
        return None

    date_col = _find_col(["date"])
    bull_col = _find_col(["bullish"])
    neutral_col = _find_col(["neutral"])
    bear_col = _find_col(["bearish"])

    if date_col:
        df = df.dropna(subset=[date_col])

    keep_cols = [c for c in [date_col, bull_col, neutral_col, bear_col] if c]
    latest = None
    if keep_cols:
        subset = df[keep_cols].dropna(subset=[bull_col] if bull_col else keep_cols)
        if not subset.empty:
            row = subset.iloc[-1]
            latest = {
                "date": row.get(date_col) if date_col else None,
                "bullish": row.get(bull_col) if bull_col else None,
                "neutral": row.get(neutral_col) if neutral_col else None,
                "bearish": row.get(bear_col) if bear_col else None,
            }

    return {"raw": df, "latest": latest}


def _fmt_aaii_pct(value):
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    # AAII's sheet stores these as fractions (0.37) — normalize just in case
    # a future version switches to already-scaled percents.
    if abs(value) <= 1:
        value *= 100
    return f"{value:.1f}%"


# ----------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------

def market_info():
    print("\n===== Market Overview =====\n")

    print("-- Major Indexes --")
    idx_data = _get_index_data()
    for name, d in idx_data.items():
        if d["last"] is None:
            print(f"  {name:<20} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            print(f"  {name:<20} {d['last']:,.2f}   ({sign}{d['change_pct']:.2f}%)")

    print("\n-- Sentiment Indicators --")

    fg_raw = _get_fear_greed_data()
    fg_score, fg_rating, fg_components = _parse_fear_greed(fg_raw)
    if fg_score is not None:
        print(f"  Fear & Greed Index   {fg_score} ({fg_rating})")
        for key, (score, rating) in fg_components.items():
            label = key.replace("_", " ").title()
            if score is not None:
                print(f"    - {label:<28} {score} ({rating})")
    else:
        print("  Fear & Greed Index   N/A")

    pc_ratio = _get_put_call_ratio()
    if pc_ratio is not None:
        print(f"  Put/Call Ratio       {pc_ratio}")
    else:
        print("  Put/Call Ratio       N/A (check cboe.com/us/options/market_statistics/daily manually)")

    aaii = _get_aaii_sentiment_data()
    aaii_latest = aaii["latest"] if aaii else None
    if aaii_latest:
        b = _fmt_aaii_pct(aaii_latest["bullish"])
        n = _fmt_aaii_pct(aaii_latest["neutral"])
        r = _fmt_aaii_pct(aaii_latest["bearish"])
        date_str = aaii_latest["date"]
        print(f"  AAII Sentiment       Bullish {b} / Neutral {n} / Bearish {r}  (week of {date_str})")
    else:
        print("  AAII Sentiment       N/A (see aaii.com/sentimentsurvey for latest figures)")

    print("\n" + "=" * 45)

    # Full underlying data, kept for later chart-building rather than
    # discarded after the console summary.
    return {
        "indexes": idx_data,
        "fear_greed": {"score": fg_score, "rating": fg_rating, "components": fg_components, "raw": fg_raw},
        "put_call_ratio": pc_ratio,
        "aaii": aaii,
    }


if __name__ == "__main__":
    market_info()