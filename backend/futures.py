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

FUTURES_SYMBOLS = {
    "E-mini S&P 500": "ES",
    "E-mini Nasdaq 100": "NQ",
    "E-mini Dow": "YM",
    "E-mini Russell 2000": "RTY",
    "Crude Oil (WTI)": "CL",
    "Gold": "GC",
    "Silver": "SI",
    "Natural Gas": "NG",
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


def get_futures_data_full():
    """
    Data-only variant for API consumers: last price, absolute + percent
    change, volume (from the most recent daily bar), and expiry when
    yfinance has it. Open interest isn't available through yfinance for
    continuous futures contracts, so it's returned as None rather than
    guessed at -- the frontend shows "N/A" for it.
    """
    results = []
    for name, symbol in FUTURES.items():
        try:
            tk = yf.Ticker(symbol)
            hist = tk.history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change = last - prev
            change_pct = (change / prev) * 100
            volume = int(hist["Volume"].iloc[-1]) if "Volume" in hist.columns else None

            expiry = None
            try:
                info = tk.info
                ts = info.get("expireDate") or info.get("expireIsoDate")
                if isinstance(ts, (int, float)):
                    import datetime
                    expiry = datetime.datetime.utcfromtimestamp(ts).strftime("%b %Y").upper()
            except Exception:
                pass

            results.append({
                "name": name, "symbol": FUTURES_SYMBOLS.get(name, symbol),
                "expiry": expiry, "price": last, "change": change,
                "change_pct": change_pct, "volume": volume, "open_interest": None,
            })
        except Exception as e:
            warn(f"Couldn't fetch {name} ({e})")
            results.append({
                "name": name, "symbol": FUTURES_SYMBOLS.get(name, symbol),
                "expiry": None, "price": None, "change": None,
                "change_pct": None, "volume": None, "open_interest": None,
            })
    return results


if __name__ == "__main__":
    futures_info()
