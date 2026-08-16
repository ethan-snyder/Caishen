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

  volume: number | null
  avgVolume: number | null
  /** ISO date the stock must be held by to receive the dividend. */
  exDividendDate: string | null
  /** ISO date the dividend is actually paid. */
  dividendDate: string | null

  /** Fractions, not percentages (0.243 = 24.3%). ROE can legitimately
   * exceed 1.0, so these are never rescaled by magnitude. */
  profitMargin: number | null
  operatingMargin: number | null
  returnOnAssets: number | null
  returnOnEquity: number | null

  revenue: number | null
  totalCash: number | null
  totalDebt: number | null
  /** yfinance reports this percentage-style (154.5 means 1.545x). */
  debtToEquity: number | null
  netIncome: number | null
  ebitda: number | null
}

export type StockRange = '1d' | '1w' | '1mo' | '3mo' | '6mo' | '1y' | '3y' | '5y' | 'all'

export interface StockHistoryPoint {
  date: string
  value: number
}

export interface StockHistory {
  ticker: string
  range: StockRange
  points: StockHistoryPoint[]
}

export function fetchStockHistory(ticker: string, range: StockRange): Promise<StockHistory> {
  return request<StockHistory>(`/api/stock/${encodeURIComponent(ticker)}/history?range=${range}`)
}

export interface AnalystPriceTargets {
  current: number | null
  low: number | null
  mean: number | null
  median: number | null
  high: number | null
}

export interface RecommendationPeriod {
  /** yfinance's relative label: "0m" = current month, "-1m" = last. */
  period: string
  strong_buy: number
  buy: number
  hold: number
  sell: number
  strong_sell: number
  total: number
}

export interface RatingChange {
  date: string
  firm: string | null
  action: string | null
  to_grade: string | null
  from_grade: string | null
}

export interface AnalystInsights {
  ticker: string
  /** Null when analysts don't cover this ticker -- render nothing rather
   * than an empty chart, which reads as "zero analysts". */
  price_targets: AnalystPriceTargets | null
  recommendations: RecommendationPeriod[] | null
  latest_ratings: RatingChange[] | null
  recommendation: string | null
  num_analysts: number | null
}

export function fetchAnalystInsights(ticker: string): Promise<AnalystInsights> {
  return request<AnalystInsights>(`/api/stock/${encodeURIComponent(ticker)}/analysts`)
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

export interface HeatmapTicker {
  ticker: string
  name: string
  sector: string
  /** 3 = largest tile, 1 = smallest -- a static rank-based bucket, not a
   * live market cap (see backend/heatmap.py for why). */
  size_tier: 1 | 2 | 3
  price: number | null
  change_pct: number | null
}

export interface HeatmapData {
  tickers: HeatmapTicker[]
  /** Always "sp500_top50" today -- the top 50 S&P 500 names by weight,
   * not all 500 (one batched request vs. hundreds; see backend). */
  universe: string
}

export const fetchHeatmap = () => request<HeatmapData>('/api/market/heatmap')

// ---------------------------------------------------------------------
// Economics
// ---------------------------------------------------------------------

export interface EconPoint {
  date: string
  value: number
}

export interface EconIndicator {
  key: string
  label: string
  sub: string
  group: string
  /** Suffix for the headline number: '%', 'K', 'M', 'T', or ''. */
  unit: string
  /** Whether a rise is good news, bad news, or neither -- drives tile
   * coloring. Rising unemployment and rising inflation are bad; rising
   * GDP is good; the Fed funds rate is neither in itself. */
  direction: 'up_good' | 'up_bad' | 'neutral'
  series_id: string
  source: string
  /** What the headline number means: the published level, a 12-month
   * percent change, or the change vs. the prior observation. */
  transform: 'level' | 'yoy' | 'mom_change'
  value: number | null
  prev: number | null
  change: number | null
  date: string | null
  /** Already in the transformed space, so the sparkline plots the same
   * quantity the headline number reports. */
  history: EconPoint[]
}

export interface EconRelease {
  date: string
  name: string
  release_id: number | null
  is_past: boolean
}

export interface FedPublication {
  feed: string
  feed_label: string
  title: string
  link: string | null
  published: string | null
  summary: string | null
}

export interface EconData {
  indicators: EconIndicator[]
  groups: string[]
  calendar: EconRelease[]
  /** Set when the calendar specifically failed (e.g. no FRED_API_KEY),
   * while the rest of the payload is still usable. */
  calendar_error: string | null
  fed: FedPublication[]
  as_of: string
}

export const fetchEcon = () => request<EconData>('/api/econ')

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
  /** ISO 3166-1 alpha-2 country code (or "eu" for the euro) for building
   * a flagcdn.com SVG URL -- replaces the old Unicode flag emoji, which
   * had no reliable font support in this app. */
  base_flag_code: string | null
  quote_flag_code: string | null
  base_symbol: string | null
  quote_symbol: string | null
  rate: number | null
  change: number | null
  change_pct: number | null
  high: number | null
  low: number | null
  /** Most FX tickers report no real volume (spot FX has no centralized
   * tape) -- null rather than a misleading 0. */
  volume: number | null
  exchange: string | null
  bid: number | null
  ask: number | null
  bid_ask_is_estimate: boolean
}

