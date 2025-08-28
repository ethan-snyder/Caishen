# Caishen 财神
  The Goal of this project is to provide a single cohesive solution to aide in the investigation of Securities & specifically stock equities. My personal investment strategies are not based off of technical indicators and instead are long term. Regardless, information included in this program includes that of technicals and non-technicals. InvestingCalc inquires as to the security that the user wishes to investigate, and then, using yfinance, grabs information such as stock price, shares outstanding, net income, et cetera. Using this recently obtained information, InvestingCalc calculates certain metrics including but not limited to WACC, Cash Per Share, CAPM, CAGR, et cetera. In addition to information gathered and generated about securities, InvestingCalc gathers general market data including sentiment related metrics and index prices (S&P, DJI, Russel).

**Key Features:**
+ Stock Projector: The stock projector is a simple use of the P/E ratio formula to calculate predicted stock price given expected P/E. Using the formula pe_ratio * EBITDA_3Y = stock_price, we can create an estimate based on the bull_case, base,_case, and bear_case.
+ General stock information (price, p/e, eps, etc.)
+ Market info display (DJI price, fear/greed index, p/c ratio, etc.)

While I have a lot of plans for explanding this program, please consult the issues tab for more information on future implementations.

**Disclaimer: None of the information obtained in this code is financial advice. Information obtained using this program may be inaccurate.**
