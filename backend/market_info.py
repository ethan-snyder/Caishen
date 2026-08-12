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
and can change format without notice. AAII's data comes from their official
downloadable spreadsheet -- sturdier, but still fetched defensively (proper
browser-style headers, since AAII's WAF 403s bare/no-User-Agent requests
like pandas' default Excel loader sends) with an HTML-scrape fallback if the
spreadsheet pull ever stops working.
"""

import re
import io
import yfinance as yf
import requests
import pandas as pd

try:
    import colorama
    colorama.init(autoreset=True)
except ImportError:
    pass

from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

INDEXES = {
    "Dow Jones (DJI)": "^DJI",
    "NASDAQ": "^IXIC",
    "S&P 500": "^GSPC",
    "Russell 2000": "^RUT",
    "Nikkei 225": "^N225",
    "KOSPI": "^KS11",
    "TQQQ": "TQQQ",
    "VIX": "^VIX",
}

# A full "real browser" header set. AAII's site (and some others) will 403
# requests that look like bare scripts -- pandas.read_excel(url) in
# particular sends no headers at all, which is almost certainly why the
# direct spreadsheet pull was getting blocked.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.aaii.com/sentimentsurvey/sent_results",
}

AAII_XLS_URL = "https://www.aaii.com/files/surveys/sentiment.xls"
AAII_RESULTS_URL = "https://www.aaii.com/sentimentsurvey/sent_results"


# ----------------------------------------------------------------------
# Major indexes
# ----------------------------------------------------------------------

def _get_index_data(period="1y"):
    """
    Returns {name: {"last", "change_pct", "history"}}. A full 1y history is
    kept (not just the last close) so it can be charted later without a
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
    CNN Fear & Greed Index -- unofficial internal endpoint CNN's own site
    uses to power its gauge + trend chart. The response includes the
    current score/rating, each of the 7 component indicators, and roughly a
    year of historical daily scores for the headline index.
    """
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        warn(f"Couldn't fetch Fear & Greed data ({e})")
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
    this, so this is a best-effort scrape of their market statistics page --
    it only yields the latest reading, not history. May need updating if
    CBOE changes their site structure.
    """
    url = "https://www.cboe.com/us/options/market_statistics/daily/"
    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=8)
        resp.raise_for_status()
        match = re.search(r"TOTAL PUT/CALL RATIO[^\d]*([\d.]+)", resp.text, re.IGNORECASE)
        return float(match.group(1)) if match else None
    except Exception:
        return None


# ----------------------------------------------------------------------
# AAII sentiment survey
# ----------------------------------------------------------------------

def _find_col(columns, candidates):
    for col in columns:
        norm = str(col).lower().replace(" ", "")
        for cand in candidates:
            if cand in norm:
                return col
    return None


def _extract_latest_from_df(df, date_col, bull_col, neutral_col, bear_col):
    if date_col:
        df = df.dropna(subset=[date_col])
    keep_cols = [c for c in [date_col, bull_col, neutral_col, bear_col] if c]
    if not keep_cols:
        return None
    subset = df[keep_cols].dropna(subset=[bull_col] if bull_col else keep_cols)
    if subset.empty:
        return None
    row = subset.iloc[-1]
    return {
        "date": row.get(date_col) if date_col else None,
        "bullish": row.get(bull_col) if bull_col else None,
        "neutral": row.get(neutral_col) if neutral_col else None,
        "bearish": row.get(bear_col) if bear_col else None,
    }


def _get_aaii_sentiment_spreadsheet():
    """
    AAII's official downloadable historical spreadsheet -- the full weekly
    Bull/Neutral/Bear time series plus the S&P 500 close AAII includes
    alongside it. Fetched via requests (with browser-style headers, since
    pandas' default Excel loader sends none and gets 403'd by AAII's WAF)
    and handed to pandas as raw bytes rather than a bare URL.

    AAII's sheet has a few explanatory rows above the real header, hence
    skiprows=3. Columns are matched by name (case/whitespace-insensitive)
    rather than position, so small formatting shifts don't silently break it.
    """
    resp = requests.get(AAII_XLS_URL, headers=BROWSER_HEADERS, timeout=15)
    resp.raise_for_status()
    df = pd.read_excel(io.BytesIO(resp.content), skiprows=3)

    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")

    date_col = _find_col(df.columns, ["date"])
    bull_col = _find_col(df.columns, ["bullish"])
    neutral_col = _find_col(df.columns, ["neutral"])
    bear_col = _find_col(df.columns, ["bearish"])

    latest = _extract_latest_from_df(df, date_col, bull_col, neutral_col, bear_col)
    return {"raw": df, "latest": latest}


def _get_aaii_sentiment_html_fallback():
    """
    Fallback if the spreadsheet pull fails: scrape the small recent-history
    table AAII shows on their public results page. Only covers the last
    ~20 weeks (vs. the full history the spreadsheet has), but keeps this
    working even if the spreadsheet endpoint changes or gets blocked.
    """
    from bs4 import BeautifulSoup

    resp = requests.get(AAII_RESULTS_URL, headers=BROWSER_HEADERS, timeout=10)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if table is None:
        return None

    rows = []
    for tr in table.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        if len(cells) == 4 and "bullish" not in cells[1].lower():
            rows.append(cells)
    if not rows:
        return None

    def _pct_to_frac(s):
        try:
            return float(str(s).replace("%", "")) / 100
        except ValueError:
            return None

    date_str, bull_s, neutral_s, bear_s = rows[0]
    latest = {
        "date": date_str,
        "bullish": _pct_to_frac(bull_s),
        "neutral": _pct_to_frac(neutral_s),
        "bearish": _pct_to_frac(bear_s),
    }
    raw_df = pd.DataFrame(rows, columns=["Reported Date", "Bullish", "Neutral", "Bearish"])
    return {"raw": raw_df, "latest": latest}


