import pandas as pd
import numpy as np
import yfinance as yf
import fear_and_greed
import requests
from bs4 import BeautifulSoup
import datetime

# Ask user for ticker
ticker = input("Enter stock ticker: ")
data = yf.Ticker(ticker)

# Pricing and earnings info
info = data.info

def print_heading(text):
    pseudo_larger = '\n' + ' ' * 2  # Simulate extra size by padding
    print(SEPERATOR.format(pseudo_larger + text.upper() + pseudo_larger))
    print(SEPERATOR.format('=' * (len(text) + 4)))

def input_ticker():
    while True:
        ticker = input(WHITE.format("Enter stock ticker: ")).strip().upper()
        try:
            data = yf.Ticker(ticker)
            test_info = data.info
            # "regularMarketPrice" is only present for valid tickers with current price data
            if "regularMarketPrice" in test_info and test_info["regularMarketPrice"] is not None:
                return ticker, data
            else:
                print(RED.format("Invalid ticker or no market data. Please try again."))
        except Exception:
            print(RED.format("Invalid ticker or ticker not found. Please try again."))

# --- ANSI Styles ---
WHITE      = '\033[97m{}\033[00m'
BOLD       = '\033[1m{}\033[0m'
RED        = '\033[91m{}\033[00m'
GREEN      = '\033[92m{}\033[00m'
YELLOW     = '\033[93m{}\033[00m'
CYAN       = '\033[96m{}\033[00m'
MAGENTA    = '\033[95m{}\033[00m'
BLUE       = '\033[94m{}\033[00m'
GREY       = '\033[90m{}\033[00m'
SEPERATOR = '\033[1;97m{}\033[00m'


price = info.get("regularMarketPrice")
eps_ttm = info.get("trailingEps")
current_price = info.get("currentPrice")
pe_ratio = info.get("trailingPE")
expected_eps = info.get("forwardEps")
dividends = info.get("dividendYield")
shares_outstanding = info.get("sharesOutstanding")
dividend_paid = dividends * price * shares_outstanding
stock_name = info.get("companyName")
current_year = datetime.datetime.now().year
print(f"\n*** {stock_name} ***")

# PEG ratio fix: Requires expected EPS growth percent (proxy: EBITDA CAGR)
peg_ratio = None
if pe_ratio is not None and expected_eps is not None and expected_eps != 0:
    peg_ratio = pe_ratio / expected_eps

# Income statement for EBITDA CAGR calculation
income = data.income_stmt
print("Income statement preview:")
print(income)

try:
    net_income = income.loc["Net Income"].iloc[0]
except (KeyError, IndexError, ZeroDivisionError):
    net_income = 0

try:
    latest_EBITDA = income.loc["EBITDA"].iloc[0]
    prev_EBITDA = income.loc["EBITDA"].iloc[3]
    EBITDA_3Y = ((latest_EBITDA / prev_EBITDA) ** (1/3) - 1)*100
except (KeyError, IndexError, ZeroDivisionError):
    latest_EBITDA = prev_EBITDA = EBITDA_3Y = None

print(f"\n{SEPERATOR.format('##############################################################################################################')}")

# Balance sheet for WACC
balance = data.balance_sheet
print("Balance sheet:")
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
market_return = 0.09
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

cash_per_share = cash_and_cash_equivalents / shares_outstanding # Cash Per Share calculation

print(f"\n{SEPERATOR.format('##############################################################################################################')}")

# Technicals & Indicators
print("\n*** Technical Analysis ***")

print(f"\n{SEPERATOR.format('##############################################################################################################')}")
# General Market Info
print("\n*** General Market Info ***")
fear_and_greed_index = fear_and_greed.get()
print("Fear/Greed Value: ", fear_and_greed_index.value)        # e.g., 31.4
print("Fear/Greed Description: ",fear_and_greed_index.description)  # e.g., 'fear'
print("Last Update to Fear/Greed Index: ",fear_and_greed_index.last_update)  # timestamp

print(f"\n{SEPERATOR.format('##############################################################################################################')}")
# --- Sentiment & Options Data Section ---

