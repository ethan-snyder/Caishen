"""
api.py — Caishen's web API.

FastAPI wrapper around the existing Caishen modules (stock_info, market_info,
portfolio, watchlist, crypto_info, forex, futures, bonds). Each endpoint
calls a "get_*_full()" / "*_full()" data function that returns clean,
JSON-serializable, frontend-shaped data rather than the console-printing
CLI functions those same modules also expose.

Run:  uvicorn api:app --reload --port 8000
"""

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

app = FastAPI(title="Caishen API")

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


def _safe_call(fn, *args, **kwargs):
    """Runs a data-fetch function and turns any exception into a 502 rather
    than a raw 500 traceback, since these are almost always upstream data
    provider failures (network, rate limit, changed page structure) rather
    than bugs in the endpoint itself."""
    try:
        return fn(*args, **kwargs)
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
