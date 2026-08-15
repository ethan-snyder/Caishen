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
| GET | `/api/market` | Indexes + Fear & Greed + put/call + FRED/CFTC sentiment panel |
| GET | `/api/crypto?n=10` | Top N cryptocurrencies by market cap |
| GET | `/api/crypto/{coin_id}/history?range=` | Price history for one coin. `range`: `1h,12h,24h,1w,1mo,3mo,6mo,1y,3y,5y,10y,all` |
| GET | `/api/fx` | Major currency pairs |
| GET | `/api/futures` | Major index/commodity futures |
| GET | `/api/bonds` | U.S. Treasury curve (1-MO-30-YR) + foreign sovereign curves + corporate rating tiers |
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
Coinbase, CNN's Fear & Greed endpoint, CBOE's stats page, FRED, CFTC) — see
each module's docstring for specifics and known fragility (e.g. CBOE/CNN
have no official API and can break if those sites change structure).

A few fields the original UI mockups included don't have a free, reliable
source, and rather than fabricate plausible-looking numbers for them, they're
left out, substituted with a clearly-labeled equivalent, or explicitly
marked as estimates:

- **Per-issuer corporate bond quotes** (Bonds tab) — individual corporate
  bond pricing is subscription-only data. The two corporate sections
  instead show ICE BofA index effective yields **by rating tier**
  (AAA/AA/A/BBB and BB/B/CCC & lower, daily via FRED) — the benchmark
  curves those issuers actually price against, rather than invented
  per-company yields.
- **U.S. Treasury curve** (Bonds tab) — the primary source is Treasury.gov's
  own daily par yield curve CSV (`bonds._us_treasury_curve`), which
  covers every requested tenor (1-MO through 30-YR) in one authoritative
  fetch. Falls back to the narrower yfinance-based curve
  (3-MO/5-YR/10-YR/30-YR only, via ^IRX/^FVX/^TNX/^TYX) if Treasury.gov
  itself is unreachable.
- **Foreign sovereign yields** (Bonds tab) — every tile charts as much of
  a real curve as a genuinely free, live source publishes for that
  country; no tenor is ever interpolated or invented to fill a gap. The
  10-YR baseline is OECD's government bond yield via FRED — **monthly and
  published with a lag**, so each row also carries its own observation
  date rather than presenting a month-old figure as today's quote. On top
  of that, every sovereign gets a 3-month point (OECD's actual UK
  Treasury-bill series for GILT, the OECD 3-month interbank rate
  elsewhere, since no free bill series exists for those countries). JGB,
  CANGB, and GILT each go further with a real primary source of their
  own: Japan's Ministry of Finance publishes a live 1Y-40Y par-yield
  curve as a plain CSV (`bonds._jgb_curve_from_mof`); the Bank of
  Canada's Valet API publishes real daily 5Y/10Y/30Y benchmark yields
  (`bonds._boc_curve`); and the Bank of England independently publishes
  its own daily fitted gilt curve — 1-MO/6-MO/1Y/5Y/30Y — though only as
  a ZIP of Excel workbooks with no documented layout, so
  `bonds._gilt_curve_from_boe` scans for the maturity columns rather than
  reading fixed cells, and **that scan is unverified from this
  environment** (no outbound route to actually download and inspect the
  file ahead of time) — it degrades to GILT's existing 3-MO+10-YR curve
  if BoE ever changes the layout in a way the scan can't match, rather
  than risk a silently-misread column; worth a look at `events_log.txt`
  after the first real run to confirm it found real data. No free, live,
  unauthenticated 1-MO/6-MO/1-YR series was found for BUND/ACGB, or for
  1-MO/6-MO for CANGB/JGB — Germany's Bundesbank and Australia's RBA do
  publish curves, but not through a simple stable free endpoint verified
  here.
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

CNN's Fear & Greed endpoint and CBOE's put/call scrape are both unofficial
(no public API from either). Each is wrapped so a failure degrades to
`null`/`N/A` in the response rather than taking down the rest of
`/api/market`. If one starts returning consistently empty, the source most
likely changed its page/endpoint structure — see the relevant function in
`market_info.py`.

## CoinGecko rate limits

The Crypto tab (`/api/crypto` and `/api/crypto/{id}/history`) runs on
CoinGecko's free, unauthenticated public API, which rate-limits hard —
roughly 5-15 requests/minute, no key required but no headroom either.
Clicking through several coins/ranges in a row without any protection is
enough to trip a `429` and blank the tab, so `crypto_info.py` guards
against that in two ways:

- **Every outbound CoinGecko request is paced and retried.** All calls go
  through a single `_coingecko_get()` choke point that enforces a minimum
  gap between requests (`MIN_INTERVAL`, currently 1.3s) — including across
  concurrent requests, since FastAPI runs sync route handlers in a thread
  pool — and automatically backs off and retries a `429` a few times
  (honoring CoinGecko's own `Retry-After` header when it sends one) before
  giving up.
- **Responses are cached in-process with a TTL**, so repeat requests within
  the window cost nothing: the top-10 listing for 45s, the global market
  cap used for dominance for 5 minutes, and — per the "check every 5
  minutes" behavior the Crypto tab's chart uses — each coin+range's price
  history for 5 minutes (`HISTORY_TTL_SECONDS`). Flipping back to a
  range/coin you already looked at is instant; a genuinely new look only
  hits CoinGecko once that coin+range's cache entry has expired. Failed
  fetches are deliberately *not* cached, so a rate-limited request is
  retried on the very next click rather than staying stuck failing for the
  rest of the TTL window.

This cache is a plain in-memory dict, scoped to one backend process — it
resets on restart and isn't shared across multiple backend instances. If
`/api/crypto` still 429s consistently even with this in place, CoinGecko's
limit has likely tightened further; the fix is either backing off
`MIN_INTERVAL` upward or, for real headroom, signing up for a free
CoinGecko Demo API key and adding it as a header in `HEADERS`.
