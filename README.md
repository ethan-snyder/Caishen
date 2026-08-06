# Caishen (v0.1 — terminal)

An all-in-one investing tool: current stock metrics, a 3-year price
projector, and a market overview. Menu-driven, runs in the terminal.

## Setup

```bash
pip install -r requirements.txt
python main.py
```

Requires Python 3.9+.

## What's in here

- `main.py` — menu loop, ties the three features together.
- `stock_info.py` — `current_stock_info()`: Price, PE, forward PE, PEG, P/S,
  P/B, WACC, Dividend, Dividend yield, EPS, 52-week range, Cash Per Share,
  CAPM for a given ticker.
- `projector.py` — `projector()`: walks you through bear/base/bull PE and
  growth (or direct EPS) assumptions for each of the next 3 years and maps
  out the implied price via `Price = EPS × PE`.
- `market_info.py` — `market_info()`: DJI, NASDAQ, S&P 500, Russell 2000,
  Nikkei 225, KOSPI, plus CNN Fear & Greed, CBOE put/call ratio, and AAII
  investor sentiment.
- `utils.py` — shared formatting helpers and the CAPM/WACC math.

## Data sources & reliability notes

**Prices and fundamentals** come from `yfinance`. It's unofficial (scrapes
Yahoo's own endpoints under the hood) but it's actively maintained and has
gotten noticeably more reliable over the last couple of years — worth giving
another shot if your earlier attempts with it were rough. `finvizfinance` is
a reasonable fallback/cross-check to add later if any yfinance field turns
out to be flaky for a given ticker.

**CAPM and WACC are always computed manually** — no free API reports these
directly, so they're derived:
- `CAPM = Rf + Beta × ERP` — `Rf` is the live 10-Year Treasury yield (`^TNX`
  via yfinance), `Beta` comes from yfinance, and `ERP` (equity risk premium)
  defaults to 5.5%, a commonly used long-run historical average. Change
  `DEFAULT_MARKET_RISK_PREMIUM` in `utils.py` if you want a different
  assumption.
- `WACC = (E/V)×Re + (D/V)×Rd×(1−Tax)` — cost of debt is approximated from
  interest expense ÷ total debt off the income statement (falls back to
  `Rf + 2%` if that's not available or looks unreasonable); tax rate is
  the effective rate from the income statement (falls back to the 21% U.S.
  statutory rate).

**A few other fields have manual fallbacks** for when yfinance's own field is
missing: P/S from market cap ÷ revenue, P/B from price ÷ book value per
share, cash per share from total cash ÷ shares outstanding, and PEG from
PE ÷ earnings growth rate.

**Market sentiment indicators are the least reliable piece** — CNN's Fear &
Greed Index, CBOE's put/call ratio, and AAII's sentiment survey don't have
official free APIs, so `market_info.py` reads unofficial/internal endpoints
or scrapes public pages. These are wrapped so a failure prints "N/A" instead
of crashing the program, but if one of them stops returning data, the
provider likely changed their page/endpoint structure — check the URL and
parsing logic for that source in `market_info.py`.

> Note: this was built and tested in a sandboxed environment without direct
> internet access to Yahoo/CNN/CBOE/AAII, so the calculation logic was
> validated with mocked data (confirmed correct — see the WACC/CAPM math
> above) but the live scrapers themselves haven't been exercised against the
> real endpoints yet. Run it locally and let me know if any of the three
> sentiment sources need adjusting.

## Roadmap ideas (not built yet)

- Web app version
- Additional metrics in `current_stock_info` (e.g. debt/equity, FCF yield,
  Piotroski score)
- Saving/loading projector scenarios
- `finvizfinance` as a secondary data source / cross-check
