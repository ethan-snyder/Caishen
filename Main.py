"""
Caishen — an all-in-one investing terminal tool.

Run:  python main.py
"""

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
4) Quit
===================================================
"""


def main():
    print(f"{GREEN}{BANNER}{RESET}")
    while True:
        print(MENU)
        choice = input("Select an option (1-4): ").strip()
        if choice == "1":
            current_stock_info()
        elif choice == "2":
            projector()
        elif choice == "3":
            market_info()
        elif choice == "4":
            print("Goodbye!")
            break
        else:
            print("Invalid choice, please select 1-4.")


if __name__ == "__main__":
    main()