"""
Caishen — an all-in-one investing terminal tool.

Run:  python main.py
"""

from stock_info import current_stock_info
from projector import projector
from market_info import market_info

MENU = """
==================== CAISHEN ====================
1) Current Stock Info      (metrics for one ticker)
2) Price Projector         (3-year bear/base/bull)
3) Market Overview         (indexes & sentiment)
4) Quit
===================================================
"""


def main():
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