# Calculate Put/Call Ratio using latest available expiry
if hasattr(data, 'options') and data.options:
    expiry = data.options[0]  # Get the nearest expiration date
    opt = data.option_chain(expiry)
    put_oi = opt.puts['openInterest'].sum()
    call_oi = opt.calls['openInterest'].sum()
    put_call_ratio = put_oi / call_oi if call_oi != 0 else None
else:
    put_call_ratio = None

print("\nPut/Call Ratio (nearest expiry):", put_call_ratio)

print(f"\n{SEPERATOR.format('##############################################################################################################')}")
# --- High-Low Index ---

# Example: Pull high and low data for index (e.g., S&P 500 via ^GSPC)
sp500 = yf.Ticker("^GSPC").history(period="1y")
new_highs = (sp500['High'] == sp500['High'].rolling(252).max()).sum()
new_lows = (sp500['Low'] == sp500['Low'].rolling(252).min()).sum()
if (new_highs + new_lows) != 0:
    high_low_index = (new_highs / (new_highs + new_lows)) * 100
else:
    high_low_index = None

print("S&P 500 High-Low Index (1 year):", high_low_index)

print(f"\n{SEPERATOR.format('##############################################################################################################')}")
# --- Bullish Percent Index (BPI) ---
# This is a simplified version due to the complexity of true P&F signals.
# Instead, we define a "bullish" position as current price above a moving average.
sp500_constituents = [
    # List of tickers, e.g. get from Wikipedia or file: ["AAPL", "MSFT", ...]
]
# Example: Simple BPI computation for illustration
bullish_count = 0
for sym in sp500_constituents:
    try:
        hist = yf.Ticker(sym).history(period="100d")
        if len(hist) >= 50:
            if hist['Close'].iloc[-1] > hist['Close'].rolling(50).mean().iloc[-1]:
                bullish_count += 1
    except Exception:
        continue

if sp500_constituents:
    bpi = (bullish_count / len(sp500_constituents)) * 100
else:
    bpi = None

print("Sample Bullish Percent Index (50-day MA):", bpi)

# --- General Market Info ---
fear_and_greed_index = fear_and_greed.get()
print("Fear/Greed Value: ", fear_and_greed_index.value)
print("Fear/Greed Description: ", fear_and_greed_index.description)
print("Last Update to Fear/Greed Index: ", fear_and_greed_index.last_update)

def get_index_price(ticker_symbol):
    try:
        idx_data = yf.Ticker(ticker_symbol).history(period="1d")
        if not idx_data.empty:
            return idx_data['Close'].iloc[-1]
        else:
            return None
    except Exception:
        return None

sp500_price = get_index_price("^GSPC")   # S&P 500
dow_price = get_index_price("^DJI")      # Dow Jones
russell_2000_price = get_index_price("^RUT")  # Russell 2000

print("\nMajor Market Indices Prices:")
print(f"S&P 500 Price: {sp500_price}")
print(f"Dow Jones Price: {dow_price}")
print(f"Russell 2000 Price: {russell_2000_price}")


print(f"\n{SEPERATOR.format('##############################################################################################################')}")
# Volume Data: total volume for ticker over last trading day
history = data.history(period="1d")
volume = history['Volume'].iloc[-1] if not history.empty else None
print(f"\nVolume for {ticker}: {volume}")

# Social Media & News Sentiment: Simple example scraping Yahoo Finance news titles
def get_news_sentiment(ticker_symbol):
    url = f"https://finance.yahoo.com/quote/{ticker_symbol}/news"
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.content, "html.parser")
    headlines = []
    for item in soup.select('h3'):
        headlines.append(item.text)
    return headlines[:5]  # top 5 headlines

print("\n##############################################################################################################")

# Print results
print("\n*** Valuation Metrics ***")
print("Price:", price)
print("Dividend Yield: ", dividends, "%")
print("Net Income: ", net_income)
print("Preferred Dividends: ", dividend_paid)
print("Cash & Cash Equivalents: ", cash_and_cash_equivalents)
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
print("Cash per Share: ", cash_per_share)