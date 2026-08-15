"""
market_info.py — market_info()

Pulls major index levels (via yfinance) plus a panel of sentiment/risk
gauges: CNN Fear & Greed Index, CBOE put/call ratio, and four macro
sentiment series pulled from official government/Fed-adjacent data sources
(FRED via fredapi, CFTC futures positioning via CFTC's own public API)
rather than scraped from a single retail-survey site.

Beyond just printing a summary, this also assembles and RETURNS the
underlying time-series data behind each of these (index price history, the
CNN Fear & Greed component breakdown + 1-year history, each sentiment
series' recent history) so it's available later for charting without a
second round of fetching.

Fear & Greed and put/call are unofficial/scraped sources with no public API
and can change format without notice. FRED and CFTC's own reporting API are
official, versioned APIs instead -- FRED needs a free API key
(FRED_API_KEY env var), CFTC's public reporting API needs no key at all --
and both are far less likely to silently break the way a scraped HTML page
can.
"""

import os
import re
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import yfinance as yf
import requests
import pandas as pd

# Loads backend/.env (FRED_API_KEY, ...) into the environment if present.
# No-op if the file doesn't exist or the vars are already set some other
# way (e.g. real env vars in production).
from dotenv import load_dotenv
load_dotenv()

try:
    import colorama
    colorama.init(autoreset=True)
except ImportError:
    pass

from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

# The first block is what shows on the Market page out of the box. The
# "extra" block below is fetched too, but ships hidden -- it's offered in
# the page's EDIT LAYOUT tray so the board can be widened without cluttering
# the default view.
INDEXES = {
    "Dow Jones (DJI)": "^DJI",
    "NASDAQ": "^IXIC",
    "S&P 500": "^GSPC",
    "Russell 2000": "^RUT",
    "Nikkei 225": "^N225",
    "KOSPI": "^KS11",
    "TQQQ": "TQQQ",
    "VIX": "^VIX",
    # -- available but hidden by default (see INDEX_META default_hidden) --
    "NASDAQ 100": "^NDX",
    "S&P MidCap 400": "^MID",
    "Dow Transports": "^DJT",
    "FTSE 100": "^FTSE",
    "DAX": "^GDAXI",
    "CAC 40": "^FCHI",
    "Euro Stoxx 50": "^STOXX50E",
    "Hang Seng": "^HSI",
    "Shanghai Composite": "000001.SS",
    "S&P/TSX": "^GSPTSE",
    "Sensex": "^BSESN",
    "ASX 200": "^AXJO",
    "US Dollar Index": "DX-Y.NYB",
    "10Y Treasury Yield": "^TNX",
    "VXN (Nasdaq Vol)": "^VXN",
}

# A full "real browser" header set. Some scraped sources (CBOE, CNN) will
# 403 requests that look like bare scripts, since libraries like requests
# send no User-Agent/Referer at all by default.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Free API key -- instant/free at fred.stlouisfed.org/docs/api/api_key.html.
# (CFTC's own reporting API, used below for futures positioning, needs no
# key at all.)
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")


# ----------------------------------------------------------------------
# Major indexes
# ----------------------------------------------------------------------

def _get_index_data(period="1y"):
    """
    Returns {name: {"last", "change_pct", "history"}}. A full 1y history is
    kept (not just the last close) so it can be charted later without a
    second call.
    """
    def fetch(item):
        name, symbol = item
        try:
            hist = yf.Ticker(symbol).history(period=period)
            hist = hist.dropna(subset=["Close"])
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            if math.isnan(last) or math.isnan(prev) or prev == 0:
                raise ValueError("NaN/zero close in history")
            change_pct = (last - prev) / prev * 100
            return name, {"last": last, "change_pct": change_pct, "history": hist}
        except Exception:
            return name, {"last": None, "change_pct": None, "history": None}

    # Fetched in parallel: this list is long enough now that doing it
    # sequentially dominated the whole /api/market response time, and each
    # fetch is independent network I/O.
    with ThreadPoolExecutor(max_workers=8) as pool:
        fetched = list(pool.map(fetch, INDEXES.items()))

    # Rebuilt in INDEXES order so the payload order stays deterministic
    # regardless of which network calls finished first.
    by_name = dict(fetched)
    return {name: by_name[name] for name in INDEXES if name in by_name}


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


