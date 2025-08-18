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

# Fetch the annual income statement DataFrame (columns = years)
income = data.income_stmt

# Display the DataFrame to inspect
print(income)

# Get the most recent reported revenue
latest_revenue = income.loc["Total Revenue"].iloc[0]  # 0 is most recent column

# Get the revenue reported 12 months ago (i.e., previous fiscal year)
prev_revenue = income.loc["Total Revenue"].iloc[1]    # 1 means second most recent

print(latest_revenue)
print(prev_revenue)

#test
print("Price: ", price)
print("EPS TTM: ", eps_ttm)
print("PE ratio: ", pe_ratio)
print("Expected EPS: ", expected_eps)
print("Current Price: ", current_price)
print("Expected EPS: ", expected_eps)
print("PEG Ratio: ", peg_ratio)
# print(f"EPS CAGR over {num_years} years: {eps_cagr * 100:.2f}%")