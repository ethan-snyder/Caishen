import yfinance as yf

#ask user for stock specification
ticker = input("Enter stock ticker: ")
data = yf.Ticker(ticker)

price = data.info["regularMarketPrice"]
# peg_ratio = data.info.get("pegRatio")
eps_ttm = data.info.get("trailingEps")
current_price = data.info.get("currentPrice")
pe_ratio = data.info.get("trailingPE")
expected_eps = data.info.get("forwardEps")
peg_ratio = pe_ratio/expected_eps

# #CAGR Calculation
# # Historical earnings (Annual)
# earnings = data.earnings  # DataFrame with 'Year' and 'Earnings'
# # Get EPS for first and last year in dataset for CAGR calculation
# start_eps = earnings['Earnings'].iloc[0]
# end_eps = earnings['Earnings'].iloc[-1]
# num_years = len(earnings) - 1
# # Calculate CAGR
# eps_cagr = (end_eps / start_eps) ** (1 / num_years) - 1

# Calculating the 3Y EBITDA CAGR
income = data.income_stmt# Fetch the annual income statement DataFrame (columns = years)
print(income)# Display the DataFrame to inspect
latest_EBITDA = income.loc["EBITDA"].iloc[0]
prev_EBITDA = income.loc["EBITDA"].iloc[3]
print(latest_EBITDA)
print(prev_EBITDA)


# ebitda_cagr = (latest_ebitda / ebitda_3_years_ago) ** (1 / years) - 1
EBITDA_3Y = (latest_EBITDA / prev_EBITDA) ** (1/3) - 1
print("EBITDA 3Y CAGR: ", EBITDA_3Y)

#prints
print("Price: ", price)
print("EPS TTM: ", eps_ttm)
print("PE ratio: ", pe_ratio)
print("Expected EPS: ", expected_eps)
print("Current Price: ", current_price)
print("Expected EPS: ", expected_eps)
print("PEG Ratio: ", peg_ratio)
# print(f"EPS CAGR over {num_years} years: {eps_cagr * 100:.2f}%")