# CNN's feed carries 9 raw series that present as 7 indicators: momentum and
# volatility each ship an index alongside its own moving average, which
# belong on one chart rather than two. This spec drives that merge and
# records what each series' raw y-value actually *is* -- the 0-100 "score"
# is a normalized reading, so the headline number on each card comes from
# the raw series instead.
#
# unit: pct -> "%" suffix | ratio -> bare 2dp | level -> thousands-separated
FG_INDICATORS = [
    {
        "key": "market_momentum",
        "label": "Market Momentum",
        "subtitle": "S&P 500 and its 125-day moving average",
        "score_from": "market_momentum_sp500",
        "unit": "level",
        "series": [
            ("S&P 500", "market_momentum_sp500"),
            ("125-day MA", "market_momentum_sp125"),
        ],
    },
    {
        "key": "stock_price_strength",
        "label": "Stock Price Strength",
        "subtitle": "Net new 52-week highs vs lows on the NYSE",
        "score_from": "stock_price_strength",
        "unit": "pct",
        "series": [("Net new highs", "stock_price_strength")],
    },
    {
        "key": "stock_price_breadth",
        "label": "Stock Price Breadth",
        "subtitle": "McClellan Volume Summation Index",
        "score_from": "stock_price_breadth",
        "unit": "level",
        "series": [("McClellan Volume Summation", "stock_price_breadth")],
    },
    {
        "key": "put_call_options",
        "label": "5-Day Average Put/Call Ratio",
        "subtitle": "Put volume vs call volume, 5-session average",
        "score_from": "put_call_options",
        "unit": "ratio",
        "series": [("Put/call ratio", "put_call_options")],
    },
    {
        "key": "market_volatility",
        "label": "Market Volatility",
        "subtitle": "VIX and its 50-day moving average",
        "score_from": "market_volatility_vix",
        "unit": "level",
        "series": [
            ("VIX", "market_volatility_vix"),
            ("50-day MA", "market_volatility_vix_50"),
        ],
    },
    {
        "key": "junk_bond_demand",
        "label": "Junk Bond Demand",
        "subtitle": "Yield spread: junk vs investment grade bonds",
        "score_from": "junk_bond_demand",
        "unit": "pct",
        "series": [("Yield spread", "junk_bond_demand")],
    },
    {
        "key": "safe_haven_demand",
        "label": "Safe Haven Demand",
        "subtitle": "Stock vs bond returns over the last 20 days",
        "score_from": "safe_haven_demand",
        "unit": "pct",
        "series": [("Stocks minus bonds", "safe_haven_demand")],
    },
]


