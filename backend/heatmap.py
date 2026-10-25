"""
heatmap.py — Nasdaq-100 heatmap data for the MARKET tab.

    get_heatmap() -> {"universe": "nasdaq100", "tickers": [...], "as_of": iso}

Each ticker: {ticker, name, sector, weight, price, change, change_pct,
market_cap}.

Why it's built this way:
  * One batched yfinance download for all ~100 names (daily bars, last two
    closes) instead of 100 per-ticker info calls, which would take minutes
    and get rate-limited. Cached for CACHE_SECONDS.
  * Market cap = live price x a static share count (CONSTITUENTS below), so
    it moves with the day's price without another API call. Share counts
    drift slowly (buybacks, issuance); refresh the table occasionally.
  * `weight` is each name's share of the basket's total market cap, in
    percent. The real NDX is *modified* cap-weighted (the largest names are
    capped), so tile areas are close to, not exactly, official weights.
  * The constituent list is maintained by hand -- Nasdaq reconstitutes the
    index every December (plus occasional mid-year swaps), so update this
    table then.
"""

import threading
import time
from datetime import datetime, timezone

import yfinance as yf

from logger import warn

CACHE_SECONDS = 600

# ticker, name, sector, shares outstanding (billions)
CONSTITUENTS = [
    ("AAPL", "Apple", "Technology", 14.84),
    ("MSFT", "Microsoft", "Technology", 7.43),
    ("NVDA", "NVIDIA", "Technology", 24.30),
    ("AMZN", "Amazon", "Consumer Discretionary", 10.68),
    ("META", "Meta Platforms", "Communication Services", 2.52),
    ("GOOGL", "Alphabet A", "Communication Services", 5.81),
    ("GOOG", "Alphabet C", "Communication Services", 5.45),
    ("AVGO", "Broadcom", "Technology", 4.72),
    ("TSLA", "Tesla", "Consumer Discretionary", 3.22),
    ("NFLX", "Netflix", "Communication Services", 4.24),
    ("COST", "Costco", "Consumer Staples", 0.443),
    ("PLTR", "Palantir", "Technology", 2.37),
    ("ASML", "ASML", "Technology", 0.389),
    ("AMD", "AMD", "Technology", 1.62),
    ("CSCO", "Cisco", "Technology", 3.95),
    ("TMUS", "T-Mobile US", "Communication Services", 1.13),
    ("AZN", "AstraZeneca", "Health Care", 3.10),
    ("LIN", "Linde", "Materials", 0.469),
    ("PEP", "PepsiCo", "Consumer Staples", 1.37),
    ("SHOP", "Shopify", "Technology", 1.30),
    ("APP", "AppLovin", "Technology", 0.338),
    ("INTU", "Intuit", "Technology", 0.279),
    ("ISRG", "Intuitive Surgical", "Health Care", 0.358),
    ("MU", "Micron", "Technology", 1.12),
    ("TXN", "Texas Instruments", "Technology", 0.908),
    ("QCOM", "Qualcomm", "Technology", 1.08),
    ("LRCX", "Lam Research", "Technology", 1.27),
    ("AMAT", "Applied Materials", "Technology", 0.795),
    ("BKNG", "Booking Holdings", "Consumer Discretionary", 0.0325),
    ("AMGN", "Amgen", "Health Care", 0.538),
    ("ADBE", "Adobe", "Technology", 0.418),
    ("INTC", "Intel", "Technology", 4.70),
    ("PDD", "PDD Holdings", "Consumer Discretionary", 1.42),
    ("ARM", "Arm Holdings", "Technology", 1.06),
    ("GILD", "Gilead Sciences", "Health Care", 1.24),
    ("HON", "Honeywell", "Industrials", 0.635),
    ("KLAC", "KLA", "Technology", 0.132),
    ("PANW", "Palo Alto Networks", "Technology", 0.668),
    ("ADI", "Analog Devices", "Technology", 0.492),
    ("CMCSA", "Comcast", "Communication Services", 3.68),
    ("CRWD", "CrowdStrike", "Technology", 0.251),
    ("ADP", "ADP", "Industrials", 0.405),
    ("MELI", "MercadoLibre", "Consumer Discretionary", 0.0507),
    ("VRTX", "Vertex Pharmaceuticals", "Health Care", 0.256),
    ("SBUX", "Starbucks", "Consumer Discretionary", 1.14),
    ("CEG", "Constellation Energy", "Utilities", 0.313),
    ("MSTR", "Strategy", "Technology", 0.28),
    ("CDNS", "Cadence Design", "Technology", 0.273),
    ("SNPS", "Synopsys", "Technology", 0.186),
    ("DASH", "DoorDash", "Consumer Discretionary", 0.428),
    ("ORLY", "O'Reilly Automotive", "Consumer Discretionary", 0.852),
    ("MRVL", "Marvell Technology", "Technology", 0.862),
    ("MDLZ", "Mondelez", "Consumer Staples", 1.29),
    ("CTAS", "Cintas", "Industrials", 0.403),
    ("ABNB", "Airbnb", "Consumer Discretionary", 0.62),
    ("FTNT", "Fortinet", "Technology", 0.765),
    ("MAR", "Marriott", "Consumer Discretionary", 0.274),
    ("PYPL", "PayPal", "Financials", 0.97),
    ("REGN", "Regeneron", "Health Care", 0.105),
    ("WDAY", "Workday", "Technology", 0.267),
    ("CSX", "CSX", "Industrials", 1.88),
    ("ADSK", "Autodesk", "Technology", 0.214),
    ("AXON", "Axon Enterprise", "Industrials", 0.078),
    ("AEP", "American Electric Power", "Utilities", 0.534),
    ("MNST", "Monster Beverage", "Consumer Staples", 0.975),
    ("NXPI", "NXP Semiconductors", "Technology", 0.252),
    ("ROP", "Roper Technologies", "Technology", 0.1075),
    ("CHTR", "Charter Communications", "Communication Services", 0.135),
    ("PCAR", "PACCAR", "Industrials", 0.525),
    ("FAST", "Fastenal", "Industrials", 1.147),
    ("PAYX", "Paychex", "Industrials", 0.36),
    ("TTWO", "Take-Two Interactive", "Communication Services", 0.184),
    ("KDP", "Keurig Dr Pepper", "Consumer Staples", 1.36),
    ("DDOG", "Datadog", "Technology", 0.345),
    ("ROST", "Ross Stores", "Consumer Discretionary", 0.326),
    ("ZS", "Zscaler", "Technology", 0.155),
    ("EXC", "Exelon", "Utilities", 1.01),
    ("IDXX", "IDEXX Laboratories", "Health Care", 0.081),
    ("XEL", "Xcel Energy", "Utilities", 0.585),
    ("FANG", "Diamondback Energy", "Energy", 0.29),
    ("CPRT", "Copart", "Industrials", 0.967),
    ("BKR", "Baker Hughes", "Energy", 0.99),
    ("VRSK", "Verisk Analytics", "Industrials", 0.14),
    ("EA", "Electronic Arts", "Communication Services", 0.25),
    ("KHC", "Kraft Heinz", "Consumer Staples", 1.18),
    ("CCEP", "Coca-Cola Europacific", "Consumer Staples", 0.46),
    ("CTSH", "Cognizant", "Technology", 0.49),
    ("GEHC", "GE HealthCare", "Health Care", 0.457),
    ("ODFL", "Old Dominion Freight", "Industrials", 0.21),
    ("TEAM", "Atlassian", "Technology", 0.262),
    ("LULU", "Lululemon", "Consumer Discretionary", 0.12),
    ("CSGP", "CoStar Group", "Real Estate", 0.42),
    ("TTD", "The Trade Desk", "Technology", 0.49),
    ("DXCM", "DexCom", "Health Care", 0.39),
    ("WBD", "Warner Bros. Discovery", "Communication Services", 2.47),
    ("ON", "ON Semiconductor", "Technology", 0.42),
    ("BIIB", "Biogen", "Health Care", 0.146),
    ("GFS", "GlobalFoundries", "Technology", 0.553),
    ("CDW", "CDW", "Technology", 0.131),
    ("MCHP", "Microchip Technology", "Technology", 0.54),
]

