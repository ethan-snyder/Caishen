"""
Caishen — an all-in-one investing terminal tool.

Run:  python cli.py  (this is the terminal version -- see api.py for the web API)
"""

from logger import setup_logging, log_event, log_error
setup_logging()  # first thing, before any other prints/inputs happen

try:
    # Makes ANSI color codes work reliably on Windows terminals too.
    # Purely cosmetic -- if colorama isn't installed, we fall back to raw
    # ANSI codes, which already work fine on macOS/Linux and modern
    # Windows Terminal / PowerShell.
    import colorama
    colorama.init(autoreset=True)
except ImportError:
    pass

from stock_info import current_stock_info
from projector import projector
from market_info import market_info
from portfolio import view_portfolio
from watchlist import view_watchlists
from crypto_info import top_cryptos
from forex import fx_rates
from futures import futures_info
from bonds import bonds_info

GREEN = "\033[32m"
RESET = "\033[0m"

BANNER = r'''
  /$$$$$$            /$$           /$$                                 /$$$$$$                                           /$$                        
 /$$__  $$          |__/          | $$                                |_  $$_/                                          | $$                        
| $$  \__/  /$$$$$$  /$$  /$$$$$$$| $$$$$$$   /$$$$$$  /$$$$$$$         | $$   /$$$$$$$  /$$    /$$ /$$$$$$   /$$$$$$$ /$$$$$$    /$$$$$$   /$$$$$$ 
| $$       |____  $$| $$ /$$_____/| $$__  $$ /$$__  $$| $$__  $$        | $$  | $$__  $$|  $$  /$$//$$__  $$ /$$_____/|_  $$_/   /$$__  $$ /$$__  $$
| $$        /$$$$$$$| $$|  $$$$$$ | $$  \ $$| $$$$$$$$| $$  \ $$        | $$  | $$  \ $$ \  $$/$$/| $$$$$$$$|  $$$$$$   | $$    | $$  \ $$| $$  \__/
| $$    $$ /$$__  $$| $$ \____  $$| $$  | $$| $$_____/| $$  | $$        | $$  | $$  | $$  \  $$$/ | $$_____/ \____  $$  | $$ /$$| $$  | $$| $$      
|  $$$$$$/|  $$$$$$$| $$ /$$$$$$$/| $$  | $$|  $$$$$$$| $$  | $$       /$$$$$$| $$  | $$   \  $/  |  $$$$$$$ /$$$$$$$/  |  $$$$/|  $$$$$$/| $$      
 \______/  \_______/|__/|_______/ |__/  |__/ \_______/|__/  |__/      |______/|__/  |__/    \_/    \_______/|_______/    \___/   \______/ |__/                                                                                                                                    
'''

MENU = """
==================== CAISHEN ====================
1) Current Stock Info      (metrics for one ticker)
2) Price Projector         (3-year bear/base/bull)
3) Market Overview         (indexes & sentiment)
4) Portfolio                (view your holdings)
5) Watchlists                (view your watchlists)
6) Crypto                    (top 10 by market cap)
7) FX Rates                   (major currency pairs)
8) Futures                    (major index & commodity futures)
9) Bonds                      (U.S. Treasury yields)
10) Quit
===================================================
"""

DISPATCH = {
    "1": ("Current Stock Info", current_stock_info),
    "2": ("Price Projector", projector),
    "3": ("Market Overview", market_info),
    "4": ("Portfolio", view_portfolio),
    "5": ("Watchlists", view_watchlists),
    "6": ("Crypto", top_cryptos),
    "7": ("FX Rates", fx_rates),
    "8": ("Futures", futures_info),
    "9": ("Bonds", bonds_info),
}


def main():
    print(f"{GREEN}{BANNER}{RESET}")
    while True:
        print(MENU)
        choice = input("Select an option (1-10): ").strip()

        if choice == "10":
            log_event("Session ended (user selected Quit)")
            print("Goodbye!")
            break

        entry = DISPATCH.get(choice)
        if entry is None:
            print("Invalid choice, please select 1-10.")
            continue

        label, func = entry
        log_event(f"Menu selection: {choice} -> {label}")
        try:
            func()
        except Exception as e:
            log_error(f"Unhandled error in '{label}'", exc=e)
            print(f"\nSomething went wrong in {label}: {e}")
            print("(logged to events_log.txt — the rest of the app is still fine)\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log_event("Session ended (KeyboardInterrupt)")
        print("\nGoodbye!")
