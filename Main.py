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
dividends = info.get("dividendYield")

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
print("Dividend Yield: ", dividends, "%")
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






# # Parameters for DCF
# forecast_years = 5
# terminal_growth_rate = 0.03  # 3% perpetual growth after 5 years
#
# # Use EBITDA or proxy for FCF - here simplified using EBITDA or EPS * sharesOutstanding as proxy for FCF
# if latest_EBITDA is not None and EBITDA_3Y is not None and EBITDA_3Y > 0:
#     initial_fcf = latest_EBITDA
#     growth_rate = EBITDA_3Y / 100  # Convert % to decimal
#
#     # Forecast future FCFs
#     fcf_forecasts = [initial_fcf * ((1 + growth_rate) ** year) for year in range(1, forecast_years + 1)]
#
#     # Discount each forecasted FCF to present value using WACC
#     discounted_fcf = [fcf / ((1 + wacc) ** year) for year, fcf in enumerate(fcf_forecasts, start=1)]
#
#     # Calculate Terminal Value (perpetuity formula)
#     terminal_value = fcf_forecasts[-1] * (1 + terminal_growth_rate) / (wacc - terminal_growth_rate)
#     discounted_terminal_value = terminal_value / ((1 + wacc) ** forecast_years)
#
#     # Enterprise Value (DCF Value)
#     dcf_value = sum(discounted_fcf) + discounted_terminal_value
#
#     # Optionally calculate equity value per share
#     if shares_outstanding and shares_outstanding != 0:
#         intrinsic_value_per_share = dcf_value / shares_outstanding
#     else:
#         intrinsic_value_per_share = None
# else:
#     dcf_value = intrinsic_value_per_share = None
#
# # Print DCF results
# print("\n*** DCF Valuation ***")
# print("DCF Enterprise Value:", dcf_value)
# print("Intrinsic Value per Share:", intrinsic_value_per_share)
