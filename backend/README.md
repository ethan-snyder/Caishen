# Caishen backend

FastAPI wrapper around the Caishen data modules, serving the `caishen-web`
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

## What's real vs. what's deliberately left out

Every number in this app comes from a real free source (yfinance, CoinGecko,
CNN's Fear & Greed endpoint, CBOE's stats page, AAII's spreadsheet) — see
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
