"""
bonds.py — bonds_info()

General info on important government debt yields via yfinance's Treasury
tickers. Scoped to the U.S. Treasury curve for now -- it's the largest and
most liquid sovereign debt market and the one yfinance covers reliably.
Free tickers for other countries' government bond yields aren't
consistently available, so multi-country coverage is a roadmap item (see
README) rather than something silently faked here.
"""

import yfinance as yf
from utils import fmt_pct_raw
from logger import log_event, warn

# yfinance's ^IRX/^FVX/^TNX/^TYX already report the yield directly as a
# percent (e.g. a close of 4.35 means 4.35%), same convention as
# dividendYield -- so these use fmt_pct_raw(), not fmt_pct().
TREASURIES = {
    "13-Week T-Bill": "^IRX",
    "5-Year Treasury": "^FVX",
    "10-Year Treasury": "^TNX",
    "30-Year Treasury": "^TYX",
}


def _get_bond_data():
    results = {}
    for name, symbol in TREASURIES.items():
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if hist.empty:
                raise ValueError("no data returned")
            yield_pct = float(hist["Close"].iloc[-1])
            results[name] = yield_pct
        except Exception as e:
            warn(f"Couldn't fetch {name} ({e})")
            results[name] = None
    return results


def bonds_info():
    log_event("Fetching Treasury yield data")
    print("\n===== U.S. Treasury Yields =====")
    data = _get_bond_data()
    for name, yield_pct in data.items():
        print(f"  {name:<20} {fmt_pct_raw(yield_pct)}")
    print("=" * 40)
    print("(U.S. Treasuries only for now -- see README for why)")
    print()
    log_event("Treasury yield data fetched")
    return data


if __name__ == "__main__":
    bonds_info()