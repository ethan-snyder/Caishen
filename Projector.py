# import Main
# pe_input = float(input("Enter projected P/E ratio: "))
# # eps_input = float(input("Enter projected Trailing-Twelve-Month EPS: "))
# projected_price = pe_input*Main.eps_ttm
# print(f"Projected Price with a P/E ratio of {pe_input}: ", projected_price)
#
#
# Terminal Color Coding
GREEN = '\033[92m{}\033[00m'
YELLOW = '\033[93m{}\033[00m'
RED = '\033[91m{}\033[00m'

########################################################################################################################
def expectedValueCollection():
    # Bear Case
    bear_pe_ratio = input(f"Enter the P/E Ratio in your {RED.format('Bear Case:')} ")
    bear_net_income = input(f"Enter the net income percentage in your {RED.format('Bear Case:')} ")


    # Base Case
    base_pe_ratio = input(f"Enter the P/E Ratio in your {YELLOW.format('Base Case:')} ")
    base_net_income = input(f"Enter the net income percentage in your {YELLOW.format('Base Case:')} ")

    # Bull Case
    bull_pe_ratio = input(f"Enter the P/E Ratio in your {GREEN.format('Bull Case:')} ")
    bull_net_income = input(f"Enter the net income percentage in your {GREEN.format('Bull Case:')} ")

expectedValueCollection()