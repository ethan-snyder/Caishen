"""
api.py — Moneta's web API.

FastAPI wrapper around the existing Moneta modules (stock_info, market_info,
portfolio, watchlist, crypto_info, forex, futures, bonds, trade). Each endpoint
calls a "get_*_full()" / "*_full()" data function that returns clean,
JSON-serializable, frontend-shaped data rather than the console-printing
CLI functions those same modules also expose.

Run:  uvicorn api:app --reload --port 8000
"""

import math

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from logger import setup_logging, log_error
setup_logging()

import stock_info
import market_info
import portfolio
import watchlist
import crypto_info
import forex
import futures
import bonds
import trade
import history

app = FastAPI(title="Moneta API")

# The Vite dev server runs on 8443 by default (see AGENTS.md / vite.config.ts);
# also allow localhost:5173, Vite's own default, in case that's used instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8443", "http://127.0.0.1:8443",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sanitize_floats(obj):
    """Recursively replaces NaN/inf floats with None.

    Upstream providers (yfinance, scraped pages) occasionally hand back NaN
    for a missing/half-loaded data point instead of raising. A bare NaN
    isn't valid JSON -- Starlette's JSONResponse serializes with
    allow_nan=False, so it 500s at the response layer, past the try/except
    below since fn() itself succeeded. Scrub the whole payload before it
    gets there instead of relying on every data function to remember to
    check pd.isna() everywhere a float might originate."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_floats(v) for v in obj]
    return obj


def _safe_call(fn, *args, **kwargs):
    """Runs a data-fetch function and turns any exception into a 502 rather
    than a raw 500 traceback, since these are almost always upstream data
    provider failures (network, rate limit, changed page structure) rather
    than bugs in the endpoint itself."""
    try:
        return _sanitize_floats(fn(*args, **kwargs))
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"API call to {fn.__name__} failed", exc=e)
        raise HTTPException(status_code=502, detail=f"{fn.__name__} failed: {e}")


# ----------------------------------------------------------------------
# Stock info
# ----------------------------------------------------------------------

@app.get("/api/stock/{ticker}")
def get_stock(ticker: str):
    data = _safe_call(stock_info.get_stock_data_full, ticker)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for '{ticker}'")
    return data


@app.get("/api/stock/{ticker}/quote")
def get_stock_quote(ticker: str):
    """Lightweight price+EPS lookup -- used by the Projector to seed its
    base numbers without pulling the full stock-info payload."""
    data = _safe_call(stock_info.get_quote, ticker)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for '{ticker}'")
    return data


# ----------------------------------------------------------------------
# Market overview
# ----------------------------------------------------------------------

@app.get("/api/market")
def get_market():
    return _safe_call(market_info.get_market_data_full)


# ----------------------------------------------------------------------
# Crypto / FX / Futures / Bonds
# ----------------------------------------------------------------------

@app.get("/api/crypto")
def get_crypto(n: int = 10):
    return _safe_call(crypto_info.get_top_cryptos_full, n)


@app.get("/api/fx")
def get_fx():
    return _safe_call(forex.get_fx_data_full)


@app.get("/api/futures")
def get_futures():
    return _safe_call(futures.get_futures_data_full)


@app.get("/api/bonds")
def get_bonds():
    return _safe_call(bonds.get_bond_data_full)


# ----------------------------------------------------------------------
# Trade (country imports/exports -- see trade.py)
# ----------------------------------------------------------------------

def _trade_flow(flow: str) -> str:
    f = flow.strip().upper()
    if f not in ("X", "M"):
        raise HTTPException(status_code=400, detail="flow must be 'X' (exports) or 'M' (imports)")
    return f


def _trade_country(country: str) -> str:
    try:
        trade.resolve_country(country)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e.args[0]))
    return country


@app.get("/api/trade/meta")
def get_trade_meta():
    return trade.get_trade_meta_full()


@app.get("/api/trade/profile/{country}")
def get_trade_profile(country: str, flow: str = "X", year: int | None = None):
    return _safe_call(trade.get_trade_profile_full, _trade_country(country), _trade_flow(flow), year)


@app.get("/api/trade/partners/{country}")
def get_trade_partners(country: str, year: int | None = None, limit: int = 20):
    return _safe_call(trade.get_trade_partners_full, _trade_country(country), year, limit)


@app.get("/api/trade/trend/{country}")
def get_trade_trend(country: str):
    return _safe_call(trade.get_trade_trend_full, _trade_country(country))


@app.get("/api/trade/leaderboard")
def get_trade_leaderboard(year: int | None = None):
    return _safe_call(trade.get_trade_leaderboard_full, year)


@app.get("/api/trade/compare")
def get_trade_compare(countries: str | None = None, start: int | None = None, end: int | None = None):
    idents = [c for c in (countries or "").split(",") if c.strip()] or None
    return _safe_call(trade.get_trade_compare_full, idents, start, end)


@app.get("/api/trade/heatmap")
def get_trade_heatmap(countries: str | None = None, flow: str = "X", year: int | None = None):
    idents = [c for c in (countries or "").split(",") if c.strip()] or None
    return _safe_call(trade.get_trade_heatmap_full, idents, _trade_flow(flow), year)


# ----------------------------------------------------------------------
# Portfolio
# ----------------------------------------------------------------------

class HoldingIn(BaseModel):
    ticker: str
    qty: float
    avg_cost: float | None = None


@app.get("/api/portfolio")
def get_portfolio():
    return _safe_call(portfolio.get_portfolio_full)


@app.post("/api/portfolio")
def post_portfolio_holding(holding: HoldingIn):
    portfolio.add_holding(holding.ticker, holding.qty, holding.avg_cost)
    return _safe_call(portfolio.get_portfolio_full)


@app.delete("/api/portfolio/{ticker}")
def delete_portfolio_holding(ticker: str):
    removed = portfolio.remove_holding(ticker)
    if not removed:
        raise HTTPException(status_code=404, detail=f"'{ticker}' not found in portfolio")
    return _safe_call(portfolio.get_portfolio_full)


# ----------------------------------------------------------------------
# Watchlists
# ----------------------------------------------------------------------

class WatchlistTickerIn(BaseModel):
    ticker: str


class WatchlistNameIn(BaseModel):
    name: str


@app.get("/api/watchlists")
def get_watchlists():
    return _safe_call(watchlist.get_watchlists_full)


@app.post("/api/watchlists")
def post_watchlist(body: WatchlistNameIn):
    created = watchlist.add_watchlist(body.name)
    if not created:
        raise HTTPException(status_code=409, detail=f"Watchlist '{body.name}' already exists")
    return _safe_call(watchlist.get_watchlists_full)


@app.post("/api/watchlists/{list_name}/tickers")
def post_watchlist_ticker(list_name: str, body: WatchlistTickerIn):
    watchlist.add_ticker(list_name, body.ticker)
    return _safe_call(watchlist.get_watchlists_full)


@app.delete("/api/watchlists/{list_name}/tickers/{ticker}")
def delete_watchlist_ticker(list_name: str, ticker: str):
    removed = watchlist.remove_ticker(list_name, ticker)
    if not removed:
        raise HTTPException(status_code=404, detail=f"'{ticker}' not found in watchlist '{list_name}'")
    return _safe_call(watchlist.get_watchlists_full)


# ----------------------------------------------------------------------
# Price / yield history (click-to-chart popups -- see history.py)
# ----------------------------------------------------------------------

@app.get("/api/history")
def get_history(kind: str, id: str, range: str = "1Y"):
    try:
        history._resolve(kind, id)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e.args[0]) if e.args else str(e))
    if range.upper() not in history.RANGES:
        raise HTTPException(status_code=400, detail=f"range must be one of {', '.join(history.RANGES)}")
    data = _safe_call(history.get_history_full, kind, id, range)
    if not data["points"]:
        raise HTTPException(status_code=404, detail=f"No price history for {data['symbol']}")
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}