def _fg_epoch_to_date(ms):
    """CNN's chart x-values are epoch milliseconds (UTC)."""
    try:
        return datetime.fromtimestamp(float(ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return None


def _fg_series(raw_points, limit=None):
    """Normalizes CNN's [{x, y, rating}] chart arrays into [{date, value}]."""
    out = []
    for pt in raw_points or []:
        if not isinstance(pt, dict):
            continue
        date = _fg_epoch_to_date(pt.get("x"))
        val = pt.get("y")
        if date is None or val is None:
            continue
        try:
            fval = float(val)
        except (TypeError, ValueError):
            continue
        if math.isnan(fval) or math.isinf(fval):
            continue
        out.append({"date": date, "value": round(fval, 4)})
    return out[-limit:] if limit else out


def _build_fear_greed_payload(fg_data):
    """
    Frontend-shaped Fear & Greed payload: headline score/rating, the
    prior-period readings CNN shows beside its gauge, ~1y of headline
    history for the trend chart, and each component gauge with its own
    score/rating/history for the expanded breakdown view.
    """
    if not fg_data:
        return {
            "score": None, "rating": None, "previous": {},
            "history": [], "components": [],
        }

    current = fg_data.get("fear_and_greed", {}) or {}

    def num(v):
        try:
            f = float(v)
            return None if math.isnan(f) or math.isinf(f) else round(f, 1)
        except (TypeError, ValueError):
            return None

    score = num(current.get("score"))
    rating = str(current.get("rating")).title() if current.get("rating") else None

    previous = {
        "close": num(current.get("previous_close")),
        "week": num(current.get("previous_1_week")),
        "month": num(current.get("previous_1_month")),
        "year": num(current.get("previous_1_year")),
    }

    historical = fg_data.get("fear_and_greed_historical", {}) or {}
    history = _fg_series(historical.get("data"))

    components = []
    for spec in FG_INDICATORS:
        # Each named series is optional: if CNN drops or renames one (say the
        # 50-day VIX average), the indicator still renders with whatever
        # series did arrive rather than vanishing entirely.
        series = []
        for s_label, s_key in spec["series"]:
            raw = fg_data.get(s_key)
            if not isinstance(raw, dict):
                continue
            points = _fg_series(raw.get("data"))
            if points:
                series.append({"label": s_label, "points": points})
        if not series:
            continue

        scored = fg_data.get(spec["score_from"]) or {}
        # Headline number is the latest *raw* reading of the primary series
        # (today's %, ratio or level) -- not the normalized 0-100 score.
        value = series[0]["points"][-1]["value"]

        components.append({
            "key": spec["key"],
            "label": spec["label"],
            "subtitle": spec["subtitle"],
            "unit": spec["unit"],
            "value": value,
            "score": num(scored.get("score")),
            "rating": str(scored.get("rating")).title() if scored.get("rating") else None,
            "series": series,
        })

    return {
        "score": round(score) if score is not None else None,
        "rating": rating,
        "previous": previous,
        "history": history,
        "components": components,
    }


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
# FRED sentiment/stress series (fredapi)
# ----------------------------------------------------------------------

_fred_client = None


def _get_fred_client():
    """Lazily builds a single shared fredapi client. Raises if FRED_API_KEY
    isn't set, so callers see a clear "why" instead of a confusing 403 deep
    in fredapi's own request code."""
    global _fred_client
    if _fred_client is None:
        if not FRED_API_KEY:
            raise ValueError(
                "FRED_API_KEY not set (get a free key at "
                "fred.stlouisfed.org/docs/api/api_key.html)"
            )
        from fredapi import Fred
        _fred_client = Fred(api_key=FRED_API_KEY)
    return _fred_client


def _fred_series_latest_and_history(series_id, points=24):
    """
    Pulls a FRED series and returns {"value", "date", "history"} for the
    latest reading plus the trailing `points` observations (for a
    sparkline/chart), dropping any not-yet-published NaN tail values FRED
    series commonly have.
    """
    fred = _get_fred_client()
    series = fred.get_series(series_id).dropna()
    if series.empty:
        raise ValueError(f"no data returned for {series_id}")
    tail = series.tail(points)
    history = [{"date": str(idx.date()), "value": float(v)} for idx, v in tail.items()]
    return {
        "value": float(series.iloc[-1]),
        "date": str(series.index[-1].date()),
        "history": history,
    }


def _get_consumer_sentiment():
    """
    University of Michigan Consumer Sentiment Index (FRED series UMCSENT).
    Monthly. The closest direct analog to what a retail-investor sentiment
    survey measures, just sourced from an official, versioned government/
    academic data feed instead of scraping a single survey site.
    """
    try:
        return _fred_series_latest_and_history("UMCSENT", points=24)
    except Exception as e:
        warn(f"FRED consumer sentiment (UMCSENT) fetch failed ({e})")
        return None


def _get_financial_stress_index():
    """
    St. Louis Fed Financial Stress Index (FRED series STLFSI4). Weekly.
    Zero = average financial-market stress; positive = above-average stress
    (fear); negative = below-average stress (complacency). Built from ~18
    weekly financial series (yield spreads, valuations, volatility) so it's
    a broad market-wide risk gauge rather than a single-source reading.
    """
    try:
        return _fred_series_latest_and_history("STLFSI4", points=26)
    except Exception as e:
        warn(f"FRED financial stress index (STLFSI4) fetch failed ({e})")
        return None


def _get_high_yield_spread():
    """
    ICE BofA US High Yield Index Option-Adjusted Spread (FRED series
    BAMLH0A0HYM2). Daily. The premium junk-bond buyers demand over
    Treasuries -- widens when credit investors get fearful/risk-averse,
    tightens when they're reaching for yield/complacent. A classic
    "risk appetite" gauge distinct from equity-market sentiment.
    """
    try:
        return _fred_series_latest_and_history("BAMLH0A0HYM2", points=60)
    except Exception as e:
        warn(f"FRED high-yield OAS spread (BAMLH0A0HYM2) fetch failed ({e})")
        return None


def _get_policy_uncertainty():
    """
    Economic Policy Uncertainty Index (FRED series USEPUINDXD), the
    Baker-Bloom-Davis index -- built from the frequency of newspaper
    coverage of economic policy uncertainty. Daily. About as direct a
    "sentiment" read as exists outside a survey; spikes around elections,
    debt-ceiling fights, tariff announcements, etc.
    """
    try:
        return _fred_series_latest_and_history("USEPUINDXD", points=60)
    except Exception as e:
        warn(f"FRED policy uncertainty index (USEPUINDXD) fetch failed ({e})")
        return None


def _get_yield_curve_spread():
    """
    10-Year minus 2-Year Treasury yield spread (FRED series T10Y2Y). Daily.
    The classic yield-curve-inversion recession/sentiment signal: negative
    means the curve is inverted (long-term rates below short-term --
    historically a bearish/recessionary signal), positive is the normal,
    healthier shape.
    """
    try:
        return _fred_series_latest_and_history("T10Y2Y", points=120)
    except Exception as e:
        warn(f"FRED 10Y-2Y yield spread (T10Y2Y) fetch failed ({e})")
        return None


def _get_ig_credit_spread():
    """
    ICE BofA US Corporate (Investment Grade) Index Option-Adjusted Spread
    (FRED series BAMLC0A0CM). Daily. The investment-grade counterpart to
    the high-yield spread already tracked -- comparing the two shows
    whether credit stress is broad-based or concentrated in junk debt.
    """
    try:
        return _fred_series_latest_and_history("BAMLC0A0CM", points=60)
    except Exception as e:
        warn(f"FRED IG credit spread (BAMLC0A0CM) fetch failed ({e})")
        return None


def _get_inflation_expectations():
    """
    University of Michigan Survey of Consumers -- median expected price
    change over the next year (FRED series MICH). Monthly. Consumer
    sentiment specifically about inflation, distinct from UMCSENT's
    broader "how do you feel about the economy" reading.
    """
    try:
        return _fred_series_latest_and_history("MICH", points=24)
    except Exception as e:
        warn(f"FRED inflation expectations (MICH) fetch failed ({e})")
        return None


# ----------------------------------------------------------------------
# CFTC futures positioning
# ----------------------------------------------------------------------

# CFTC's weekly Commitments of Traders "disaggregated" report for the
# E-mini S&P 500 future, pulled straight from CFTC's own public Socrata
# API (publicreporting.cftc.gov) -- genuinely free, no API key at all.
#
# We originally routed this through Nasdaq Data Link (CFTC/13874A_F_L_ALL),
# but that dataset returns a 403 there even with a valid, working API key --
# Nasdaq's own error-code docs (QEPx04) confirm that specific code means
# "you don't have permission / subscribe to this dataset", i.e. it's
# paywalled on their platform even though the underlying CFTC data is
# public. Going directly to CFTC avoids that paywall entirely.
CFTC_SOCRATA_URL = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
CFTC_SP500_CONTRACT = "E-MINI S&P 500"


def _get_futures_positioning():
    """
    Net "leveraged money" (hedge funds / other leveraged money managers --
    the disaggregated report's closest analog to the legacy report's
    "large speculator" category) positioning in E-mini S&P 500 futures,
    from CFTC's own weekly Commitments of Traders report. Expressed as net
    long/short as a % of total open interest so it's comparable across
    time regardless of how large the futures market has grown. Positive =
    net long (bullish positioning), negative = net short (bearish).
    """
    try:
        params = {
            "$where": f"contract_market_name='{CFTC_SP500_CONTRACT}'",
            "$order": "report_date_as_yyyy_mm_dd DESC",
            "$limit": 26,
        }
        resp = requests.get(CFTC_SOCRATA_URL, params=params, headers=BROWSER_HEADERS, timeout=15)
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            raise ValueError("no rows returned for E-mini S&P 500")

        rows = list(reversed(rows))  # oldest -> newest, for the sparkline
        history = []
        for row in rows:
            oi = float(row["open_interest_all"])
            if oi == 0:
                continue
            net_pct = (float(row["lev_money_positions_long"]) - float(row["lev_money_positions_short"])) / oi * 100
            history.append({"date": row["report_date_as_yyyy_mm_dd"][:10], "value": net_pct})
        if not history:
            raise ValueError("no usable rows after computing net positioning")

        return {
            "value": history[-1]["value"],
            "date": history[-1]["date"],
            "history": history,
        }
    except Exception as e:
        warn(f"CFTC futures positioning fetch failed ({e})")
        return None


def _get_sentiment_panel():
    """Runs all eight FRED/CFTC sentiment pulls. Each is
    independently defensive (returns None on failure) so one bad/missing
    key doesn't take down the others."""
    return {
        "consumer_sentiment": _get_consumer_sentiment(),
        "financial_stress": _get_financial_stress_index(),
        "high_yield_spread": _get_high_yield_spread(),
        "futures_positioning": _get_futures_positioning(),
        "policy_uncertainty": _get_policy_uncertainty(),
        "yield_curve_spread": _get_yield_curve_spread(),
        "ig_credit_spread": _get_ig_credit_spread(),
        "inflation_expectations": _get_inflation_expectations(),
    }


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

    sentiment = _get_sentiment_panel()

    cs = sentiment["consumer_sentiment"]
    if cs:
        print(f"  Consumer Sentiment   {cs['value']:.1f}  (UMich, {cs['date']})")
    else:
        print("  Consumer Sentiment   N/A (FRED UMCSENT)")

    fsi = sentiment["financial_stress"]
    if fsi:
        color = gradient_color(fsi["value"], neutral=0.0, max_dev=2.0)
        print(f"  Financial Stress     {color}{fsi['value']:.2f}{RESET_COLOR}  (STLFSI4, week of {fsi['date']})")
    else:
        print("  Financial Stress     N/A (FRED STLFSI4)")

    hy = sentiment["high_yield_spread"]
    if hy:
        print(f"  HY Credit Spread     {hy['value']:.2f}%  ({hy['date']})")
    else:
        print("  HY Credit Spread     N/A (FRED BAMLH0A0HYM2)")

    fp = sentiment["futures_positioning"]
    if fp:
        sign = "+" if fp["value"] >= 0 else ""
        print(f"  S&P Futures Position {sign}{fp['value']:.1f}% of OI  (CFTC COT, week of {fp['date']})")
    else:
        print("  S&P Futures Position N/A (CFTC public reporting API)")

    pu = sentiment["policy_uncertainty"]
    if pu:
        print(f"  Policy Uncertainty   {pu['value']:.1f}  (USEPUINDXD, {pu['date']})")
    else:
        print("  Policy Uncertainty   N/A (FRED USEPUINDXD)")

    yc = sentiment["yield_curve_spread"]
    if yc:
        color = gradient_color(yc["value"], neutral=0.0, max_dev=1.0)
        print(f"  10Y-2Y Spread        {color}{yc['value']:+.2f}{RESET_COLOR}  (T10Y2Y, {yc['date']})")
    else:
        print("  10Y-2Y Spread        N/A (FRED T10Y2Y)")

    ig = sentiment["ig_credit_spread"]
    if ig:
        print(f"  IG Credit Spread     {ig['value']:.2f}%  ({ig['date']})")
    else:
        print("  IG Credit Spread     N/A (FRED BAMLC0A0CM)")

    ie = sentiment["inflation_expectations"]
    if ie:
        print(f"  Inflation Expect.    {ie['value']:.1f}%  (UMich MICH, {ie['date']})")
    else:
        print("  Inflation Expect.    N/A (FRED MICH)")

    print("\n" + "=" * 45)

    # Full underlying data, kept for later chart-building rather than
    # discarded after the console summary.
    log_event("Market overview fetch complete")
    return {
        "indexes": idx_data,
        "fear_greed": {"score": fg_score, "rating": fg_rating, "components": fg_components, "raw": fg_raw},
        "put_call_ratio": pc_ratio,
        "sentiment": sentiment,
    }


# Symbol/region metadata for the frontend's index cards -- keyed the same
# as INDEXES above so the two stay in sync.
# "quote" tells the frontend how to render the number:
#   usd   -> prefix with $      (US dollar-denominated prices)
#   level -> bare number        (index levels, volatility readings, DXY)
#   pct   -> suffix with %      (yields)
# "default_hidden" ships the tile available-but-off in the page's edit tray.
INDEX_META = {
    "Dow Jones (DJI)":     {"symbol": "DJI",       "region": "US",        "quote": "usd"},
    "NASDAQ":              {"symbol": "IXIC",      "region": "US",        "quote": "usd"},
    "S&P 500":             {"symbol": "SPX",       "region": "US",        "quote": "usd"},
    "Russell 2000":        {"symbol": "RUT",       "region": "US",        "quote": "usd"},
    "Nikkei 225":          {"symbol": "N225",      "region": "Japan",     "quote": "level"},
    "KOSPI":               {"symbol": "KOSPI",     "region": "Korea",     "quote": "level"},
    "TQQQ":                {"symbol": "TQQQ",      "region": "US",        "quote": "usd"},
    "VIX":                 {"symbol": "VIX",       "region": "US",        "quote": "level"},

    "NASDAQ 100":          {"symbol": "NDX",       "region": "US",        "quote": "usd",   "default_hidden": True},
    "S&P MidCap 400":      {"symbol": "MID",       "region": "US",        "quote": "usd",   "default_hidden": True},
    "Dow Transports":      {"symbol": "DJT",       "region": "US",        "quote": "usd",   "default_hidden": True},
    "FTSE 100":            {"symbol": "FTSE",      "region": "UK",        "quote": "level", "default_hidden": True},
    "DAX":                 {"symbol": "DAX",       "region": "Germany",   "quote": "level", "default_hidden": True},
    "CAC 40":              {"symbol": "CAC",       "region": "France",    "quote": "level", "default_hidden": True},
    "Euro Stoxx 50":       {"symbol": "SX5E",      "region": "Europe",    "quote": "level", "default_hidden": True},
    "Hang Seng":           {"symbol": "HSI",       "region": "Hong Kong", "quote": "level", "default_hidden": True},
    "Shanghai Composite":  {"symbol": "SSEC",      "region": "China",     "quote": "level", "default_hidden": True},
    "S&P/TSX":             {"symbol": "GSPTSE",    "region": "Canada",    "quote": "level", "default_hidden": True},
    "Sensex":              {"symbol": "BSESN",     "region": "India",     "quote": "level", "default_hidden": True},
    "ASX 200":             {"symbol": "AXJO",      "region": "Australia", "quote": "level", "default_hidden": True},
    "US Dollar Index":     {"symbol": "DXY",       "region": "US",        "quote": "level", "default_hidden": True},
    "10Y Treasury Yield":  {"symbol": "TNX",       "region": "US",        "quote": "pct",   "default_hidden": True},
    "VXN (Nasdaq Vol)":    {"symbol": "VXN",       "region": "US",        "quote": "level", "default_hidden": True},
}


def get_market_data_full():
    """
    Data-only variant for API consumers, shaped for the frontend rather
    than the console: indexes as a flat list with absolute change (not
    just percent) and no embedded price-history DataFrame (not
    JSON-serializable -- charting can be added as its own endpoint if/when
    that's built), Fear & Greed's headline score/rating/components, the
    put/call ratio, and the FRED/CFTC sentiment panel (each
    with a bit of history for charting).
    """
    log_event("Fetching market overview (full data)")
    idx_data = _get_index_data()
    indexes = []
    for name, d in idx_data.items():
        meta = INDEX_META.get(name, {"symbol": name, "region": "US", "quote": "level"})
        change = None
        if d["last"] is not None and d["change_pct"] is not None:
            # last = prev * (1 + pct/100)  =>  change = last - prev
            prev = d["last"] / (1 + d["change_pct"] / 100)
            change = d["last"] - prev
        indexes.append({
            "name": name, "symbol": meta["symbol"], "region": meta["region"],
            "quote": meta.get("quote", "level"),
            "default_hidden": bool(meta.get("default_hidden", False)),
            "value": d["last"], "change": change, "change_pct": d["change_pct"],
        })

    fg_raw = _get_fear_greed_data()

    pc_ratio = _get_put_call_ratio()

    sentiment = _get_sentiment_panel()

    return {
        "indexes": indexes,
        "fear_greed": _build_fear_greed_payload(fg_raw),
        "put_call_ratio": pc_ratio,
        "sentiment": sentiment,
    }


if __name__ == "__main__":
    market_info()
