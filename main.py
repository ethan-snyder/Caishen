import yfinance as yf

# Ask user for ticker
ticker = input("Enter stock ticker: ")
data = yf.Ticker(ticker)

# Pricing and earnings info
info = data.info

price = info.get("regularMarketPrice")
eps_ttm = info.get("trailingEps")
current_price = info.get("currentPrice")
pe_ratio = info.get("trailingPE")
expected_eps = info.get("forwardEps")

# PEG ratio fix: Requires expected EPS growth percent (proxy: EBITDA CAGR)
peg_ratio = None
if pe_ratio is not None and expected_eps is not None and expected_eps != 0:
    peg_ratio = pe_ratio / expected_eps

# Income statement for EBITDA CAGR calculation
income = data.income_stmt
print("Income statement preview:")
print(income)

try:
    latest_EBITDA = income.loc["EBITDA"].iloc[0]
    prev_EBITDA = income.loc["EBITDA"].iloc[3]
    EBITDA_3Y = ((latest_EBITDA / prev_EBITDA) ** (1/3) - 1)*100
except (KeyError, IndexError, ZeroDivisionError):
    latest_EBITDA = prev_EBITDA = EBITDA_3Y = None

# Balance sheet for WACC
balance = data.balance_sheet
print(balance)
try:
    total_debt = 0
    if "Total Debt" in balance.index:
        total_debt += balance.loc["Total Debt"].iloc[0]
except Exception:
    total_debt = None

try:
    cash_and_cash_equivalents = balance.loc["Cash And Cash Equivalents"].iloc[0]
except Exception:
    cash_and_cash_equivalents = 0

market_cap = info.get("marketCap")
shares_outstanding = info.get("sharesOutstanding")

# Cost of Equity (CAPM)
risk_free_rate = 0.04
market_return = 0.08
beta = info.get("beta")
if beta is not None:
    cost_of_equity = risk_free_rate + beta * (market_return - risk_free_rate)
else:
    cost_of_equity = None

# Cost of Debt
financials = data.financials
tax_rate = 0.21  # Adjust as needed
try:
    interest_expense = abs(financials.loc["Interest Expense"].iloc[0])
    if total_debt and total_debt != 0:
        cost_of_debt = interest_expense / total_debt
        after_tax_cost_of_debt = cost_of_debt * (1 - tax_rate)
    else:
        cost_of_debt = after_tax_cost_of_debt = 0
except Exception:
    cost_of_debt = after_tax_cost_of_debt = 0

# WACC weights and calculation
try:
    E = market_cap
    D = total_debt
    V = E + D
    if V and V != 0:
        weight_equity = E / V
        weight_debt = D / V
        wacc = weight_equity * cost_of_equity + weight_debt * after_tax_cost_of_debt
    else:
        wacc = None
except Exception:
    wacc = None

# Print results
print("\n*** Valuation Metrics ***")
print("Price:", price)
print("EPS (TTM):", eps_ttm)
print("P/E Ratio:", pe_ratio)
print("Expected EPS (Forward):", expected_eps)
print("Current Price:", current_price)
print("PEG Ratio (using forward EPS):", peg_ratio)
print("3Y EBITDA CAGR (%):", EBITDA_3Y)
print("\n*** WACC Calculation ***")
print("Market Cap:", market_cap)
print("Total Debt:", total_debt)
print("Cash:", cash_and_cash_equivalents)
print("Beta:", beta)
print("Cost of Equity (CAPM):", cost_of_equity)
print("Cost of Debt (after tax):", after_tax_cost_of_debt)
print("WACC:", wacc)