"""
crypto_info.py — top_cryptos()

General info (price, market cap, 24h volume, 24h change) for the top 10
cryptocurrencies by market cap. Uses CoinGecko's free public API (no key
required) since it natively ranks by market cap, which yfinance doesn't
offer for crypto.

Named "crypto_info" rather than "crypto" to avoid colliding with
pycryptodome, which installs itself as a package literally named "Crypto"
-- on case-insensitive filesystems (Windows, default macOS), Python's
import machinery can match "crypto" to "Crypto" and load the wrong module
entirely. Renamed proactively after hitting the exact same class of bug
with the fx/forex module.
"""

import requests
from utils import fmt_large_num, gradient_color, RESET_COLOR
from logger import log_event, warn

COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _fmt_price(price):
    """Coin prices span many orders of magnitude (BTC ~$65k, SHIB
    ~$0.00001), so scale decimal precision to the price rather than using a
    single fixed format."""
    if price is None:
        return "N/A"
    if price < 0.01:
        return f"${price:,.8f}"
    if price < 1:
        return f"${price:,.4f}"
    return f"${price:,.2f}"


def _fetch_top_cryptos(n=10):
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": n,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    try:
        resp = requests.get(COINGECKO_URL, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        warn(f"Couldn't fetch crypto data ({e})")
        return None


def top_cryptos(n=10):
    log_event(f"Fetching top {n} cryptocurrencies by market cap")
    data = _fetch_top_cryptos(n)
    if not data:
        print("\nCouldn't fetch crypto data right now.\n")
        return None

    print(f"\n===== Top {len(data)} Cryptocurrencies by Market Cap =====")

    parsed = []
    for coin in data:
        parsed.append({
            "rank": coin.get("market_cap_rank"),
            "name": coin.get("name") or "",
            "symbol": str(coin.get("symbol", "")).upper(),
            "price": coin.get("current_price"),
            "market_cap": coin.get("market_cap"),
            "volume": coin.get("total_volume"),
            "change_24h": coin.get("price_change_percentage_24h"),
        })

    # Column widths sized to the actual batch rather than a fixed guess --
    # some tickers (e.g. Figure Heloc's "FIGR_HELOC") run much longer than
    # the usual 3-5 letter symbol and would otherwise break alignment for
    # every row after them.
    name_width = max((len(r["name"]) for r in parsed), default=0)
    symbol_width = max((len(r["symbol"]) for r in parsed), default=0)

    rows = []
    for r in parsed:
        if r["change_24h"] is not None:
            color = gradient_color(r["change_24h"], neutral=0.0, max_dev=5.0)
            chg_str = f"{color}({r['change_24h']:+.2f}%){RESET_COLOR}"
        else:
            chg_str = "N/A"

        rank_str = f"#{r['rank']}" if r["rank"] is not None else "#?"
        print(
            f"  {rank_str:<4} {r['name']:<{name_width}} ({r['symbol']:<{symbol_width}}) "
            f"{_fmt_price(r['price']):>12}  MCap {fmt_large_num(r['market_cap']):>10}  "
            f"Vol {fmt_large_num(r['volume']):>10}  {chg_str}"
        )
        rows.append(r)

    print("=" * 45)
    print()
    log_event(f"Fetched {len(rows)} cryptocurrencies successfully")
    return rows


if __name__ == "__main__":
    top_cryptos()