def _get_aaii_sentiment_data():
    try:
        return _get_aaii_sentiment_spreadsheet()
    except Exception as e:
        warn(f"AAII spreadsheet pull failed ({e}); trying HTML fallback")
    try:
        return _get_aaii_sentiment_html_fallback()
    except Exception as e:
        warn(f"AAII HTML fallback also failed ({e})")
        return None


def _fmt_aaii_pct(value):
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    # AAII's data is stored as fractions (0.37) -- normalize just in case a
    # future version switches to already-scaled percents.
    if abs(value) <= 1:
        value *= 100
    return f"{value:.1f}%"


# ----------------------------------------------------------------------
# Public entry point
# ----------------------------------------------------------------------

def market_info():
    log_event("Fetching market overview (indexes + sentiment)")
    print("\n===== Market Overview =====\n")

    print("-- Major Indexes --")
    idx_data = _get_index_data()
    for name, d in idx_data.items():
        if d["last"] is None:
            print(f"  {name:<20} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            color = gradient_color(d["change_pct"], neutral=0.0, max_dev=5.0)
            print(f"  {name:<20} {d['last']:>12,.2f}   {color}({sign}{d['change_pct']:.2f}%){RESET_COLOR}")

    print("\n-- Sentiment Indicators --")

    fg_raw = _get_fear_greed_data()
    fg_score, fg_rating, fg_components = _parse_fear_greed(fg_raw)
    if fg_score is not None:
        color = gradient_color(fg_score, neutral=50.0, max_dev=50.0)
        print(f"  Fear & Greed Index   {color}{fg_score} ({fg_rating}){RESET_COLOR}")
        for key, (score, rating) in fg_components.items():
            label = key.replace("_", " ").title()
            if score is not None:
                c_color = gradient_color(score, neutral=50.0, max_dev=50.0)
                print(f"    - {label:<28} {c_color}{score} ({rating}){RESET_COLOR}")
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
    log_event("Market overview fetch complete")
    return {
        "indexes": idx_data,
        "fear_greed": {"score": fg_score, "rating": fg_rating, "components": fg_components, "raw": fg_raw},
        "put_call_ratio": pc_ratio,
        "aaii": aaii,
    }


# Symbol/region metadata for the frontend's index cards -- keyed the same
# as INDEXES above so the two stay in sync.
INDEX_META = {
    "Dow Jones (DJI)":  {"symbol": "DJI",   "region": "US"},
    "NASDAQ":           {"symbol": "IXIC",  "region": "US"},
    "S&P 500":          {"symbol": "SPX",   "region": "US"},
    "Russell 2000":     {"symbol": "RUT",   "region": "US"},
    "Nikkei 225":       {"symbol": "N225",  "region": "Japan"},
    "KOSPI":            {"symbol": "KOSPI", "region": "Korea"},
    "TQQQ":             {"symbol": "TQQQ",  "region": "US"},
    "VIX":              {"symbol": "VIX",   "region": "US"},
}


def get_market_data_full():
    """
    Data-only variant for API consumers, shaped for the frontend rather
    than the console: indexes as a flat list with absolute change (not
    just percent) and no embedded price-history DataFrame (not
    JSON-serializable -- charting can be added as its own endpoint if/when
    that's built), Fear & Greed's headline score/rating/components, the
    put/call ratio, and the latest AAII sentiment split.
    """
    log_event("Fetching market overview (full data)")
    idx_data = _get_index_data()
    indexes = []
    for name, d in idx_data.items():
        meta = INDEX_META.get(name, {"symbol": name, "region": "US"})
        change = None
        if d["last"] is not None and d["change_pct"] is not None:
            # last = prev * (1 + pct/100)  =>  change = last - prev
            prev = d["last"] / (1 + d["change_pct"] / 100)
            change = d["last"] - prev
        indexes.append({
            "name": name, "symbol": meta["symbol"], "region": meta["region"],
            "value": d["last"], "change": change, "change_pct": d["change_pct"],
        })

    fg_raw = _get_fear_greed_data()
    fg_score, fg_rating, fg_components = _parse_fear_greed(fg_raw)

    pc_ratio = _get_put_call_ratio()

    aaii = _get_aaii_sentiment_data()
    aaii_latest = aaii["latest"] if aaii else None
    aaii_out = None
    if aaii_latest:
        def _to_pct(v):
            if v is None:
                return None
            v = float(v)
            return v * 100 if abs(v) <= 1 else v
        aaii_out = {
            "bullish": _to_pct(aaii_latest["bullish"]),
            "neutral": _to_pct(aaii_latest["neutral"]),
            "bearish": _to_pct(aaii_latest["bearish"]),
            "week_ending": str(aaii_latest["date"]) if aaii_latest["date"] is not None else None,
        }

    return {
        "indexes": indexes,
        "fear_greed": {
            "score": round(fg_score) if fg_score is not None else None,
            "rating": fg_rating,
            "components": {
                k.replace("_", " ").title(): {"score": s, "rating": r}
                for k, (s, r) in fg_components.items()
            },
        },
        "put_call_ratio": pc_ratio,
        "aaii": aaii_out,
    }


if __name__ == "__main__":
    market_info()
