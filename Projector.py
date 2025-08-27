import Main
GREEN = '\033[92m{}\033[00m'
YELLOW = '\033[93m{}\033[00m'
RED = '\033[91m{}\033[00m'

########################################################################################################################
def pe_times_eps_to_stock_price(pe_ratio, net_income_growth):
    """
    Calculates the stock price given a P/E ratio and net income growth
    relative to Main's last known EBITDA_3Y.
    """
    # Convert to float in case inputs come in as strings
    pe_ratio = float(pe_ratio)
    net_income_growth = float(net_income_growth)

    # Apply growth to EBITDA_3Y, then multiply by P/E
    adjusted_eps = Main.EBITDA_3Y * (1 + net_income_growth / 100.0)
    price = adjusted_eps * pe_ratio
    return price


def expectedValueCollection():
    # ---------------------- BEAR CASE ----------------------
    bear_pe_ratio_next_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 1} {RED.format('Bear Case:')} ")
    bear_net_income_next_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 1} {RED.format('Bear Case:')} ")
    bear_pe_ratio_2_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 2} {RED.format('Bear Case:')} ")
    bear_net_income_2_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 2} {RED.format('Bear Case:')} ")
    bear_pe_ratio_3_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 3} {RED.format('Bear Case:')} ")
    bear_net_income_3_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 3} {RED.format('Bear Case:')} ")
    bear_pe_ratio_4_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 4} {RED.format('Bear Case:')} ")
    bear_net_income_4_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 4} {RED.format('Bear Case:')} ")

    bear_case_price_estimates = [
        {"year": Main.current_year, "pe_ratio": Main.pe_ratio, "net_income_growth": 0, "price": Main.price},  # Current year (baseline)
        {"year": Main.current_year + 1, "pe_ratio": bear_pe_ratio_next_yr, "net_income_growth": bear_net_income_next_yr,
         "price": pe_times_eps_to_stock_price(bear_pe_ratio_next_yr, bear_net_income_next_yr)},
        {"year": Main.current_year + 2, "pe_ratio": bear_pe_ratio_2_yr, "net_income_growth": bear_net_income_2_yr,
         "price": pe_times_eps_to_stock_price(bear_pe_ratio_2_yr, bear_net_income_2_yr)},
        {"year": Main.current_year + 3, "pe_ratio": bear_pe_ratio_3_yr, "net_income_growth": bear_net_income_3_yr,
         "price": pe_times_eps_to_stock_price(bear_pe_ratio_3_yr, bear_net_income_3_yr)},
        {"year": Main.current_year + 4, "pe_ratio": bear_pe_ratio_4_yr, "net_income_growth": bear_net_income_4_yr,
         "price": pe_times_eps_to_stock_price(bear_pe_ratio_4_yr, bear_net_income_4_yr)}
    ]

    # ---------------------- BASE CASE ----------------------
    base_pe_ratio_next_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 1} {YELLOW.format('Base Case:')} ")
    base_net_income_next_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 1} {YELLOW.format('Base Case:')} ")
    base_pe_ratio_2_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 2} {YELLOW.format('Base Case:')} ")
    base_net_income_2_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 2} {YELLOW.format('Base Case:')} ")
    base_pe_ratio_3_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 3} {YELLOW.format('Base Case:')} ")
    base_net_income_3_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 3} {YELLOW.format('Base Case:')} ")
    base_pe_ratio_4_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 4} {YELLOW.format('Base Case:')} ")
    base_net_income_4_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 4} {YELLOW.format('Base Case:')} ")

    base_case_price_estimates = [
        {"year": Main.current_year, "pe_ratio": Main.pe_ratio, "net_income_growth": 0, "price": Main.price},
        {"year": Main.current_year + 1, "pe_ratio": base_pe_ratio_next_yr, "net_income_growth": base_net_income_next_yr,
         "price": pe_times_eps_to_stock_price(base_pe_ratio_next_yr, base_net_income_next_yr)},
        {"year": Main.current_year + 2, "pe_ratio": base_pe_ratio_2_yr, "net_income_growth": base_net_income_2_yr,
         "price": pe_times_eps_to_stock_price(base_pe_ratio_2_yr, base_net_income_2_yr)},
        {"year": Main.current_year + 3, "pe_ratio": base_pe_ratio_3_yr, "net_income_growth": base_net_income_3_yr,
         "price": pe_times_eps_to_stock_price(base_pe_ratio_3_yr, base_net_income_3_yr)},
        {"year": Main.current_year + 4, "pe_ratio": base_pe_ratio_4_yr, "net_income_growth": base_net_income_4_yr,
         "price": pe_times_eps_to_stock_price(base_pe_ratio_4_yr, base_net_income_4_yr)}
    ]

    # ---------------------- BULL CASE ----------------------
    bull_pe_ratio_next_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 1} {GREEN.format('Bull Case:')} ")
    bull_net_income_next_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 1} {GREEN.format('Bull Case:')} ")
    bull_pe_ratio_2_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 2} {GREEN.format('Bull Case:')} ")
    bull_net_income_2_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 2} {GREEN.format('Bull Case:')} ")
    bull_pe_ratio_3_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 3} {GREEN.format('Bull Case:')} ")
    bull_net_income_3_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 3} {GREEN.format('Bull Case:')} ")
    bull_pe_ratio_4_yr = input(f"Enter the P/E Ratio in your {Main.current_year + 4} {GREEN.format('Bull Case:')} ")
    bull_net_income_4_yr = input(f"Enter the net income percentage growth in your {Main.current_year + 4} {GREEN.format('Bull Case:')} ")

    bull_case_price_estimates = [
        {"year": Main.current_year, "pe_ratio": Main.pe_ratio, "net_income_growth": 0, "price": Main.price},
        {"year": Main.current_year + 1, "pe_ratio": bull_pe_ratio_next_yr, "net_income_growth": bull_net_income_next_yr,
         "price": pe_times_eps_to_stock_price(bull_pe_ratio_next_yr, bull_net_income_next_yr)},
        {"year": Main.current_year + 2, "pe_ratio": bull_pe_ratio_2_yr, "net_income_growth": bull_net_income_2_yr,
         "price": pe_times_eps_to_stock_price(bull_pe_ratio_2_yr, bull_net_income_2_yr)},
        {"year": Main.current_year + 3, "pe_ratio": bull_pe_ratio_3_yr, "net_income_growth": bull_net_income_3_yr,
         "price": pe_times_eps_to_stock_price(bull_pe_ratio_3_yr, bull_net_income_3_yr)},
        {"year": Main.current_year + 4, "pe_ratio": bull_pe_ratio_4_yr, "net_income_growth": bull_net_income_4_yr,
         "price": pe_times_eps_to_stock_price(bull_pe_ratio_4_yr, bull_net_income_4_yr)}
    ]

    # ---------------------- PRINT SUMMARY ----------------------
    print("\n" + "-" * 50)
    print(RED.format("BEAR CASE PROJECTIONS:"))
    for est in bear_case_price_estimates:
        print(RED.format(
            f"Year {est['year']}: P/E = {est['pe_ratio']}, Net Income Growth = {est['net_income_growth']}%, Price ≈ ${est['price']:.2f}"
        ))

    print("\n" + "-" * 50)
    print(YELLOW.format("BASE CASE PROJECTIONS:"))
    for est in base_case_price_estimates:
        print(YELLOW.format(
            f"Year {est['year']}: P/E = {est['pe_ratio']}, Net Income Growth = {est['net_income_growth']}%, Price ≈ ${est['price']:.2f}"
        ))

    print("\n" + "-" * 50)
    print(GREEN.format("BULL CASE PROJECTIONS:"))
    for est in bull_case_price_estimates:
        print(GREEN.format(
            f"Year {est['year']}: P/E = {est['pe_ratio']}, Net Income Growth = {est['net_income_growth']}%, Price ≈ ${est['price']:.2f}"
        ))
    print("-" * 50 + "\n")

expectedValueCollection()
