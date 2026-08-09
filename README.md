# Caishen

A terminal-based, all-in-one investing tool covering stock research, price
projection, market context, portfolios/watchlists, and quick reference data
for crypto, FX, futures, and bonds.

## Setup

```bash
pip install -r requirements.txt
python main.py
```

Requires Python 3.9+.

## Features

| # | Menu option | Module | Function |
|---|---|---|---|
| 1 | Current Stock Info | `stock_info.py` | `current_stock_info()` |
| 2 | Price Projector | `projector.py` | `projector()` |
| 3 | Market Overview | `market_info.py` | `market_info()` |
| 4 | Portfolio | `portfolio.py` | `view_portfolio()` |
| 5 | Watchlists | `watchlist.py` | `view_watchlists()` |
| 6 | Crypto | `crypto_info.py` | `top_cryptos()` |
| 7 | FX Rates | `forex.py` | `fx_rates()` |
| 8 | Futures | `futures.py` | `futures_info()` |
| 9 | Bonds | `bonds.py` | `bonds_info()` |

### Current Stock Info

Core metrics: Price, PE, forward PE, PEG, P/S, P/B, WACC, Dividend, Dividend
yield, EPS, 52-week range, Cash Per Share, CAPM.

Additional sections, each independent and best-effort (missing fields or
whole sections are skipped rather than failing the call): price/volume
detail, most recent and next earnings dates, analyst price targets and
recommendation, and Yahoo-style financial highlights (margins, returns,
TTM income statement figures, balance sheet, cash flow). Also returns a
year of OHLC price history for later charting.

### Price Projector

Prompts for bear/base/bull PE and EPS (TTM) assumptions for each of the
next 3 calendar years, and computes implied price via `Price = EPS × PE`.

### Market Overview

Major indexes (DJI, NASDAQ, S&P 500, Russell 2000, Nikkei 225, KOSPI, TQQQ,
VIX) plus three sentiment gauges: CNN Fear & Greed Index (with its 7
component indicators), CBOE put/call ratio, and the AAII investor sentiment
survey. Returns index price history, Fear & Greed's historical series, and
the full AAII historical spreadsheet alongside the console summary, for use
in future charting.

### Portfolio

Reads a hand-edited `portfolio.txt` (created with a template on first run)
and prints a live-valued summary. Format is one holding per line:

```
# Caishen portfolio file
# One holding per line: TICKER, QUANTITY
AAPL, 10
MSFT, 5.5
```

Malformed lines and unfetchable tickers are skipped individually rather
than failing the whole file. Tracks live value only — no cost basis or
gain/loss yet.

### Watchlists

Reads a hand-edited `watchlists.txt` (created with a template on first run)
supporting multiple named lists via bracketed section headers:

```
[Tech Stocks]
AAPL
MSFT
NVDA

[Macro]
EURUSD=X
GC=F
^TNX
BTC-USD
```

Any ticker yfinance can resolve works in any list — stocks, indexes
(`^GSPC`), FX pairs (`EURUSD=X`), futures (`GC=F`), Treasury yields
(`^TNX`), or crypto (`BTC-USD`) — so all asset types live in one file. A
ticker line before any `[Name]` header is ignored; everything after a
header belongs to that list until the next header.

### Crypto

Top 10 cryptocurrencies by market cap, via CoinGecko's free public API
(no key required — yfinance has no market-cap ranking for crypto).
Deliberately minimal: name, symbol, price, market cap, 24h volume, 24h %
change. Price formatting scales decimal precision to the price, since coin
prices span orders of magnitude (BTC ~$65k vs. SHIB ~$0.00001). Name and
symbol columns are sized to the widest entry in each batch rather than a
fixed width, since some tickers (e.g. `FIGR_HELOC`) run much longer than
the usual 3-5 letters.

### FX Rates

8 major currency pairs via yfinance, each shown with the non-USD
currency's flag emoji (USD itself isn't flagged, as the common side of
every pair here). Flag emoji are variable-width across terminals, so
column alignment is computed from the visible (flag-stripped) label length
rather than raw string length.

### Futures

4 major equity index futures (E-mini S&P 500, Nasdaq 100, Dow, Russell
2000) plus 4 key commodities (crude oil, gold, silver, natural gas), via
yfinance.

### Bonds

U.S. Treasury yield curve: 13-week, 5-year, 10-year, 30-year. Scoped to the
U.S. for now — free, reliable tickers for other sovereigns' government
bond yields aren't consistently available the way U.S. Treasuries are on
yfinance. Multi-country coverage is a roadmap item rather than something
faked with unreliable sources.

## Logging

Two log files are created next to the script on first run and appended to
on every run after (a "Session started" line marks each new run):

- **`input_log.txt`** — every prompt shown and what was typed in response,
  timestamped to the second. Captured automatically via a drop-in
  replacement for the builtin `input()`, so no feature needs to log its
  own prompts.
