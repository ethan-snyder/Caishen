// src/lib/api.ts
//
// Thin typed wrapper around the FastAPI backend. Every function returns a
// Promise that either resolves with the parsed JSON or throws an Error
// with a readable message -- components are expected to catch that and
// show it rather than letting it bubble into a blank screen.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // response wasn't JSON -- fall back to statusText
    }
    throw new Error(`${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------
// Stock info
// ---------------------------------------------------------------------

export interface StockData {
  ticker: string
  name: string
  price: number
  change: number | null
  changePct: number | null
  pe: number | null
  forwardPe: number | null
  peg: number | null
  ps: number | null
  pb: number | null
  wacc: string
  capm: string
  dividend: number | null
  dividendYield: string
  eps: number | null
  week52High: number | null
  week52Low: number | null
  cashPerShare: number | null
  beta: number | null
  marketCap: string
  rf: string
  erp: string
}

export interface StockQuote {
  ticker: string
  name: string
  price: number
  change: number | null
  change_pct: number | null
  pe: number | null
  eps: number | null
}

export const fetchStock = (ticker: string) => request<StockData>(`/api/stock/${encodeURIComponent(ticker)}`)
export const fetchStockQuote = (ticker: string) =>
  request<StockQuote>(`/api/stock/${encodeURIComponent(ticker)}/quote`)

// ---------------------------------------------------------------------
// Market overview
// ---------------------------------------------------------------------

export interface MarketIndex {
  name: string
  symbol: string
  region: string
  /** How to render the number: '$' prefix, bare level, or '%' suffix. */
  quote: 'usd' | 'level' | 'pct'
  /** Ships available-but-off in the Market page's edit-layout tray. */
  default_hidden: boolean
  value: number | null
  change: number | null
  change_pct: number | null
}

export interface FearGreedSeries {
  label: string
  points: SentimentSeriesPoint[]
}

export interface FearGreedComponent {
  key: string
  label: string
  subtitle: string
  /** How to render `value`: '%' suffix, bare 2dp, or thousands-separated. */
  unit: 'pct' | 'ratio' | 'level'
  /** Today's raw reading of the primary series (not the 0-100 score). */
  value: number
  score: number | null
  rating: string | null
  /**
   * One or two lines. Momentum and volatility each carry their own moving
   * average as a second series, charted together.
   */
  series: FearGreedSeries[]
}

export interface SentimentSeriesPoint {
  date: string
  value: number
}

export interface SentimentSeries {
  value: number
  date: string
  history: SentimentSeriesPoint[]
}

export interface MarketData {
  indexes: MarketIndex[]
  fear_greed: {
    score: number | null
    rating: string | null
    /** Prior readings CNN shows beside its gauge. */
    previous: {
      close: number | null
      week: number | null
      month: number | null
      year: number | null
    }
    /** ~1y of daily headline scores, for the trend chart. */
    history: SentimentSeriesPoint[]
    components: FearGreedComponent[]
  }
  put_call_ratio: number | null
  sentiment: {
    consumer_sentiment: SentimentSeries | null
    financial_stress: SentimentSeries | null
    high_yield_spread: SentimentSeries | null
    futures_positioning: SentimentSeries | null
    policy_uncertainty: SentimentSeries | null
    yield_curve_spread: SentimentSeries | null
    ig_credit_spread: SentimentSeries | null
    inflation_expectations: SentimentSeries | null
  }
}

export const fetchMarket = () => request<MarketData>('/api/market')

// ---------------------------------------------------------------------
// Crypto / FX / Futures / Bonds
// ---------------------------------------------------------------------

export interface CryptoCoin {
  id: string | null
  rank: number | null
  name: string
  symbol: string
  image: string | null
  price: number | null
  change_24h: number | null
  change_pct_24h: number | null
  change_pct_1h: number | null
  change_pct_7d: number | null
  change_pct_30d: number | null
  change_pct_1y: number | null
  market_cap: number | null
  market_cap_change_pct_24h: number | null
  fully_diluted_valuation: number | null
  volume: number | null
  dominance: number | null
  high_24h: number | null
  low_24h: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  ath: number | null
  ath_change_pct: number | null
  ath_date: string | null
  atl: number | null
  atl_change_pct: number | null
  atl_date: string | null
}

export const fetchCrypto = (n = 10) => request<CryptoCoin[]>(`/api/crypto?n=${n}`)

export type CryptoRange =
  | '1h' | '12h' | '24h' | '1w' | '1mo' | '3mo' | '6mo' | '1y' | '3y' | '5y' | '10y' | 'all'

export interface CryptoHistoryPoint {
  date: string
  value: number
}

export interface CryptoHistory {
  prices: CryptoHistoryPoint[]
  range: CryptoRange
}

export const fetchCryptoHistory = (coinId: string, range: CryptoRange) =>
  request<CryptoHistory>(`/api/crypto/${encodeURIComponent(coinId)}/history?range=${range}`)

export interface FxPair {
  pair: string
  base: string
  quote: string
  base_flag: string | null
  quote_flag: string | null
  rate: number | null
  change: number | null
  change_pct: number | null
  bid: number | null
  ask: number | null
  bid_ask_is_estimate: boolean
}

export const fetchFx = () => request<FxPair[]>('/api/fx')

export interface FuturesContract {
  name: string
  symbol: string
  expiry: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  volume: number | null
  open_interest: number | null
}

export const fetchFutures = () => request<FuturesContract[]>('/api/futures')

export interface BondYield {
  term: string
  name: string
  yield: number | null
  change: number | null
  prev: number | null
}

export const fetchBonds = () => request<BondYield[]>('/api/bonds')

// ---------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------

export interface PortfolioHolding {
  ticker: string
  name: string | null
  sector: string | null
  qty: number
  avg_cost: number | null
  price: number | null
  value: number | null
  day_change_pct: number | null
  gain: number | null
  gain_pct: number | null
}

export interface PortfolioData {
  holdings: PortfolioHolding[]
  total_value: number
  total_cost_basis: number | null
  total_gain: number | null
  total_gain_pct: number | null
  errors: string[]
}

export const fetchPortfolio = () => request<PortfolioData>('/api/portfolio')

export const addPortfolioHolding = (ticker: string, qty: number, avgCost?: number) =>
  request<PortfolioData>('/api/portfolio', {
    method: 'POST',
    body: JSON.stringify({ ticker, qty, avg_cost: avgCost ?? null }),
  })

export const removePortfolioHolding = (ticker: string) =>
  request<PortfolioData>(`/api/portfolio/${encodeURIComponent(ticker)}`, { method: 'DELETE' })

// ---------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------

export interface WatchlistItem {
  ticker: string
  name: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  pe: number | null
}

export type WatchlistsData = Record<string, WatchlistItem[]>

export const fetchWatchlists = () => request<WatchlistsData>('/api/watchlists')

export const createWatchlist = (name: string) =>
  request<WatchlistsData>('/api/watchlists', { method: 'POST', body: JSON.stringify({ name }) })

export const addWatchlistTicker = (listName: string, ticker: string) =>
  request<WatchlistsData>(`/api/watchlists/${encodeURIComponent(listName)}/tickers`, {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  })

export const removeWatchlistTicker = (listName: string, ticker: string) =>
  request<WatchlistsData>(
    `/api/watchlists/${encodeURIComponent(listName)}/tickers/${encodeURIComponent(ticker)}`,
    { method: 'DELETE' },
  )
