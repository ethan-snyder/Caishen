# Caishen

An all-in-one investing terminal: stock research, a price projector, market
overview, portfolio and watchlist tracking, and quick reference data for
crypto, FX, futures, and bonds. Originally a Python CLI (still available as
`backend/cli.py`); this is the web version — a Figma Make-designed
CRT-terminal UI wired to a FastAPI backend built on the same data logic.

## Quick start

```bash
# Terminal 1 — backend
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000

# Terminal 2 — frontend
pnpm install
pnpm dev
```

Open the URL Vite prints (default `http://localhost:8443`). The dev server
proxies `/api/*` to the backend, so both need to be running for the UI to
show live data — see `AGENTS.md` and `backend/README.md` for details.

## Layout

```
src/            Frontend (React + Vite + Tailwind v4)
  components/   One file per tab + shared loading/error UI
  lib/          API client + formatting helpers
backend/        FastAPI app + the underlying data modules
  api.py        HTTP layer
  cli.py        Terminal version of the same features (no browser needed)
  *.py          Per-feature data modules (stock_info, market_info, ...)
```

## Status

All nine tabs are wired to live data with no mock arrays left in the
frontend. Two structural differences from the original Figma Make mockups,
both intentional:

- **Watchlist** now supports multiple named lists (tabs + "new list"), since
  the backend was built around that and the original single-list UI
  couldn't represent it.
- **Portfolio** gained add/remove forms — the mockup displayed six
  hardcoded holdings with no way to change them.

See `backend/README.md` for exactly which fields are real data vs.
deliberately omitted (rather than faked) because no free source exists for
them yet.

## Verification

Backend: every `get_*_full()` function was tested against mocked
yfinance/CoinGecko/requests responses; the full FastAPI app was tested with
`TestClient` covering all endpoints including the portfolio/watchlist
add-remove flows.

Frontend: `tsc --noEmit` and `vite build` both pass clean. The full proxy
chain (Vite → FastAPI → yfinance/CoinGecko) was smoke-tested by running
both servers and curling through the proxy, including a write path
(create watchlist → read it back).

Neither was tested in an actual browser (no browser available in the build
environment) — worth a first real run to confirm the visual layout renders
as expected, though the underlying logic and data flow are verified.
