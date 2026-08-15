"""
futures.py — futures_info()

General info (last price, day change) for a curated set of important
futures contracts -- major equity index futures plus key commodities --
via yfinance.
"""

import yfinance as yf
from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

FUTURES = {
    "E-mini S&P 500": "ES=F",
    "E-mini Nasdaq 100": "NQ=F",
    "E-mini Dow": "YM=F",
    "E-mini Russell 2000": "RTY=F",
    "Crude Oil (WTI)": "CL=F",
    "Gold": "GC=F",
    "Silver": "SI=F",
    "Natural Gas": "NG=F",
}


def _get_futures_data():
    results = {}
    for name, symbol in FUTURES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[name] = {"last": last, "change_pct": change_pct}
        except Exception as e:
            warn(f"Couldn't fetch {name} ({e})")
            results[name] = {"last": None, "change_pct": None}
    return results


def futures_info():
    log_event("Fetching futures data")
    print("\n===== Major Futures =====")
    data = _get_futures_data()
    for name, d in data.items():
        if d["last"] is None:
            print(f"  {name:<20} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            color = gradient_color(d["change_pct"], neutral=0.0, max_dev=5.0)
            print(f"  {name:<20} {d['last']:>12,.2f}   {color}({sign}{d['change_pct']:.2f}%){RESET_COLOR}")
    print("=" * 45)
    print()
    log_event("Futures data fetched")
    return data


if __name__ == "__main__":
    futures_info()