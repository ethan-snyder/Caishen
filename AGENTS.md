# caishen-web

React + Vite + Tailwind CSS frontend, originally scaffolded by Figma Make,
now running standalone against a FastAPI backend (`backend/`) instead of
inside the Figma Make runtime.

## Running locally

Two processes, run separately:

```bash
# Backend (from backend/)
pip install -r requirements.txt
uvicorn api:app --reload --port 8000

# Frontend (from repo root)
pnpm install
pnpm dev
```

The Vite dev server (default port 8443) proxies `/api/*` to `http://localhost:8000`
(see the `server.proxy` block in `vite.config.ts`), so the frontend can just
call `fetch('/api/...')` with no CORS setup needed in dev. Override the
backend's address with the `API_PROXY_TARGET` env var if it's running
somewhere other than `localhost:8000`.

## Project Structure

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Sidebar/tab shell; renders one of the tab components based on selected state
- `src/components/` - One file per tab (StockInfo, Projector, MarketOverview, Crypto, Forex, Futures, Bonds, Portfolio, Watchlist), plus `StatusBlock.tsx` for shared loading/error UI
- `src/lib/api.ts` - Typed fetch client for every backend endpoint
- `src/lib/format.ts` - Shared number/currency formatting helpers
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite config: React, Tailwind CSS v4, the `@` alias for `src`, and the `/api` dev proxy
- `.mise.toml` - Toolchain versions for Node.js and pnpm
- `backend/` - FastAPI app (`api.py`) plus the underlying Caishen data modules (`stock_info.py`, `market_info.py`, `portfolio.py`, `watchlist.py`, `crypto_info.py`, `forex.py`, `futures.py`, `bonds.py`, `utils.py`, `logger.py`) and a standalone terminal CLI (`cli.py`) that reuses the same modules. See `backend/README.md`.

**Not Figma Make specific anymore:** this repo no longer depends on a Figma
Make runtime, `.figma/make/site.json`, or the Figma-specific Vite plugins
(site metadata injection, error-overlay replay, the design-kit route) that
the original scaffold included — those only work inside that environment
and have been removed from `vite.config.ts` in favor of a plain Vite +
React + Tailwind + API-proxy setup. `index.html`'s Figma template comments
(`<!-- figma:title -->` etc.) have likewise been replaced with real content.

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt
- Backend: FastAPI, uvicorn, yfinance, requests, pandas (see `backend/requirements.txt`)

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Most components in this repo use inline `style={{...}}` objects (matching the CRT-terminal aesthetic established by the original Figma Make output) rather than Tailwind utility classes — follow that existing convention within `src/components/` rather than mixing approaches. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
- Run `pnpm typecheck` (`tsc --noEmit`) before considering frontend work done.
- Every data-driven component follows the same pattern: `useState` for the fetched data + an `error` string, a `useEffect`/handler that calls the relevant `src/lib/api.ts` function, and `<Loading />` / `<ErrorBlock />` from `src/components/StatusBlock.tsx` for the pending/failure states. Match this pattern in any new tab rather than inventing a new one.
- Don't fabricate data to fill out a UI element the backend doesn't have a real source for (see `backend/README.md` for examples: corporate bonds, multi-country yields, futures open interest). Show "N/A"/"—" or omit the section, and say why in a comment, the way the existing tabs do.
