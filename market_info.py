"""
market_info.py — market_info()

Pulls major index levels (via yfinance) plus three broad sentiment gauges:
CNN Fear & Greed Index, CBOE total put/call ratio, and the AAII weekly
investor sentiment survey.

The three sentiment sources are NOT official public APIs — they're best-effort
reads of endpoints/pages these providers happen to expose. They can change
format or break without notice, so every one of them is wrapped so a failure
degrades to "N/A" instead of crashing the whole function. If one stops
working, check the URL/selectors in this file first.
"""

import re
import yfinance as yf
import requests

INDEXES = {
    "Dow Jones (DJI)": "^DJI",
    "NASDAQ": "^IXIC",
    "S&P 500": "^GSPC",
    "Russell 2000": "^RUT",
    "Nikkei 225": "^N225",
    "KOSPI": "^KS11",
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _get_index_snapshot():
    results = {}
    for name, symbol in INDEXES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[name] = (last, change_pct)
        except Exception:
            results[name] = (None, None)
    return results


def _get_fear_greed_index():
    """CNN Fear & Greed Index — unofficial internal endpoint CNN's own site uses."""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        score = data["fear_and_greed"]["score"]
        rating = data["fear_and_greed"]["rating"]
        return round(float(score), 1), str(rating).title()
    except Exception as e:
        return None, f"unavailable ({e.__class__.__name__})"


def _get_put_call_ratio():
    """
    CBOE total put/call ratio. CBOE does not offer a stable free JSON API for
    this, so this is a best-effort scrape of their market statistics page and
    may need updating if their site structure changes.
    """
    url = "https://www.cboe.com/us/options/market_statistics/daily/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        match = re.search(r"TOTAL PUT/CALL RATIO[^\d]*([\d.]+)", resp.text, re.IGNORECASE)
        if match:
            return float(match.group(1))
        return None
    except Exception:
        return None


def _get_aaii_sentiment():
    """
    AAII weekly Bull/Neutral/Bear investor sentiment survey — best-effort
    scrape of the public results page (no official API). Falls back to None
    if the page layout doesn't match the expected pattern.
    """
    url = "https://www.aaii.com/sentimentsurvey/sent_results"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        text = resp.text
        bullish = re.search(r"Bullish:?\s*</?\w*>?\s*([\d.]+)%", text, re.IGNORECASE)
        neutral = re.search(r"Neutral:?\s*</?\w*>?\s*([\d.]+)%", text, re.IGNORECASE)
        bearish = re.search(r"Bearish:?\s*</?\w*>?\s*([\d.]+)%", text, re.IGNORECASE)
        if bullish and neutral and bearish:
            return f"Bullish {bullish.group(1)}% / Neutral {neutral.group(1)}% / Bearish {bearish.group(1)}%"
        return None
    except Exception:
        return None


def market_info():
    print("\n===== Market Overview =====\n")

    print("-- Major Indexes --")
    idx_data = _get_index_snapshot()
    for name, (price, chg) in idx_data.items():
        if price is None:
            print(f"  {name:<20} N/A")
        else:
            sign = "+" if chg >= 0 else ""
            print(f"  {name:<20} {price:,.2f}   ({sign}{chg:.2f}%)")

    print("\n-- Sentiment Indicators --")

    fg_score, fg_rating = _get_fear_greed_index()
    if fg_score is not None:
        print(f"  Fear & Greed Index   {fg_score} ({fg_rating})")
    else:
        print(f"  Fear & Greed Index   N/A - {fg_rating}")

    pc_ratio = _get_put_call_ratio()
    if pc_ratio is not None:
        print(f"  Put/Call Ratio       {pc_ratio}")
    else:
        print("  Put/Call Ratio       N/A (check cboe.com/us/options/market_statistics/daily manually)")

    aaii = _get_aaii_sentiment()
    if aaii:
        print(f"  AAII Sentiment       {aaii}")
    else:
        print("  AAII Sentiment       N/A (see aaii.com/sentimentsurvey for latest figures)")

    print("\n" + "=" * 45)


if __name__ == "__main__":
    market_info()
