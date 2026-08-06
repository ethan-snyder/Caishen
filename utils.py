"""
utils.py — shared helpers for Caishen.

Holds:
  - CAPM / WACC calculations (done manually since no free API reports these
    reliably — they're derived from beta, treasury yields, and financial
    statement data instead of being pulled as a pre-baked field).
  - Small formatting helpers used across modules.
"""

import yfinance as yf

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
        print(f"  [warn] Couldn't fetch live risk-free rate ({e}); using {FALLBACK_RISK_FREE_RATE:.1%} fallback")
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
        print(f"  [warn] WACC calculation failed: {e}")
        return None


def normalize_pct(value):
    """
    yfinance has historically been inconsistent about whether yield/growth
    fields are returned as fractions (0.02) or already-scaled percents (2.0).
    Heuristic: anything with magnitude > 1 is assumed already a percent and
    is rescaled down to a fraction so fmt_pct() can treat everything the same.
    """
    if value is None:
        return None
    return value / 100 if abs(value) > 1 else value


def fmt_pct(value, decimals=2):
    if value is None:
        return "N/A"
    return f"{value * 100:.{decimals}f}%"


def fmt_num(value, decimals=2):
    if value is None:
        return "N/A"
    return f"{value:.{decimals}f}"


def fmt_money(value, decimals=2):
    if value is None:
        return "N/A"
    return f"${value:,.{decimals}f}"