export const fetchFx = () => request<FxPair[]>('/api/fx')

export type FxRange = '1h' | '12h' | '24h' | '3mo' | '1y' | '3y' | '5y' | '10y' | 'all'

export interface FxHistoryPoint {
  date: string
  value: number
}

export interface FxHistory {
  pair: string
  range: FxRange
  points: FxHistoryPoint[]
}

/** `pairKey` is the no-separator form, e.g. "EURUSD" (matches
 * `FxPair.base + FxPair.quote`) -- URL-safe unlike "EUR/USD". */
export const fetchFxHistory = (pairKey: string, range: FxRange) =>
  request<FxHistory>(`/api/fx/${encodeURIComponent(pairKey)}/history?range=${range}`)

export interface FuturesContract {
  name: string
  symbol: string
  /** "$" for contracts genuinely quoted as a dollar price (oil, metals,
   * grains); null for equity index futures, whose price is an index
   * level rather than a literal dollar figure. */
  currency_symbol: string | null
  expiry: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  year_change_pct: number | null
  volume: number | null
  open_interest: number | null
}

export const fetchFutures = () => request<FuturesContract[]>('/api/futures')

export type FuturesRange = '1h' | '12h' | '24h' | '3mo' | '1y' | '3y' | '5y' | '10y' | 'all'

export interface FuturesHistoryPoint {
  date: string
  value: number
}

export interface FuturesHistory {
  symbol: string
  range: FuturesRange
  points: FuturesHistoryPoint[]
}

export const fetchFuturesHistory = (symbol: string, range: FuturesRange) =>
  request<FuturesHistory>(`/api/futures/${encodeURIComponent(symbol)}/history?range=${range}`)

export interface BondYield {
  term: string
  name: string
  yield: number | null
  change: number | null
  prev: number | null
}

/**
 * A FRED-sourced yield row -- either a foreign sovereign 10Y (monthly
 * OECD data, hence the per-row `date`) or a corporate rating tier
 * (ICE BofA, daily).
 */
export interface YieldCurvePoint {
  tenor: string
  yield: number | null
}

export interface FredYieldRow {
  key: string
  label: string
  name: string
  yield: number | null
  change: number | null
  /** Observation date of this reading -- important for the sovereign
   * rows, which are monthly and published with a lag. */
  date: string | null
  default_hidden: boolean
  /** Short-end + 10Y points, sovereigns only. Null when no short-end
   * series exists for that country. */
  curve: YieldCurvePoint[] | null
}

export interface BondData {
  treasuries: BondYield[]
  sovereigns: FredYieldRow[]
  corporate_ig: FredYieldRow[]
  corporate_hy: FredYieldRow[]
}

export const fetchBonds = () => request<BondData>('/api/bonds')

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
  cost_basis: number | null
  /** Per-share move today. */
  day_change: number | null
  day_change_pct: number | null
  /** This position's dollar P/L today (day_change * qty). */
  day_gain: number | null
  gain: number | null
  gain_pct: number | null
  pe: number | null
  forward_pe: number | null
  peg: number | null
  ps: number | null
  pb: number | null
  beta: number | null
  eps: number | null
  market_cap: number | null
  /** Already normalized to a percent (e.g. 0.75 means 0.75%). */
  dividend_yield: number | null
  /** Annual dividend per share, in dollars. */
  dividend_rate: number | null
  /** Annual dividend for this whole position (dividend_rate * qty). */
  annual_dividend: number | null
  week52_high: number | null
  week52_low: number | null
  volume: number | null
  avg_volume: number | null
}

export interface PortfolioData {
  holdings: PortfolioHolding[]
  total_value: number
  total_cost_basis: number | null
  total_gain: number | null
  total_gain_pct: number | null
  total_day_gain: number | null
  total_day_gain_pct: number | null
  total_annual_dividend: number | null
  total_dividend_yield: number | null
  errors: string[]
}

export type PortfolioRange = '1d' | '1w' | '1mo' | '3mo' | '6mo' | '1y' | '3y' | '5y' | 'all'

export interface PortfolioHistoryPoint {
  date: string
  value: number
}

export interface PortfolioHistory {
  range: PortfolioRange
  points: PortfolioHistoryPoint[]
  /** Total cost basis, for drawing a break-even reference line. Null when
   * no holding has an avg cost recorded. */
  cost_basis: number | null
  /** Tickers with no usable price history, excluded from the series. */
  skipped: string[]
}

export const fetchPortfolioHistory = (range: PortfolioRange) =>
  request<PortfolioHistory>(`/api/portfolio/history?range=${range}`)

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
  sector: string | null
  price: number | null
  change: number | null
  change_pct: number | null
  pe: number | null
  forward_pe: number | null
  peg: number | null
  ps: number | null
  pb: number | null
  beta: number | null
  eps: number | null
  market_cap: number | null
  /** Already normalized to a percent (e.g. 0.75 means 0.75%). */
  dividend_yield: number | null
  dividend_rate: number | null
  week52_high: number | null
  week52_low: number | null
  volume: number | null
  avg_volume: number | null
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
