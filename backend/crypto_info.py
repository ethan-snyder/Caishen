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

import threading
import time

import requests
from utils import fmt_large_num, gradient_color, RESET_COLOR
from logger import log_event, warn

COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/markets"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


# ----------------------------------------------------------------------
# Throttled, retrying CoinGecko client
# ----------------------------------------------------------------------
#
# The cache below stops *repeat* requests from costing quota, but it does
# nothing for a burst of *different* requests -- clicking through several
# coins and ranges in a row fires a different cache key each time, and
# without any pacing those can all leave for CoinGecko within the same
# second. Free-tier rate limiting is roughly per-minute, so a burst is
# exactly what trips it even when the *average* request rate is fine.
#
# Every CoinGecko call in this module goes through `_coingecko_get()`
# instead of calling `requests.get` directly, so pacing and 429 handling
# live in one place rather than being reimplemented per endpoint:
#
#   - MIN_INTERVAL enforces a minimum gap between any two outbound
#     requests (across all endpoints, via one shared lock+timestamp),
#     turning a burst of clicks into a steady drip instead of a spike.
#   - A 429 is retried with backoff (honouring CoinGecko's own
#     Retry-After header when it sends one) rather than surfaced
#     immediately -- from the user's seat, a click that would have failed
#     instead takes a beat longer and then succeeds.
MIN_INTERVAL = 1.3        # seconds between any two outbound CoinGecko requests
MAX_RETRIES = 3
BACKOFF_BASE = 2.0        # seconds; doubles each retry if no Retry-After header

_rate_lock = threading.Lock()
_last_request_at = 0.0


def _throttle():
    """Blocks just long enough to keep requests MIN_INTERVAL apart, across
    all threads/endpoints. FastAPI runs sync `def` route handlers in a
    thread pool, so this needs a real lock, not just a module-level flag."""
    global _last_request_at
    with _rate_lock:
        wait = _last_request_at + MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _coingecko_get(url, params=None, timeout=10):
    """requests.get, but paced against CoinGecko's rate limit and with
    automatic backoff+retry on 429. Raises (same as requests) if every
    attempt is exhausted, so callers keep their existing try/except."""
    last_exc = None
    for attempt in range(MAX_RETRIES + 1):
        _throttle()
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            if resp.status_code == 429 and attempt < MAX_RETRIES:
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else BACKOFF_BASE * (2 ** attempt)
                warn(f"CoinGecko rate-limited us ({url}); backing off {delay:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            last_exc = e
            # Only 429s get the backoff-and-retry treatment above; other
            # failures (timeout, DNS, 5xx) aren't rate-limit related and
            # retrying them immediately wouldn't help.
            break
    raise last_exc


# ----------------------------------------------------------------------
# Tiny TTL cache
# ----------------------------------------------------------------------
#
# CoinGecko's free/public tier rate-limits unauthenticated traffic hard
# (roughly 5-15 req/min) and this module can easily make 2-3 calls per page
# load (listing + global dominance, sometimes twice if the enriched request
# 429s and falls back) -- before this existed, a couple of tab switches or
# React re-running an effect in dev was enough to trip a 429, at which
# point *every* tile disappeared even though nothing was actually wrong.
#
# This is intentionally a plain module-level dict, not a library: the
# backend is a single process, there's no need for cross-process sharing,
# and per-key TTLs let fast-moving data (price listing) expire quickly
# while slow-moving data (dominance, long-range history) stays cached
# longer without wasting quota re-fetching things that can't have changed.
_cache = {}


def _cache_get(key):
    entry = _cache.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() >= expires_at:
        del _cache[key]
        return None
    return value


def _cache_set(key, value, ttl_seconds):
    _cache[key] = (value, time.monotonic() + ttl_seconds)


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


# Listing is cached briefly -- long enough that a page load plus a couple
# of tab switches or dev-mode double-effects reuse one fetch instead of
# multiplying into several, short enough that prices still feel live.
TOP_CRYPTOS_TTL = 45


def _fetch_top_cryptos(n=10):
    cache_key = ("top_cryptos", n)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    base_params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": n,
        "page": 1,
        "sparkline": "false",
    }

    # The multi-period % changes (1h/7d/30d/1y) are a bonus on top of the
    # base listing, not a requirement -- if CoinGecko rejects or rate-limits
    # the enriched request (its free tier is stricter about extra params/
    # load than the plain listing), fall back to the minimal request rather
    # than losing every tile on the page over what should be a nice-to-have.
    try:
        resp = _coingecko_get(
            COINGECKO_URL,
            params={**base_params, "price_change_percentage": "1h,24h,7d,30d,1y"},
        )
        data = resp.json()
        _cache_set(cache_key, data, TOP_CRYPTOS_TTL)
        return data
    except Exception as e:
        warn(f"Couldn't fetch crypto data with multi-period changes ({e}) -- retrying without them")

    try:
        resp = _coingecko_get(COINGECKO_URL, params=base_params)
        data = resp.json()
        # Cached under the same key as the enriched attempt -- once the
        # rate limit clears, the next expiry naturally retries the richer
        # request rather than being stuck on the fallback shape forever.
        _cache_set(cache_key, data, TOP_CRYPTOS_TTL)
        return data
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


GLOBAL_URL = "https://api.coingecko.com/api/v3/global"


# Total market cap barely moves minute to minute, and dominance is a ratio
# anyway -- a slightly stale total costs nothing in accuracy but saves a
# whole extra CoinGecko call on every page load, worth more when quota is
# already tight.
GLOBAL_MCAP_TTL = 300