_lock = threading.Lock()
_cache = None
_cache_at = 0.0


def _build():
    symbols = [t for t, *_ in CONSTITUENTS]
    df = yf.download(symbols, period="5d", interval="1d", group_by="ticker",
                     auto_adjust=False, progress=False, threads=True)
    rows = []
    for ticker, name, sector, shares_bn in CONSTITUENTS:
        price = change = change_pct = None
        try:
            closes = df[ticker]["Close"].dropna()
            if len(closes):
                price = float(closes.iloc[-1])
            if len(closes) >= 2:
                prev = float(closes.iloc[-2])
                if prev:
                    change = price - prev
                    change_pct = change / prev * 100
        except Exception:
            pass
        mcap = price * shares_bn * 1e9 if price is not None else None
        rows.append({
            "ticker": ticker, "name": name, "sector": sector,
            "price": price, "change": change, "change_pct": change_pct,
            "market_cap": mcap,
        })

    total = sum(r["market_cap"] or 0 for r in rows)
    if not total:
        raise RuntimeError("no prices came back from yfinance for the Nasdaq-100 basket")
    for r in rows:
        r["weight"] = (r["market_cap"] or 0) / total * 100
    rows.sort(key=lambda r: r["weight"], reverse=True)
    return {
        "universe": "nasdaq100",
        "tickers": rows,
        "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def get_heatmap(force=False):
    global _cache, _cache_at
    with _lock:
        if not force and _cache is not None and (time.monotonic() - _cache_at) < CACHE_SECONDS:
            return _cache
    try:
        data = _build()
    except Exception as e:
        # Serve the last good board rather than an error if we have one.
        if _cache is not None:
            warn(f"heatmap: refresh failed ({e}); serving cached board")
            return _cache
        raise
    with _lock:
        _cache, _cache_at = data, time.monotonic()
    return data
