import pandas as pd
import numpy as np
import yfinance as yf
import fear_and_greed
import requests
from bs4 import BeautifulSoup
import datetime
import sys

# --- ANSI Styles ---
WHITE      = '\033[97m{}\033[00m'
BOLD_WHITE = '\033[1;97m{}\033[00m'
BOLD       = '\033[1m{}\033[0m'
RED        = '\033[91m{}\033[00m'
GREEN      = '\033[92m{}\033[00m'
YELLOW     = '\033[93m{}\033[00m'
CYAN       = '\033[96m{}\033[00m'
MAGENTA    = '\033[95m{}\033[00m'
BLUE       = '\033[94m{}\033[00m'
GREY       = '\033[90m{}\033[00m'

# --- Banner ----
banner = r'''
  /$$$$$$            /$$           /$$                                 /$$$$$$                                           /$$                        
 /$$__  $$          |__/          | $$                                |_  $$_/                                          | $$                        
| $$  \__/  /$$$$$$  /$$  /$$$$$$$| $$$$$$$   /$$$$$$  /$$$$$$$         | $$   /$$$$$$$  /$$    /$$ /$$$$$$   /$$$$$$$ /$$$$$$    /$$$$$$   /$$$$$$ 
| $$       |____  $$| $$ /$$_____/| $$__  $$ /$$__  $$| $$__  $$        | $$  | $$__  $$|  $$  /$$//$$__  $$ /$$_____/|_  $$_/   /$$__  $$ /$$__  $$
| $$        /$$$$$$$| $$|  $$$$$$ | $$  \ $$| $$$$$$$$| $$  \ $$        | $$  | $$  \ $$ \  $$/$$/| $$$$$$$$|  $$$$$$   | $$    | $$  \ $$| $$  \__/
| $$    $$ /$$__  $$| $$ \____  $$| $$  | $$| $$_____/| $$  | $$        | $$  | $$  | $$  \  $$$/ | $$_____/ \____  $$  | $$ /$$| $$  | $$| $$      
|  $$$$$$/|  $$$$$$$| $$ /$$$$$$$/| $$  | $$|  $$$$$$$| $$  | $$       /$$$$$$| $$  | $$   \  $/  |  $$$$$$$ /$$$$$$$/  |  $$$$/|  $$$$$$/| $$      
 \______/  \_______/|__/|_______/ |__/  |__/ \_______/|__/  |__/      |______/|__/  |__/    \_/    \_______/|_______/    \___/   \______/ |__/                                                                                                                                    
'''
print(GREEN.format(banner))

def print_heading(text):
    pseudo_larger = '\n' + ' ' * 2  # Simulate extra size by padding
    print(BOLD_WHITE.format(pseudo_larger + text.upper() + pseudo_larger))
    print(BOLD_WHITE.format('=' * (len(text) + 4)))

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

