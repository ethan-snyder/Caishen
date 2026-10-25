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
  value: number | null
  change: number | null
  change_pct: number | null
}

export interface FearGreedComponent {
  score: number | null
  rating: string | null
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
    components: Record<string, FearGreedComponent>
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
  rank: number | null
  name: string
  symbol: string
  price: number | null
  change_24h: number | null
  change_pct_24h: number | null
  market_cap: number | null
  volume: number | null
  dominance: number | null
}

export const fetchCrypto = (n = 10) => request<CryptoCoin[]>(`/api/crypto?n=${n}`)

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
// Trade (country imports/exports)
// ---------------------------------------------------------------------

export type TradeFlow = 'X' | 'M'

export interface TradeCountry {
  code: number
  iso2: string
  iso3: string
  name: string
  flag: string | null
}

export interface TradeGroup {
  id: string
  name: string
}

export interface TradeSectionMeta {
  id: string
  name: string
  short: string
  group: string
  chapters?: [number, number]
}

export interface TradeMeta {
  countries: TradeCountry[]
  default_heatmap: string[]
  groups: TradeGroup[]
  sections: TradeSectionMeta[]
  years: number[]
}

export interface TradeChapter {
  code: string
  name: string
  value: number
  share: number | null
  section?: string
  group?: string
}

/** An HS4 heading (or a chapter-level fallback / "Other ..." remainder). */
export interface TradeProduct {
  code: string
  name: string
  full: string
  chapter: string
  value: number
  share: number | null          // % of the country's total flow
  section_share: number | null  // % of its section
  section?: string
}

export interface TradeSection extends Omit<TradeSectionMeta, 'chapters'> {
  value: number
  share: number | null
  chapters: TradeChapter[]
  products: TradeProduct[]
}

export interface TradeProfile {
  country: TradeCountry
  flow: TradeFlow
  flow_name: string
  year: number | null
  world_exports: number | null
  world_imports: number | null
  total: number | null
  sections: TradeSection[]
  top_chapters: TradeChapter[]
  top_products: TradeProduct[]
  /** 'HS4' = product headings; 'HS2' = chapter-level fallback */
  detail: 'HS4' | 'HS2' | null
  source: string
  note?: string
}

export interface TradePartner {
  code: number
  name: string
  flag: string | null
  iso3: string | null
  exports: number
  imports: number
  total: number
  balance: number
  export_share: number | null
  import_share: number | null
}

export interface TradePartners {
  country: TradeCountry
  year: number | null
  world_exports: number | null
  world_imports: number | null
  partners: TradePartner[]
  source: string
  note?: string
}

export interface TradeTrendPoint {
  year: number
  exports: number | null
  imports: number | null
  balance: number | null
}

export interface TradeTrend {
  country: TradeCountry
  points: TradeTrendPoint[]
  source: string
  note?: string
}

export interface TradeHeatmapRow {
  country: TradeCountry
  total: number | null
  missing: boolean
  cells: Record<string, { value: number; share: number | null }>
}

export interface TradeHeatmap {
  flow: TradeFlow
  flow_name: string
  year: number
  rows: TradeHeatmapRow[]
  sections: TradeSectionMeta[]
  source: string
}

const yearParam = (year: number | null | undefined) => (year ? `&year=${year}` : '')

export const fetchTradeMeta = () => request<TradeMeta>('/api/trade/meta')

export const fetchTradeProfile = (iso3: string, flow: TradeFlow, year?: number | null) =>
  request<TradeProfile>(`/api/trade/profile/${encodeURIComponent(iso3)}?flow=${flow}${yearParam(year)}`)

export const fetchTradePartners = (iso3: string, year?: number | null) =>
  request<TradePartners>(`/api/trade/partners/${encodeURIComponent(iso3)}?limit=20${yearParam(year)}`)

export const fetchTradeTrend = (iso3: string) =>
  request<TradeTrend>(`/api/trade/trend/${encodeURIComponent(iso3)}`)

export interface WorldEconomy {
  iso3: string
  name: string
  flag: string | null
  region: string | null
  /** true when the COUNTRY tab (UN Comtrade product detail) supports it */
  has_profile: boolean
}

export interface LeaderboardRow extends WorldEconomy {
  rank: number
  rank_change: number | null
  exports: number
  imports: number
  total: number
  balance: number
  world_share: number | null
  growth: number | null
}

export interface TradeLeaderboard {
  year: number
  years: number[]
  world_exports: number | null
  world_imports: number | null
  world_total: number
  countries: LeaderboardRow[]
  regions: string[]
  source: string
  note: string
}

export interface ComparePoint {
  year: number
  exports: number | null
  imports: number | null
  total: number | null
  balance: number | null
  world_share?: number | null
}

export interface CompareSeries extends WorldEconomy {
  points: ComparePoint[]
}

export interface TradeCompare {
  start: number
  end: number
  series: CompareSeries[]
  world: ComparePoint[]
  countries: WorldEconomy[]
  max_countries: number
  source: string
}

export const fetchTradeLeaderboard = (year?: number | null) =>
  request<TradeLeaderboard>(`/api/trade/leaderboard${year ? `?year=${year}` : ''}`)

export const fetchTradeCompare = (countries: string[], start?: number | null, end?: number | null) =>
  request<TradeCompare>(
    `/api/trade/compare?countries=${encodeURIComponent(countries.join(','))}${start ? `&start=${start}` : ''}${end ? `&end=${end}` : ''}`,
  )

export const fetchTradeHeatmap = (countries: string[], flow: TradeFlow, year?: number | null) =>
  request<TradeHeatmap>(
    `/api/trade/heatmap?countries=${encodeURIComponent(countries.join(','))}&flow=${flow}${yearParam(year)}`,
  )

// ---------------------------------------------------------------------
// Price / yield history (click-to-chart popups)
// ---------------------------------------------------------------------

export type ChartKind = 'stock' | 'index' | 'crypto' | 'fx' | 'future' | 'bond'
export type ChartRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX'

export interface HistoryData {
  kind: ChartKind
  id: string
  symbol: string
  name: string
  /** how to format values: usd prices, index points, fx rate, or % yield */
  unit: 'usd' | 'points' | 'rate' | 'yield'
  range: ChartRange
  ranges: ChartRange[]
  intraday: boolean
  points: { t: string; v: number }[]
  first: number | null
  last: number | null
  change: number | null
  change_pct: number | null
  high: number | null
  low: number | null
  source: string
}

export const fetchHistory = (kind: ChartKind, id: string, range: ChartRange) =>
  request<HistoryData>(`/api/history?kind=${kind}&id=${encodeURIComponent(id)}&range=${range}`)

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
