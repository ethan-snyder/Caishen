// src/lib/valuation.ts
//
// Pure math behind the Projector's valuation models. Every function takes
// plain numbers (or null for "not entered / not available") and returns
// null rather than NaN/Infinity when an answer doesn't exist, so the UI can
// show "—" instead of garbage. All rates are in PERCENT (8 means 8%).

/** Input-field string -> number, or null when blank / not a number. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const finite = (v: number): number | null => (Number.isFinite(v) ? v : null)

// ---------------------------------------------------------------------
// EPS x P/E: compound EPS year by year, price = EPS x exit P/E
// ---------------------------------------------------------------------

export interface EpsYear { epsGrowth: string; pe: string }

export function projectEpsPe(years: EpsYear[], baseEps: number | null): (number | null)[] {
  let eps = baseEps
  return years.map(y => {
    const g = num(y.epsGrowth)
    const pe = num(y.pe)
    if (eps === null || g === null) { eps = null; return null }
    eps = eps * (1 + g / 100)
    if (pe === null) return null
    return finite(eps * pe)
  })
}

// ---------------------------------------------------------------------
// Revenue driver: revenue growth x net margin / share count -> EPS x P/E
// ---------------------------------------------------------------------

export interface DriverYear { revGrowth: string; netMargin: string; shareChange: string; pe: string }

export interface DriverRow {
  revenue: number | null
  netIncome: number | null
  shares: number | null
  eps: number | null
  price: number | null
}

export function projectDriver(
  years: DriverYear[], baseRevenue: number | null, baseShares: number | null,
): DriverRow[] {
  let revenue = baseRevenue
  let shares = baseShares
  return years.map(y => {
    const g = num(y.revGrowth)
    const margin = num(y.netMargin)
    const dShares = num(y.shareChange) ?? 0
    const pe = num(y.pe)
    revenue = revenue !== null && g !== null ? revenue * (1 + g / 100) : null
    shares = shares !== null ? shares * (1 + dShares / 100) : null
    const netIncome = revenue !== null && margin !== null ? revenue * (margin / 100) : null
    const eps = netIncome !== null && shares ? netIncome / shares : null
    const price = eps !== null && pe !== null ? finite(eps * pe) : null
    return { revenue, netIncome, shares, eps, price }
  })
}

// ---------------------------------------------------------------------
// EV / EBITDA: EBITDA x multiple = EV; EV - net debt = equity; / shares
// ---------------------------------------------------------------------

export interface EvYear { ebitdaGrowth: string; multiple: string }

export interface EvRow {
  ebitda: number | null
  enterpriseValue: number | null
  equityValue: number | null
  /** Null when equity is <= 0 (net debt swallows the whole EV) -- a
   * negative share price isn't a thing. */
  price: number | null
}

export function projectEv(
  years: EvYear[], baseEbitda: number | null, netDebt: number | null, shares: number | null,
): EvRow[] {
  let ebitda = baseEbitda
  const debt = netDebt ?? 0
  return years.map(y => {
    const g = num(y.ebitdaGrowth)
    const mult = num(y.multiple)
    ebitda = ebitda !== null && g !== null ? ebitda * (1 + g / 100) : null
    const enterpriseValue = ebitda !== null && mult !== null ? ebitda * mult : null
    const equityValue = enterpriseValue !== null ? enterpriseValue - debt : null
    const price = equityValue !== null && equityValue > 0 && shares ? finite(equityValue / shares) : null
    return { ebitda, enterpriseValue, equityValue, price }
  })
}

// ---------------------------------------------------------------------
// Reverse DCF-lite: what EPS growth does today's price imply?
// ---------------------------------------------------------------------

/** Annual EPS growth (%) needed for `eps` to reach price / exitPe in
 * `years`. Null when there's no real root (non-positive EPS or inputs). */
export function impliedGrowth(
  price: number | null, eps: number | null, exitPe: number | null, years: number,
): number | null {
  if (price === null || eps === null || exitPe === null) return null
  if (eps <= 0 || exitPe <= 0 || price <= 0 || years <= 0) return null
  const targetEps = price / exitPe
  return finite((Math.pow(targetEps / eps, 1 / years) - 1) * 100)
}

// ---------------------------------------------------------------------
// Peter Lynch: fair P/E = growth (+ dividend yield)
// ---------------------------------------------------------------------

export interface LynchResult {
  fairPe: number | null
  fairValue: number | null
  /** Actual P/E / (growth + yield). < 1 cheap, ~1 fair, > 1.5 expensive. */
  peg: number | null
  verdict: string | null
  warning: string | null
}

export function projectLynch(
  eps: number | null, growth: number | null, divYield: number | null, price: number | null,
): LynchResult {
  const out: LynchResult = { fairPe: null, fairValue: null, peg: null, verdict: null, warning: null }
  if (growth === null) return out
  const adj = growth + (divYield ?? 0)
  out.fairPe = adj
  if (eps !== null && eps > 0 && adj > 0) out.fairValue = finite(eps * adj)
  if (price !== null && eps !== null && eps > 0 && adj > 0) {
    out.peg = finite(price / eps / adj)
  }
  if (out.peg !== null) {
    out.verdict = out.peg < 1 ? 'undervalued vs. growth'
      : out.peg <= 1.5 ? 'roughly fair' : 'expensive vs. growth'
  }
  if (growth < 10 || growth > 25) {
    out.warning = `⚠ ${growth}% growth is outside the ~10–25% band the rule was built for — treat this value with suspicion.`
  }
  if (eps !== null && eps <= 0) {
    out.warning = '⚠ EPS is zero or negative, so a P/E-based fair value doesn’t exist.'
  }
  return out
}

// ---------------------------------------------------------------------
// Gordon growth: P = D1 / (r - g)
// ---------------------------------------------------------------------

/** Spreads (r - g) narrower than this are refused: the value explodes. */
const MIN_SPREAD = 1

export interface GordonResult {
  d1: number | null
  price: number | null
  warning: string | null
}

export function projectGordon(dividend: number | null, g: number | null, r: number | null): GordonResult {
  if (dividend === null || g === null || r === null) return { d1: null, price: null, warning: null }
  if (dividend <= 0) {
    return { d1: null, price: null, warning: '⚠ No dividend — the Gordon model only values dividend payers.' }
  }
  const d1 = dividend * (1 + g / 100)
  if (r - g < MIN_SPREAD) {
    return {
      d1, price: null,
      warning: `⚠ Required return must exceed growth by at least ${MIN_SPREAD}pp — closer than that the value runs off to infinity.`,
    }
  }
  return { d1, price: finite(d1 / ((r - g) / 100)), warning: null }
}

export interface GordonSensRow { growth: number; price: number | null }

/** Value across g ± 2pp in 1pp steps (the "how fragile is this" view). */
export function gordonSensitivity(dividend: number | null, g: number | null, r: number | null): GordonSensRow[] {
  if (dividend === null || g === null || r === null || dividend <= 0) return []
  const rows: GordonSensRow[] = []
  for (let d = -2; d <= 2; d++) {
    const growth = Math.round((g + d) * 10) / 10
    rows.push({ growth, price: projectGordon(dividend, growth, r).price })
  }
  return rows
}

// ---------------------------------------------------------------------

/** % change from `current` to `target`, or null. */
export function totalReturn(target: number | null, current: number | null): number | null {
  if (target === null || current === null || current <= 0) return null
  return finite(((target - current) / current) * 100)
}