def _fetch_global_market_cap():
    """Total crypto market cap across all coins, used to compute each coin's
    dominance %. A separate CoinGecko endpoint from /coins/markets."""
    cache_key = "global_market_cap"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        resp = _coingecko_get(GLOBAL_URL)
        total = resp.json().get("data", {}).get("total_market_cap", {}).get("usd")
        _cache_set(cache_key, total, GLOBAL_MCAP_TTL)
        return total
    except Exception as e:
        warn(f"Couldn't fetch global crypto market cap for dominance calc ({e})")
        return None


def get_top_cryptos_full(n=10):
    """
    Data-only variant for API consumers: adds the absolute 24h $ change
    (CoinGecko provides this directly, top_cryptos() just doesn't surface
    it), each coin's market-cap dominance (its share of total crypto market
    cap, fetched separately since /coins/markets doesn't include the
    total), multi-period % change (1h/7d/30d/1y -- free on the same
    request via price_change_percentage), and the supply/ATH-ATL detail
    needed for an expanded per-coin view. `id` is CoinGecko's own slug
    (e.g. "bitcoin"), needed to look up that coin's price history.
    """
    log_event(f"Fetching top {n} cryptocurrencies (full data)")
    data = _fetch_top_cryptos(n)
    if not data:
        return []

    total_market_cap = _fetch_global_market_cap()

    results = []
    for coin in data:
        market_cap = coin.get("market_cap")
        dominance = (market_cap / total_market_cap * 100) if (market_cap and total_market_cap) else None
        results.append({
            "id": coin.get("id"),
            "rank": coin.get("market_cap_rank"),
            "name": coin.get("name") or "",
            "symbol": str(coin.get("symbol", "")).upper(),
            "image": coin.get("image"),
            "price": coin.get("current_price"),
            "change_24h": coin.get("price_change_24h"),
            "change_pct_24h": coin.get("price_change_percentage_24h"),
            "change_pct_1h": coin.get("price_change_percentage_1h_in_currency"),
            "change_pct_7d": coin.get("price_change_percentage_7d_in_currency"),
            "change_pct_30d": coin.get("price_change_percentage_30d_in_currency"),
            "change_pct_1y": coin.get("price_change_percentage_1y_in_currency"),
            "market_cap": market_cap,
            "market_cap_change_pct_24h": coin.get("market_cap_change_percentage_24h"),
            "fully_diluted_valuation": coin.get("fully_diluted_valuation"),
            "volume": coin.get("total_volume"),
            "dominance": dominance,
            "high_24h": coin.get("high_24h"),
            "low_24h": coin.get("low_24h"),
            "circulating_supply": coin.get("circulating_supply"),
            "total_supply": coin.get("total_supply"),
            "max_supply": coin.get("max_supply"),
            "ath": coin.get("ath"),
            "ath_change_pct": coin.get("ath_change_percentage"),
            "ath_date": coin.get("ath_date"),
            "atl": coin.get("atl"),
            "atl_change_pct": coin.get("atl_change_percentage"),
            "atl_date": coin.get("atl_date"),
        })
    return results


# ----------------------------------------------------------------------
# Per-coin price history (for the expandable chart)
# ----------------------------------------------------------------------

# CoinGecko's `days` param wants an integer day count (or "max"). Sub-day
# ranges still use days=1 -- that's the finest granularity the free tier
# offers (5-minutely) -- and get trimmed to the requested window below.
RANGE_DAYS = {
    "1h": 1, "12h": 1, "24h": 1,
    "1w": 7, "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "3y": 1095, "5y": 1825, "10y": 3650,
    "all": "max",
}

RANGE_TRIM_HOURS = {"1h": 1, "12h": 12, "24h": 24}

# Once a coin+range's history has been pulled this session, it's reused
# as-is for 5 minutes before the next look re-checks CoinGecko -- flicking
# back and forth between a coin's ranges (or re-opening a coin you already
# expanded) is instant and costs no quota until that window passes.
HISTORY_TTL_SECONDS = 5 * 60


def get_coin_history(coin_id, range_key="24h"):
    """
    Returns {"prices": [{date (ISO), value}], "range": range_key} for one
    coin, sourced from CoinGecko's /coins/{id}/market_chart. `date` is a
    full ISO timestamp (not just a day) since the sub-day ranges need
    hour/minute resolution, unlike the FRED/CFTC series elsewhere in this
    app which are genuinely daily.
    """
    cache_key = ("coin_history", coin_id, range_key)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    days = RANGE_DAYS.get(range_key, 1)
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
    params = {"vs_currency": "usd", "days": days}
    try:
        resp = _coingecko_get(url, params=params, timeout=12)
        raw = resp.json().get("prices", [])
    except Exception as e:
        warn(f"Couldn't fetch price history for {coin_id} ({e})")
        # Deliberately not cached -- a transient failure (rate limit,
        # timeout) should be retried on the next click, not "stick" as an
        # empty chart for the TTL window.
        return {"prices": [], "range": range_key}

    import math as _math
    import datetime as _dt
    points = []
    for ts_ms, price in raw:
        try:
            dt = _dt.datetime.fromtimestamp(ts_ms / 1000, tz=_dt.timezone.utc)
            value = float(price)
            if _math.isnan(value) or _math.isinf(value):
                continue
            points.append({"date": dt.isoformat(), "value": value})
        except (TypeError, ValueError, OSError):
            continue

    trim_hours = RANGE_TRIM_HOURS.get(range_key)
    if trim_hours and points:
        cutoff = _dt.datetime.fromisoformat(points[-1]["date"]) - _dt.timedelta(hours=trim_hours)
        points = [p for p in points if _dt.datetime.fromisoformat(p["date"]) >= cutoff]

    result = {"prices": points, "range": range_key}
    if points:
        _cache_set(cache_key, result, HISTORY_TTL_SECONDS)
    return result


if __name__ == "__main__":
    top_cryptos()
