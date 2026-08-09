"""
forex.py — fx_rates()

General info (last rate, day change) for a curated set of major currency
pairs, via yfinance's FX tickers (e.g. "EURUSD=X"). Each non-USD currency
is shown with its flag emoji; USD itself isn't flagged since it's the
staple currency in every pair here.

Named "forex" rather than "fx" to avoid colliding with any third-party
package that happens to be installed under the name "fx" -- that exact
collision is what caused `from fx import fx_rates` to fail with an
ImportError (Python loaded someone else's "fx" instead of this file).
"""

import yfinance as yf
from utils import gradient_color, RESET_COLOR
from logger import log_event, warn

# (base currency, quote currency, yfinance ticker)
FX_PAIRS = [
    ("EUR", "USD", "EURUSD=X"),
    ("GBP", "USD", "GBPUSD=X"),
    ("USD", "JPY", "JPY=X"),
    ("USD", "CHF", "CHF=X"),
    ("USD", "CAD", "CAD=X"),
    ("AUD", "USD", "AUDUSD=X"),
    ("NZD", "USD", "NZDUSD=X"),
    ("USD", "CNY", "CNY=X"),
]

# The euro isn't a single country's currency, hence the EU flag rather than
# a national one. USD is intentionally omitted -- it's the staple currency.
CURRENCY_FLAGS = {
    "EUR": "🇪🇺",
    "GBP": "🇬🇧",
    "JPY": "🇯🇵",
    "CHF": "🇨🇭",
    "CAD": "🇨🇦",
    "AUD": "🇦🇺",
    "NZD": "🇳🇿",
    "CNY": "🇨🇳",
}


def _display_label(base, quote):
    base_str = f"{CURRENCY_FLAGS[base]} {base}" if base in CURRENCY_FLAGS else base
    quote_str = f"{CURRENCY_FLAGS[quote]} {quote}" if quote in CURRENCY_FLAGS else quote
    return f"{base_str}/{quote_str}"


def _get_fx_data():
    results = {}
    for base, quote, symbol in FX_PAIRS:
        label = _display_label(base, quote)
        try:
            hist = yf.Ticker(symbol).history(period="5d")
            if len(hist) < 2:
                raise ValueError("insufficient history")
            last = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2])
            change_pct = (last - prev) / prev * 100
            results[label] = {"last": last, "change_pct": change_pct}
        except Exception as e:
            warn(f"Couldn't fetch {label} ({e})")
            results[label] = {"last": None, "change_pct": None}
    return results


def fx_rates():
    log_event("Fetching FX rates")
    print("\n===== Major Currency Pairs =====")
    data = _get_fx_data()

    # Flag emoji are double-width in most terminals but a single character
    # to Python's len(), so pad using the visible (flag-stripped) label
    # length rather than len(label) or the flags throw off alignment.
    def _visible_len(label):
        stripped = label
        for flag in CURRENCY_FLAGS.values():
            stripped = stripped.replace(flag, "")
        return len(stripped)

    label_width = max((_visible_len(name) for name in data), default=10)

    for name, d in data.items():
        pad = " " * max(0, label_width - _visible_len(name))
        if d["last"] is None:
            print(f"  {name}{pad} N/A")
        else:
            sign = "+" if d["change_pct"] >= 0 else ""
            color = gradient_color(d["change_pct"], neutral=0.0, max_dev=2.0)
            print(f"  {name}{pad} {d['last']:>10,.4f}   {color}({sign}{d['change_pct']:.2f}%){RESET_COLOR}")
    print("=" * 40)
    print()
    log_event("FX rates fetched")
    return data


if __name__ == "__main__":
    fx_rates()