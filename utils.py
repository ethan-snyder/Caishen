"""
utils.py — shared helpers for Caishen.

Holds:
  - CAPM / WACC calculations (done manually since no free API reports these
    reliably — they're derived from beta, treasury yields, and financial
    statement data instead of being pulled as a pre-baked field).
  - Small formatting helpers used across modules.
"""

import yfinance as yf
from logger import warn

# Long-run historical U.S. equity risk premium. Reasonable people put this
# anywhere from ~4.5% to ~6.5% depending on the lookback window; 5.5% is a
# commonly used middle-of-the-road figure. Override via calculate_capm()
# if you want to use your own assumption.
DEFAULT_MARKET_RISK_PREMIUM = 0.055

# Fallbacks used only when live data can't be fetched, so the tool degrades
# gracefully instead of crashing.
FALLBACK_RISK_FREE_RATE = 0.04
FALLBACK_TAX_RATE = 0.21  # U.S. federal statutory corporate rate


def get_risk_free_rate():
    """Live 10-Year U.S. Treasury yield (^TNX) as a decimal, e.g. 0.045 for 4.5%."""
    try:
        hist = yf.Ticker("^TNX").history(period="5d")
        if hist.empty:
            raise ValueError("no data returned for ^TNX")
        return float(hist["Close"].iloc[-1]) / 100
    except Exception as e:
        warn(f"Couldn't fetch live risk-free rate ({e}); using {FALLBACK_RISK_FREE_RATE:.1%} fallback")
        return FALLBACK_RISK_FREE_RATE


def calculate_capm(beta, risk_free_rate=None, market_risk_premium=DEFAULT_MARKET_RISK_PREMIUM):
    """Cost of equity via CAPM: Re = Rf + Beta * ERP. Returns (capm, risk_free_rate_used)."""
    if risk_free_rate is None:
        risk_free_rate = get_risk_free_rate()
    if beta is None:
        return None, risk_free_rate
    return risk_free_rate + beta * market_risk_premium, risk_free_rate


def _find_row(df, labels):
    """Return the first matching row (as a Series) from a financials DataFrame."""
    if df is None or df.empty:
        return None
    for label in labels:
        if label in df.index:
            return df.loc[label]
    return None


def calculate_wacc(ticker_obj, capm_value, risk_free_rate):
    """
    WACC = (E/V)*Re + (D/V)*Rd*(1 - Tax Rate)

    Re  = CAPM cost of equity (passed in)
    Rd  = approximated from interest expense / total debt when available,
          else Rf + a generic credit spread
    Tax = effective tax rate from the income statement, else statutory fallback
    E,D = market cap and total debt (book value used as a proxy for debt)
    """
    if capm_value is None:
        return None
    try:
        info = ticker_obj.info
        market_cap = info.get("marketCap")
        total_debt = info.get("totalDebt") or 0
        if not market_cap:
            return None

        v = market_cap + total_debt
        if v == 0:
            return None
        e_weight = market_cap / v
        d_weight = total_debt / v

        financials = ticker_obj.financials

        # --- cost of debt ---
        cost_of_debt = None
        interest_row = _find_row(financials, ["Interest Expense", "Interest Expense Non Operating"])
        if interest_row is not None and total_debt:
            interest_expense = abs(float(interest_row.iloc[0]))
            if interest_expense:
                cost_of_debt = interest_expense / total_debt
        if cost_of_debt is None or not (0 < cost_of_debt < 0.25):
            cost_of_debt = risk_free_rate + 0.02  # generic corporate credit spread

        # --- effective tax rate ---
        tax_rate = FALLBACK_TAX_RATE
        pretax_row = _find_row(financials, ["Pretax Income", "Income Before Tax"])
        tax_row = _find_row(financials, ["Tax Provision", "Income Tax Expense"])
        if pretax_row is not None and tax_row is not None:
            pretax = float(pretax_row.iloc[0])
            tax_exp = float(tax_row.iloc[0])
            if pretax:
                computed = tax_exp / pretax
                if 0 <= computed <= 0.5:
                    tax_rate = computed

        return e_weight * capm_value + d_weight * cost_of_debt * (1 - tax_rate)
    except Exception as e:
        warn(f"WACC calculation failed: {e}")
        return None