- **`events_log.txt`** — major events (menu selections, data fetches, key
  results) and every warning/error, timestamped to the millisecond. The
  `warn()` helper in `logger.py` prints the same `[warn] ...` console
  message used throughout the codebase and records it here at the same
  time, so console output is unchanged.

## Module reference

- `main.py` — menu loop, banner, sets up logging first, dispatches to all
  nine features. Each dispatch is wrapped so an error in one feature is
  logged and shown cleanly rather than crashing the app.
- `logger.py` — input and event logging (see above).
- `utils.py` — shared formatting helpers, CAPM/WACC math, and the terminal
  color gradient helper (`gradient_color()`).
- `stock_info.py`, `projector.py`, `market_info.py`, `portfolio.py`,
  `watchlist.py`, `crypto_info.py`, `forex.py`, `futures.py`, `bonds.py` —
  one feature each, described above.

**Naming note:** `crypto_info.py` and `forex.py` are deliberately not named
`crypto.py` / `fx.py`. `fx` collides with an unrelated third-party PyPI
package of the same name, which can silently shadow a local `fx.py`
depending on the environment. `crypto.py` has the same risk from
`pycryptodome`, which installs itself as `Crypto` — on case-insensitive
filesystems (Windows, default macOS) that can match a lowercase
`crypto.py` too.

## Data sources & conventions

**Prices and fundamentals** come from `yfinance` (unofficial, but actively
maintained). `finvizfinance` is a reasonable fallback/cross-check to add
if a given field proves unreliable for certain tickers.

**CAPM and WACC are always computed manually** — no free API reports these
directly:
- `CAPM = Rf + Beta × ERP` — `Rf` is the live 10-Year Treasury yield
  (`^TNX` via yfinance), `Beta` comes from yfinance, `ERP` defaults to
  5.5% (`DEFAULT_MARKET_RISK_PREMIUM` in `utils.py`).
- `WACC = (E/V)×Re + (D/V)×Rd×(1−Tax)` — cost of debt from interest
  expense ÷ total debt (falls back to `Rf + 2%`); tax rate is the
  effective rate from the income statement (falls back to the 21% U.S.
  statutory rate).

**Percent field conventions:** yfinance is inconsistent about how it
scales percent-like fields. `dividendYield` comes back already scaled as a
percent (`0.44` means 0.44%, not a 0.44 fraction) — formatted with
`fmt_pct_raw()`, no further scaling. Margin/return/growth fields
(`profitMargins`, `returnOnEquity`, `revenueGrowth`, `earningsGrowth`,
etc.) are genuine fractions and can legitimately exceed 1 (e.g. a 150% ROE
is possible for a high-leverage or buyback-heavy company) — formatted with
`fmt_pct()`, which multiplies by 100. Each field is handled according to
its known convention rather than inferred from magnitude, since no single
heuristic covers both cases correctly. See `utils.py`.

**AAII Sentiment** pulls from AAII's official spreadsheet
(`https://www.aaii.com/files/surveys/sentiment.xls`) via `requests` with
browser-style headers (a bare `pandas.read_excel(url)` call sends no
headers and gets blocked by AAII's WAF). Falls back to scraping the
~20-week table on AAII's public results page if the spreadsheet pull
fails. Column matching is done by name, not position, so minor formatting
changes to AAII's sheet shouldn't break it.

**CNN Fear & Greed** reads CNN's internal endpoint (no official public
API). Captures the headline score plus all 7 component indicators
(momentum, price strength/breadth, put/call, volatility, junk bond and
safe-haven demand), returned alongside the console summary for later
charting.

**CBOE put/call ratio** is a best-effort scrape of CBOE's daily stats page
(no free historical API) — latest reading only, not a series.

**TQQQ and VIX** are pulled the same way as the other indexes. VIX's
console color follows the same up-is-green/down-is-red convention as
every other row, even though a rising VIX is conventionally a bearish
signal — worth flipping in `market_info.py` if inverted semantics are
preferred for that one row specifically.

**Color coding:** index/FX/futures % moves and Fear & Greed scores are
printed with a 24-bit ANSI color gradient (`gradient_color()` in
`utils.py`) — white at the neutral point, fading to deep red at the
bearish/fearful extreme and deep green at the bullish/greedy extreme,
scaled to distance from neutral. Indexes/futures use 0% as neutral,
clamped at ±5%; FX clamps at ±2%; Fear & Greed uses 50 as neutral, clamped
at 0/100. The same helper drives portfolio and watchlist day-change
coloring. Requires a terminal with 24-bit color support (most modern
terminals); `colorama` is initialized for compatibility with older Windows
`cmd.exe`.

## Roadmap

- Web app version
- Charting, using the price/sentiment history data already being captured
- Portfolio cost basis / gain-loss tracking
- Multi-country government bond yields, pending a reliable free source
- Additional metrics in `current_stock_info` (e.g. Piotroski score)
- `finvizfinance` as a secondary data source / cross-check