def summarize_main_code(ticker, data):
    # Pricing and earnings info
    info = data.info
    SEPERATOR = BOLD_WHITE

    price = info.get("regularMarketPrice")
    eps_ttm = info.get("trailingEps")
    current_price = info.get("currentPrice")
    pe_ratio = info.get("trailingPE")
    expected_eps = info.get("forwardEps")
    dividends = info.get("dividendYield")
    shares_outstanding = info.get("sharesOutstanding")
    stock_name = info.get("longName", info.get("shortName", ticker))
    current_year = datetime.datetime.now().year
    dividend_paid = (dividends or 0) * (price or 0) * (shares_outstanding or 0)

    print_heading(f"{stock_name}")

    # PEG ratio fix: Requires expected EPS growth percent (proxy: EBITDA CAGR)
    peg_ratio = None
    if pe_ratio is not None and expected_eps is not None and expected_eps != 0:
        peg_ratio = pe_ratio / expected_eps

    # Income statement for EBITDA CAGR calculation
    try:
        income = data.income_stmt
    except Exception:
        income = pd.DataFrame()
    print(CYAN.format("Income statement preview:"))
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

    print(f"\n" + SEPERATOR.format('##############################################################################################################'))

    # Balance sheet for WACC
    try:
        balance = data.balance_sheet
    except Exception:
        balance = pd.DataFrame()
    print(CYAN.format("Balance sheet:"))
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
    try:
        financials = data.financials
    except Exception:
        financials = pd.DataFrame()
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

    cash_per_share = cash_and_cash_equivalents / shares_outstanding if shares_outstanding else None # Cash Per Share

    print(f"\n{SEPERATOR.format('##############################################################################################################')}")

    # Technicals & Indicators
    print_heading("Technical Analysis")

    print(f"\n{SEPERATOR.format('##############################################################################################################')}")
    print_heading("General Market Info")
    try:
        fear_and_greed_index = fear_and_greed.get()
        print("Fear/Greed Value: ", fear_and_greed_index.value)
        print("Fear/Greed Description: ",fear_and_greed_index.description)
        print("Last Update to Fear/Greed Index: ",fear_and_greed_index.last_update)
    except Exception:
        print(YELLOW.format("Could not get Fear and Greed Index"))

    print(f"\n{SEPERATOR.format('##############################################################################################################')}")

    # Example: Pull high and low data for index (e.g., S&P 500 via ^GSPC)
    try:
        sp500 = yf.Ticker("^GSPC").history(period="1y")
        new_highs = (sp500['High'] == sp500['High'].rolling(252).max()).sum()
        new_lows = (sp500['Low'] == sp500['Low'].rolling(252).min()).sum()
        if (new_highs + new_lows) != 0:
            high_low_index = (new_highs / (new_highs + new_lows)) * 100
        else:
            high_low_index = None
        print("S&P 500 High-Low Index (1 year):", high_low_index)
    except Exception:
        print(YELLOW.format("Could not get S&P 500 high-low data."))

    print(f"\n{SEPERATOR.format('##############################################################################################################')}")

    # Volume Data: total volume for ticker over last trading day
    try:
        history = data.history(period="1d")
        volume = history['Volume'].iloc[-1] if not history.empty else None
        print(f"Volume for {ticker}: {volume}")
    except Exception:
        print("Volume: N/A")

    # Social Media & News Sentiment: Simple example scraping Yahoo Finance news titles
    def get_news_sentiment(ticker_symbol):
        url = f"https://finance.yahoo.com/quote/{ticker_symbol}/news"
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            response = requests.get(url, headers=headers)
            soup = BeautifulSoup(response.content, "html.parser")
            headlines = []
            for item in soup.select('h3'):
                headlines.append(item.text)
            return headlines[:5]  # top 5 headlines
        except Exception:
            return []

    headlines = get_news_sentiment(ticker)
    print_heading("Top News Headlines")
    if headlines:
        for i, headline in enumerate(headlines, 1):
            print(f"{i}. {headline}")
    else:
        print(YELLOW.format("No headlines available."))

    # Print results
    print_heading("Valuation Metrics")
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

    print_heading("WACC Calculation")
    print("Market Cap:", market_cap)
    print("Total Debt:", total_debt)
    print("Cash:", cash_and_cash_equivalents)
    print("Beta:", beta)
    print("Cost of Equity (CAPM):", cost_of_equity)
    print("Cost of Debt (after tax):", after_tax_cost_of_debt)
    print("WACC:", wacc)
    print("Cash per Share: ", cash_per_share)


# --- Tester Class ---
class TickerTester:
    def __init__(self):
        self.valid_tickers = ['AAPL', 'MSFT', 'AMZN']
        self.invalid_tickers = ['ZZZZ123', '!!!!!', '1234']

    def test_valid_ticker(self):
        for ticker in self.valid_tickers:
            print(GREEN.format(f"Testing valid ticker: {ticker}"))
            try:
                data = yf.Ticker(ticker)
                info = data.info
                assert "regularMarketPrice" in info and info["regularMarketPrice"] is not None
                print(GREEN.format("PASS: Ticker validated."))
            except Exception as e:
                print(RED.format(f"FAIL: {e}"))

    def test_invalid_ticker(self):
        for ticker in self.invalid_tickers:
            print(RED.format(f"Testing invalid ticker: {ticker}"))
            try:
                data = yf.Ticker(ticker)
                info = data.info
                if "regularMarketPrice" not in info or info["regularMarketPrice"] is None:
                    print(GREEN.format("PASS: Rejected invalid ticker."))
                else:
                    print(RED.format("FAIL: Invalid ticker accepted!"))
            except Exception as e:
                print(GREEN.format("PASS: Exception raised as expected."))

    def test_heading_print(self):
        print(BOLD_WHITE.format("TESTING HEADING PRINT (should be bold and white, larger by padding)"))
        print_heading("Test Heading Print")

    def run_all(self):
        self.test_valid_ticker()
        self.test_invalid_ticker()
        self.test_heading_print()


# --- Main Routine ---
if __name__ == "__main__":
    ticker, data = input_ticker()
    summarize_main_code(ticker, data)

    print_heading("Running Tests")
    tester = TickerTester()
    tester.run_all()