def normalize_pct(value):
    """
    DEPRECATED: this magnitude-based heuristic ("if > 1, assume it's already
    a percent") turned out to be wrong in both directions in practice —
    dividendYield comes back from yfinance already scaled as a percent even
    when small (e.g. 0.44 meaning 0.44%, not a 44% fraction), while fields
    like returnOnEquity or earningsGrowth are genuine fractions that can
    legitimately exceed 1 (e.g. 1.5 meaning 150% ROE). No single heuristic
    covers both. Left here only so old imports don't hard-crash; use
    fmt_pct() directly for true-fraction fields, or fmt_pct_raw() for
    fields yfinance already returns pre-scaled as a percent (currently just
    dividendYield).
    """
    return value


def fmt_pct(value, decimals=2):
    """For fields that are genuine fractions (e.g. 0.243 for 24.3%, or 1.5
    for 150% -- yfinance's margin/return/growth fields all work this way)."""
    if value is None:
        return "N/A"
    return f"{value * 100:.{decimals}f}%"


def fmt_pct_raw(value, decimals=2):
    """For fields yfinance already returns pre-scaled as a percent (currently
    just dividendYield, e.g. 0.44 meaning 0.44% -- not a 0.44 fraction).
    Appends a % sign without any further scaling."""
    if value is None:
        return "N/A"
    return f"{value:.{decimals}f}%"


def fmt_num(value, decimals=2):
    if value is None:
        return "N/A"
    return f"{value:.{decimals}f}"


def fmt_money(value, decimals=2):
    if value is None:
        return "N/A"
    return f"${value:,.{decimals}f}"


def fmt_large_num(value, is_money=True):
    """Compact form for big numbers, e.g. 3228000000000 -> '$3.23T'."""
    if value is None:
        return "N/A"
    prefix = "$" if is_money else ""
    value = float(value)
    abs_v = abs(value)
    for threshold, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs_v >= threshold:
            return f"{prefix}{value / threshold:,.2f}{suffix}"
    return f"{prefix}{value:,.2f}"


# ----------------------------------------------------------------------
# Terminal color helpers
# ----------------------------------------------------------------------

RESET_COLOR = "\033[0m"

_DEEP_RED = (139, 0, 0)      # "extreme"/negative end of a gradient
_DEEP_GREEN = (0, 100, 0)    # "extreme"/positive end of a gradient
_WHITE = (255, 255, 255)     # neutral midpoint


def gradient_color(value, neutral, max_dev, low_rgb=_DEEP_RED, high_rgb=_DEEP_GREEN, base_rgb=_WHITE):
    """
    24-bit ANSI foreground color escape code, interpolated from `base_rgb`
    at value == neutral toward `low_rgb` as value falls `max_dev` below
    neutral, or toward `high_rgb` as it rises `max_dev` above. Values beyond
    +/- max_dev clamp to the full color. Returns "" if value is None (so it
    can be safely concatenated without a None-check at the call site).

    e.g. gradient_color(pct_change, neutral=0, max_dev=5) for a market index
    move: 0% -> white, -5% or worse -> deep red, +5% or better -> deep green.
    """
    if value is None:
        return ""
    dev = value - neutral
    t = min(abs(dev) / max_dev, 1.0) if max_dev else 1.0
    target = high_rgb if dev >= 0 else low_rgb
    r = round(base_rgb[0] + (target[0] - base_rgb[0]) * t)
    g = round(base_rgb[1] + (target[1] - base_rgb[1]) * t)
    b = round(base_rgb[2] + (target[2] - base_rgb[2]) * t)
    return f"\033[38;2;{r};{g};{b}m"