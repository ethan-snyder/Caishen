# Moneta backend

FastAPI wrapper around the Moneta data modules, serving the `moneta-web`
frontend. A standalone terminal CLI (`cli.py`) reuses the same modules if
you'd rather use this without the browser UI.

## Setup

```bash
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Interactive API docs at `http://localhost:8000/docs` once running.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/stock/{ticker}` | Full metrics for one ticker |
| GET | `/api/stock/{ticker}/quote` | Lightweight price/EPS lookup (used by the Projector) |
| GET | `/api/market` | Indexes + Fear & Greed + put/call + AAII |
| GET | `/api/crypto?n=10` | Top N cryptocurrencies by market cap |
| GET | `/api/fx` | Major currency pairs |
| GET | `/api/futures` | Major index/commodity futures |
| GET | `/api/bonds` | U.S. Treasury yield curve |
| GET | `/api/trade/meta` | Country list, HS sections/groups, selectable years |
| GET | `/api/trade/profile/{iso3}?flow=X&year=` | Exports (`X`) or imports (`M`) by HS chapter/section; latest reported year if `year` omitted |
| GET | `/api/trade/partners/{iso3}?year=` | Top partners with exports, imports, bilateral balance |
| GET | `/api/trade/trend/{iso3}` | Merchandise exports/imports/balance, ~15 years (World Bank/WTO) |
| GET | `/api/trade/heatmap?countries=USA,CHN&flow=X&year=` | Country × HS-section share matrix |
| GET | `/api/trade/leaderboard?year=` | Every economy ranked by merchandise trade, with share of world, YoY growth and rank change (World Bank/WTO) |
| GET | `/api/trade/compare?countries=USA,CHN&start=&end=` | Up to 8 economies' exports/imports/total/balance/world share by year (World Bank/WTO) |
| GET | `/api/history?kind=stock&id=AAPL&range=1Y` | Price/yield history for the click-to-chart popups. `kind`: stock, index, crypto, fx, future, bond; `range`: 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX (yfinance) |
| GET | `/api/portfolio` | Valued holdings from `portfolio.txt` |
| POST | `/api/portfolio` | `{ticker, qty, avg_cost?}` — add/append a holding |
| DELETE | `/api/portfolio/{ticker}` | Remove a holding |
| GET | `/api/watchlists` | All watchlists with live quotes |
| POST | `/api/watchlists` | `{name}` — create an empty watchlist |
| POST | `/api/watchlists/{list}/tickers` | `{ticker}` — add to a list (creates the list if needed) |
| DELETE | `/api/watchlists/{list}/tickers/{ticker}` | Remove from a list |

Every data endpoint calls a `get_*_full()` (or `*_full()`) function in the
corresponding module — a JSON-safe, frontend-shaped variant of the same
fetch logic the CLI's console-printing functions use. Upstream fetch
failures return `502` with the underlying error message rather than a bare
500; missing resources (`ticker` not found, watchlist ticker not present)
return `404`.

## Data files

`portfolio.txt` and `watchlists.txt` are created next to this backend on
first use (git-ignore them if this repo is put under version control — they're
per-user state, not code). Format is documented in each file's own header
comment and in the module docstrings (`portfolio.py`, `watchlist.py`).

`input_log.txt` and `events_log.txt` are written by `logger.py` — mainly
relevant to `cli.py`; the API doesn't call `input()` so `input_log.txt`
stays empty when only the web API is used, but `events_log.txt` still
records fetch attempts/errors from API requests.

## Trade tab notes

`trade.py` caches upstream responses in `trade_cache.json` next to the backend
(git-ignored; delete it to force a refresh). Comtrade's keyless preview tier
allows one year and 500 rows per request and is rate-limited, so a cold
heatmap of 10 countries takes a few seconds; repeat views are instant.
Countries report with a 1–2 year lag, so omitted years resolve to the latest
year each country has reported.

The product treemap is at HS 4-digit level (Tradle-style: "Gold", "Coffee",
"Cars"). Heading names come from Comtrade's public HS reference file
(`HS.json`, cached for a month) with plain-English overrides for common
headings in `PRODUCT_NAME_OVERRIDES`. Each profile fetches its headings in
batches of explicit codes (≤400 per request, under the 500-row cap), so the
first load of a country/flow/year makes 3–4 extra requests. Any part of a
chapter's value its headings don't cover becomes an "Other <chapter>" tile; if
the HS4 queries fail entirely the map falls back to HS 2-digit chapters.

## What's real vs. what's deliberately left out

Every number in this app comes from a real free source (yfinance, CoinGecko,
CNN's Fear & Greed endpoint, CBOE's stats page, AAII's spreadsheet, UN
Comtrade's public preview API and the World Bank's indicators API) — see
each module's docstring for specifics and known fragility (e.g. CBOE/AAII
have no official API and can break if those sites change structure).

A few fields the original UI mockups included don't have a free, reliable
source, and rather than fabricate plausible-looking numbers for them, they're
left out or explicitly marked as estimates:

- **Corporate bond quotes** (Bonds tab) — no free source found; the section
  is a note rather than fake bond data.
- **Non-U.S. sovereign yields** (Bonds tab) — same reason; scoped to the
  U.S. Treasury curve (13-week, 5-year, 10-year, 30-year — the tenors
  yfinance covers reliably).
- **Futures open interest** (Futures tab) — not available via yfinance for
  continuous contracts; shown as `—` rather than guessed.
- **FX bid/ask spread** (Forex tab) — yfinance doesn't reliably expose live
  bid/ask for FX tickers. When missing, `get_fx_data_full()` estimates a
  tight spread around the last price and sets `bid_ask_is_estimate: true`;
  the frontend marks these with a `~` rather than presenting them as real
  quoted spreads.
- **Watchlist P/E** — only meaningful for individual stocks; FX/futures/bond
  tickers in a watchlist show `—` for it, which is correct, not missing data.

## Known fragility

CNN's Fear & Greed endpoint, CBOE's put/call scrape, and AAII's sentiment
pull are all unofficial (no public API from any of the three). Each is
wrapped so a failure degrades to `null`/`N/A` in the response rather than
taking down the rest of `/api/market`. If one starts returning consistently
empty, the source most likely changed its page/endpoint structure — see the
relevant function in `market_info.py`.
