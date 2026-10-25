"""
trade.py — country import/export analysis (the TRADE tab).

Inspired by the OEC's Tradle game (https://games.oec.world/en/tradle/):
show what a country sells to / buys from the world as a product treemap,
then let you compare trade profiles across countries as a heatmap.

Data sources (both free, no API key):

  - UN Comtrade public "preview" API
      https://comtradeapi.un.org/public/v1/preview/C/A/HS
    Official customs data as reported by each country, in current USD.
    Used for: product breakdowns (HS 2-digit chapters, rolled up into the 21
    HS sections), partner breakdowns, and the country x sector heatmap.
    Limits of the keyless preview tier: one period per request, at most 500
    rows per request, and light rate limiting ("try again in N seconds").
    Requests are therefore throttled, retried on 429, batched (up to 5
    reporters per heatmap request -> <= 5 x 98 chapters = 490 rows), and
    cached on disk (trade_cache.json) since annual trade data barely moves.

  - World Bank indicators API (WTO merchandise trade series)
      TX.VAL.MRCH.CD.WT  merchandise exports, current US$
      TM.VAL.MRCH.CD.WT  merchandise imports, current US$
    Used for the multi-year exports/imports/balance trend, because Comtrade's
    preview tier only allows one year per request while the World Bank
    returns the whole series in one call. Totals can differ slightly from
    Comtrade's (different compilation), which the UI notes.

Known gaps, deliberately left as gaps rather than filled in:
  - Countries report with a lag (often 1-2 years), and some stop reporting
    (e.g. Russia hasn't reported to Comtrade since 2021). When no year is
    requested we walk back to the most recent year that has data; when a
    specific year has none, the response says so.
  - Taiwan is reported to Comtrade as "Other Asia, nes" (code 490) and is not
    in the World Bank database, so it has no trend series.
"""

import json
import os
import re
import threading
import time
from datetime import date

import requests

from logger import log_event, warn

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(SCRIPT_DIR, "trade_cache.json")

COMTRADE_URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
PARTNER_REF_URL = "https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json"
HS_REF_URL = "https://comtradeapi.un.org/files/v1/app/reference/HS.json"
WB_URL = "https://api.worldbank.org/v2/country/{iso3}/indicator/{indicator}"

HEADERS = {"User-Agent": "Moneta/0.1 (investing terminal; trade tab)"}

# Cache lifetimes. Annual customs data is revised rarely, so a week is fine;
# an empty answer ("not reported yet") is re-checked sooner.
TTL_DATA = 7 * 24 * 3600
TTL_EMPTY = 12 * 3600
TTL_REFERENCE = 30 * 24 * 3600

MIN_REQUEST_GAP = 1.1  # seconds between Comtrade calls (preview tier is rate-limited)
MAX_ROWS = 500         # preview tier hard cap per request

# ----------------------------------------------------------------------
# Reference data (static facts: UN M49 codes, ISO codes, HS nomenclature)
# ----------------------------------------------------------------------

# (Comtrade/M49 reporter code, ISO2, ISO3, display name). A curated set of
# major traders keeps the selector usable; Comtrade covers ~200 reporters
# and more can be added here. Note the Comtrade-specific codes: USA=842,
# France=251, Switzerland=757, India=699, Norway=579, Taiwan=490.
COUNTRIES = [
    (842, "US", "USA", "United States"),
    (156, "CN", "CHN", "China"),
    (276, "DE", "DEU", "Germany"),
    (392, "JP", "JPN", "Japan"),
    (826, "GB", "GBR", "United Kingdom"),
    (251, "FR", "FRA", "France"),
    (528, "NL", "NLD", "Netherlands"),
    (380, "IT", "ITA", "Italy"),
    (410, "KR", "KOR", "South Korea"),
    (124, "CA", "CAN", "Canada"),
    (484, "MX", "MEX", "Mexico"),
    (699, "IN", "IND", "India"),
    (56,  "BE", "BEL", "Belgium"),
    (724, "ES", "ESP", "Spain"),
    (757, "CH", "CHE", "Switzerland"),
    (490, "TW", "TWN", "Taiwan"),
    (702, "SG", "SGP", "Singapore"),
    (344, "HK", "HKG", "Hong Kong"),
    (643, "RU", "RUS", "Russia"),
    (76,  "BR", "BRA", "Brazil"),
    (36,  "AU", "AUS", "Australia"),
    (682, "SA", "SAU", "Saudi Arabia"),
    (784, "AE", "ARE", "United Arab Emirates"),
    (704, "VN", "VNM", "Vietnam"),
    (764, "TH", "THA", "Thailand"),
    (458, "MY", "MYS", "Malaysia"),
    (360, "ID", "IDN", "Indonesia"),
    (616, "PL", "POL", "Poland"),
    (792, "TR", "TUR", "Türkiye"),
    (372, "IE", "IRL", "Ireland"),
    (752, "SE", "SWE", "Sweden"),
    (40,  "AT", "AUT", "Austria"),
    (203, "CZ", "CZE", "Czechia"),
    (208, "DK", "DNK", "Denmark"),
    (579, "NO", "NOR", "Norway"),
    (246, "FI", "FIN", "Finland"),
    (620, "PT", "PRT", "Portugal"),
    (348, "HU", "HUN", "Hungary"),
    (376, "IL", "ISR", "Israel"),
    (608, "PH", "PHL", "Philippines"),
    (710, "ZA", "ZAF", "South Africa"),
    (32,  "AR", "ARG", "Argentina"),
    (152, "CL", "CHL", "Chile"),
    (170, "CO", "COL", "Colombia"),
    (604, "PE", "PER", "Peru"),
    (634, "QA", "QAT", "Qatar"),
    (414, "KW", "KWT", "Kuwait"),
    (398, "KZ", "KAZ", "Kazakhstan"),
    (586, "PK", "PAK", "Pakistan"),
    (50,  "BD", "BGD", "Bangladesh"),
    (818, "EG", "EGY", "Egypt"),
    (504, "MA", "MAR", "Morocco"),
    (566, "NG", "NGA", "Nigeria"),
    (404, "KE", "KEN", "Kenya"),
    (231, "ET", "ETH", "Ethiopia"),
    (384, "CI", "CIV", "Côte d'Ivoire"),
    (288, "GH", "GHA", "Ghana"),
    (24,  "AO", "AGO", "Angola"),
    (554, "NZ", "NZL", "New Zealand"),
    (804, "UA", "UKR", "Ukraine"),
]

DEFAULT_HEATMAP_COUNTRIES = ["USA", "CHN", "DEU", "JPN", "KOR", "IND", "MEX", "BRA", "SAU", "AUS"]

# Colour groups: the treemap colours tiles by one of these eight groups
# (eight is the most hues a categorical palette can keep distinguishable),
# while tile labels and the heatmap carry the full 21-section detail.
GROUPS = [
    {"id": "agri",      "name": "Agriculture & Food"},
    {"id": "minerals",  "name": "Minerals & Energy"},
    {"id": "chem",      "name": "Chemicals & Plastics"},
    {"id": "materials", "name": "Wood, Paper & Stone"},
    {"id": "metals",    "name": "Metals & Precious"},
    {"id": "machinery", "name": "Machinery & Instruments"},
    {"id": "transport", "name": "Transport"},
    {"id": "textiles",  "name": "Textiles & Other Mfg"},
]

# The 21 HS sections (+ Comtrade's chapter 99, "commodities not specified").
# (id, name, short label for heatmap columns, first chapter, last chapter, group)
SECTIONS = [
    ("I",     "Animal Products",          "ANIMAL",  1,  5,  "agri"),
    ("II",    "Vegetable Products",       "VEG",     6,  14, "agri"),
    ("III",   "Animal & Vegetable Fats",  "FATS",    15, 15, "agri"),
    ("IV",    "Foodstuffs",               "FOOD",    16, 24, "agri"),
    ("V",     "Mineral Products",         "MINERAL", 25, 27, "minerals"),
    ("VI",    "Chemical Products",        "CHEM",    28, 38, "chem"),
    ("VII",   "Plastics & Rubber",        "PLAST",   39, 40, "chem"),
    ("VIII",  "Hides & Leather",          "HIDES",   41, 43, "textiles"),
    ("IX",    "Wood Products",            "WOOD",    44, 46, "materials"),
    ("X",     "Paper Goods",              "PAPER",   47, 49, "materials"),
    ("XI",    "Textiles",                 "TEXT",    50, 63, "textiles"),
    ("XII",   "Footwear & Headwear",      "FOOTW",   64, 67, "textiles"),
    ("XIII",  "Stone & Glass",            "STONE",   68, 70, "materials"),
    ("XIV",   "Precious Metals & Gems",   "PRECIO",  71, 71, "metals"),
    ("XV",    "Base Metals",              "METALS",  72, 83, "metals"),
    ("XVI",   "Machinery & Electronics",  "MACHIN",  84, 85, "machinery"),
    ("XVII",  "Transportation",           "TRANSP",  86, 89, "transport"),
    ("XVIII", "Instruments",              "INSTR",   90, 92, "machinery"),
    ("XIX",   "Arms & Ammunition",        "ARMS",    93, 93, "textiles"),
    ("XX",    "Miscellaneous Mfg",        "MISC",    94, 96, "textiles"),
    ("XXI",   "Art & Antiques",           "ART",     97, 97, "textiles"),
    ("99",    "Not Specified",            "N/S",     98, 99, "textiles"),
]

CHAPTER_NAMES = {
    "01": "Live Animals", "02": "Meat", "03": "Fish & Seafood", "04": "Dairy, Eggs & Honey",
    "05": "Other Animal Products", "06": "Live Plants & Flowers", "07": "Vegetables",
    "08": "Fruits & Nuts", "09": "Coffee, Tea & Spices", "10": "Cereals", "11": "Milling Products",
    "12": "Oil Seeds", "13": "Gums & Resins", "14": "Other Vegetable Products",
    "15": "Animal & Vegetable Fats", "16": "Prepared Meat & Fish", "17": "Sugar", "18": "Cocoa",
    "19": "Cereal Preparations", "20": "Prepared Vegetables & Fruit", "21": "Misc. Food Preparations",
    "22": "Beverages & Spirits", "23": "Food Residues & Animal Feed", "24": "Tobacco",
    "25": "Salt, Stone & Cement", "26": "Ores, Slag & Ash", "27": "Mineral Fuels & Oils",
    "28": "Inorganic Chemicals", "29": "Organic Chemicals", "30": "Pharmaceuticals",
    "31": "Fertilizers", "32": "Dyes & Paints", "33": "Essential Oils & Cosmetics",
    "34": "Soaps & Waxes", "35": "Proteins & Glues", "36": "Explosives", "37": "Photographic Goods",
    "38": "Misc. Chemical Products", "39": "Plastics", "40": "Rubber", "41": "Raw Hides & Leather",
    "42": "Leather Goods", "43": "Furskins", "44": "Wood", "45": "Cork", "46": "Basketwork",
    "47": "Wood Pulp", "48": "Paper & Paperboard", "49": "Printed Matter", "50": "Silk",
    "51": "Wool", "52": "Cotton", "53": "Other Vegetable Fibres", "54": "Man-made Filaments",
    "55": "Man-made Staple Fibres", "56": "Wadding & Rope", "57": "Carpets",
    "58": "Special Woven Fabrics", "59": "Coated Textiles", "60": "Knitted Fabrics",
    "61": "Knit Apparel", "62": "Non-knit Apparel", "63": "Other Textile Articles",
    "64": "Footwear", "65": "Headwear", "66": "Umbrellas", "67": "Feathers & Artificial Flowers",
    "68": "Stone & Plaster Articles", "69": "Ceramics", "70": "Glass",
    "71": "Precious Metals & Stones", "72": "Iron & Steel", "73": "Iron & Steel Articles",
    "74": "Copper", "75": "Nickel", "76": "Aluminium", "78": "Lead", "79": "Zinc", "80": "Tin",
    "81": "Other Base Metals", "82": "Tools & Cutlery", "83": "Misc. Metal Articles",
    "84": "Machinery & Computers", "85": "Electrical & Electronics", "86": "Railway Equipment",
    "87": "Vehicles", "88": "Aircraft & Spacecraft", "89": "Ships & Boats",
    "90": "Optical & Medical Instruments", "91": "Clocks & Watches", "92": "Musical Instruments",
    "93": "Arms & Ammunition", "94": "Furniture & Lighting", "95": "Toys & Sports Goods",
    "96": "Misc. Manufactured Articles", "97": "Art & Antiques", "98": "Special Classifications",
    "99": "Commodities Not Specified",
}

FLOW_NAMES = {"X": "exports", "M": "imports"}


def _flag(iso2):
    """ISO2 -> regional-indicator flag emoji (e.g. 'US' -> 🇺🇸)."""
    if not iso2 or len(iso2) != 2 or not iso2.isalpha():
        return None
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso2.upper())


def _country_dict(row):
    m49, iso2, iso3, name = row
    return {"code": m49, "iso2": iso2, "iso3": iso3, "name": name, "flag": _flag(iso2)}


_BY_ISO3 = {r[2]: r for r in COUNTRIES}
_BY_M49 = {r[0]: r for r in COUNTRIES}


def resolve_country(ident):
    """Accepts an ISO3 code ('USA') or a Comtrade/M49 code ('842')."""
    key = str(ident).strip().upper()
    if key in _BY_ISO3:
        return _country_dict(_BY_ISO3[key])
    if key.isdigit() and int(key) in _BY_M49:
        return _country_dict(_BY_M49[int(key)])
    raise KeyError(f"Unknown country '{ident}'")


def _section_for_chapter(chapter):
    n = int(chapter)
    for sec in SECTIONS:
        if sec[3] <= n <= sec[4]:
            return sec
    return SECTIONS[-1]


def available_years():
    """Most recent first. Annual customs data lags, so the newest year listed
    is last calendar year (often only partly reported)."""
    this_year = date.today().year
    return list(range(this_year - 1, 2011, -1))


def get_trade_meta_full():
    return {
        "countries": [_country_dict(r) for r in COUNTRIES],
        "default_heatmap": DEFAULT_HEATMAP_COUNTRIES,
        "groups": GROUPS,
        "sections": [
            {"id": s[0], "name": s[1], "short": s[2], "chapters": [s[3], s[4]], "group": s[5]}
            for s in SECTIONS
        ],
        "years": available_years(),
    }


# ----------------------------------------------------------------------
# Disk cache + throttled HTTP
# ----------------------------------------------------------------------

_cache_lock = threading.Lock()
_cache = None
_http_lock = threading.Lock()
_last_request_at = 0.0


def _load_cache():
    global _cache
    if _cache is None:
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                _cache = json.load(f)
        except Exception:
            _cache = {}
    return _cache


def _cache_get(key):
    with _cache_lock:
        entry = _load_cache().get(key)
    if not entry:
        return None
    if time.time() - entry.get("t", 0) > entry.get("ttl", TTL_DATA):
        return None
    return entry


def _cache_set(key, value, ttl):
    with _cache_lock:
        cache = _load_cache()
        cache[key] = {"t": time.time(), "ttl": ttl, "v": value}
        try:
            tmp = CACHE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(cache, f)
            os.replace(tmp, CACHE_FILE)
        except Exception as e:
            warn(f"Couldn't write trade cache ({e})")


def _http_get_json(url, params=None, timeout=60):
    """GET with a global minimum gap between calls and backoff on 429/5xx."""
    global _last_request_at
    last_err = None
    for attempt in range(4):
        with _http_lock:
            wait = MIN_REQUEST_GAP - (time.time() - _last_request_at)
            if wait > 0:
                time.sleep(wait)
            _last_request_at = time.time()
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        except requests.RequestException as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last_err = RuntimeError(f"HTTP {r.status_code} from {url}")
            time.sleep(2.0 * (attempt + 1))
            continue
        if r.status_code >= 400:
            detail = r.text[:200]
            try:
                body = r.json()
                detail = body.get("error") or body.get("message") or detail
            except Exception:
                pass
            raise RuntimeError(f"HTTP {r.status_code}: {detail}")
        return r.json()
    raise RuntimeError(f"Upstream unavailable after retries ({last_err})")


def _comtrade(params):
    """One Comtrade preview query -> list of world-total-style rows.

    partner2Code / customsCode / motCode are pinned to their 'all' totals so
    each (reporter, partner, flow, commodity) appears once rather than split
    by customs procedure or transport mode. Rows are still filtered (and
    de-duplicated) defensively in case the API ignores a pin."""
    full = {
        "partner2Code": "0", "customsCode": "C00", "motCode": "0",
        "includeDesc": "false", **{k: str(v) for k, v in params.items()},
    }
    key = "ct:" + json.dumps(full, sort_keys=True)
    hit = _cache_get(key)
    if hit is not None:
        return hit["v"]

    body = _http_get_json(COMTRADE_URL, params=full)
    if isinstance(body, dict) and body.get("error"):
        raise RuntimeError(f"Comtrade: {body['error']}")
    raw = (body or {}).get("data") or []
    if len(raw) >= MAX_ROWS:
        warn(f"Comtrade response hit the {MAX_ROWS}-row preview cap for {params}; results may be truncated")

    rows, seen = [], set()
    for r in raw:
        if str(r.get("partner2Code", 0)) not in ("0", "None"):
            continue
        if r.get("customsCode") not in (None, "C00"):
            continue
        if str(r.get("motCode", 0)) not in ("0", "None"):
            continue
        value = r.get("primaryValue")
        if value is None:
            continue
        ident = (r.get("reporterCode"), r.get("partnerCode"), r.get("flowCode"), str(r.get("cmdCode")))
        if ident in seen:
            continue
        seen.add(ident)
        rows.append({
            "reporter": r.get("reporterCode"),
            "partner": r.get("partnerCode"),
            "flow": r.get("flowCode"),
            "cmd": str(r.get("cmdCode")),
            "value": float(value),
        })

    _cache_set(key, rows, TTL_DATA if rows else TTL_EMPTY)
    return rows


def _comtrade_both_flows(params):
    """Exports + imports in one call (flowCode="X,M"); if the API rejects the
    combined filter, fall back to one call per flow."""
    try:
        return _comtrade({**params, "flowCode": "X,M"})
    except RuntimeError as e:
        warn(f"Combined-flow Comtrade query failed ({e}); querying flows separately")
        return _comtrade({**params, "flowCode": "X"}) + _comtrade({**params, "flowCode": "M"})


_partner_names = None


def _partner_lookup():
    """Comtrade partner code -> {name, iso2, is_group}, from Comtrade's own
    public reference file (cached for a month)."""
    global _partner_names
    if _partner_names is not None:
        return _partner_names
    hit = _cache_get("ref:partners")
    if hit is not None:
        _partner_names = {int(k): v for k, v in hit["v"].items()}
        return _partner_names

    lookup = {}
    try:
        body = _http_get_json(PARTNER_REF_URL, timeout=60)
        for item in body.get("results", []):
            low = {k.lower(): v for k, v in item.items()}
            code = low.get("partnercode", low.get("id"))
            try:
                code = int(code)
            except (TypeError, ValueError):
                continue
            lookup[code] = {
                "name": low.get("partnerdesc") or low.get("text") or str(code),
                "iso2": low.get("partnercodeisoalpha2"),
                "is_group": bool(low.get("isgroup")),
            }
        if lookup:
            _cache_set("ref:partners", {str(k): v for k, v in lookup.items()}, TTL_REFERENCE)
    except Exception as e:
        warn(f"Couldn't load Comtrade partner names ({e}); falling back to codes")

    # Our curated names read better than Comtrade's ("USA", "Other Asia, nes").
    for m49, iso2, _iso3, name in COUNTRIES:
        lookup.setdefault(m49, {"is_group": False})
        lookup[m49].update({"name": name, "iso2": iso2})
    _partner_names = lookup
    return lookup


# ----------------------------------------------------------------------
# HS4 product detail (the Tradle-level granularity: "Gold", "Coffee", ...)
# ----------------------------------------------------------------------

# Comtrade's official HS descriptions are long legal text ("Gold (including
# gold plated with platinum), unwrought or in semi-manufactured forms...").
# These are plain-English short labels for the headings that most often
# dominate a country's trade; everything else is shortened by _short_name().
PRODUCT_NAME_OVERRIDES = {
    "0102": "Bovine Animals", "0201": "Bovine Meat", "0202": "Frozen Bovine Meat", "0203": "Pig Meat",
    "0207": "Poultry Meat", "0302": "Fresh Fish", "0303": "Frozen Fish", "0304": "Fish Fillets",
    "0306": "Crustaceans", "0307": "Molluscs", "0402": "Concentrated Milk", "0406": "Cheese",
    "0713": "Dried Legumes", "0801": "Coconuts & Cashews", "0802": "Other Nuts", "0803": "Bananas",
    "0805": "Citrus Fruit", "0806": "Grapes", "0810": "Other Fresh Fruit", "0901": "Coffee",
    "0902": "Tea", "1001": "Wheat", "1003": "Barley", "1005": "Corn", "1006": "Rice",
    "1201": "Soybeans", "1202": "Ground Nuts", "1205": "Rapeseed", "1511": "Palm Oil",
    "1507": "Soybean Oil", "1701": "Raw Sugar", "1801": "Cocoa Beans", "1806": "Chocolate",
    "2008": "Other Processed Fruits & Nuts", "2106": "Other Food Preparations", "2204": "Wine",
    "2208": "Hard Liquor", "2304": "Soybean Meal", "2401": "Raw Tobacco", "2402": "Rolled Tobacco",
    "2523": "Cement", "2601": "Iron Ore", "2603": "Copper Ore", "2701": "Coal Briquettes",
    "2709": "Crude Petroleum", "2710": "Refined Petroleum", "2711": "Petroleum Gas",
    "2716": "Electricity", "2804": "Hydrogen & Rare Gases", "2844": "Radioactive Chemicals",
    "2902": "Cyclic Hydrocarbons", "2933": "Nitrogen Heterocyclic Compounds",
    "3002": "Vaccines, Blood & Antisera", "3004": "Packaged Medicaments", "3104": "Potassic Fertilizers",
    "3304": "Beauty Products", "3824": "Other Chemical Products", "3901": "Ethylene Polymers",
    "3902": "Propylene Polymers", "3926": "Other Plastic Products", "4011": "Rubber Tires",
    "4403": "Rough Wood", "4407": "Sawn Wood", "4703": "Chemical Woodpulp", "4819": "Paper Containers",
    "6103": "Knit Men's Suits", "6104": "Knit Women's Suits", "6109": "Knit T-shirts",
    "6110": "Knit Sweaters", "6203": "Non-Knit Men's Suits", "6204": "Non-Knit Women's Suits",
    "6205": "Non-Knit Men's Shirts", "6402": "Rubber Footwear", "6403": "Leather Footwear",
    "6404": "Textile Footwear", "7102": "Diamonds", "7108": "Gold", "7110": "Platinum",
    "7113": "Jewellery", "7202": "Ferroalloys", "7208": "Hot-Rolled Iron", "7308": "Iron Structures",
    "7403": "Refined Copper", "7601": "Raw Aluminium", "8411": "Gas Turbines", "8414": "Air Pumps",
    "8421": "Centrifuges & Filters", "8429": "Large Construction Vehicles", "8471": "Computers",
    "8473": "Computer Parts", "8479": "Other Industrial Machinery", "8481": "Valves",
    "8483": "Transmissions", "8486": "Semiconductor Machinery", "8504": "Electrical Transformers",
    "8507": "Batteries", "8517": "Telephones", "8523": "Recorded Media", "8524": "Flat Panel Displays",
    "8525": "Broadcasting Equipment", "8528": "Monitors & Projectors", "8529": "Broadcasting Accessories",
    "8536": "Low-voltage Protection Equipment", "8541": "Semiconductor Devices",
    "8542": "Integrated Circuits", "8544": "Insulated Wire", "8701": "Tractors", "8703": "Cars",
    "8704": "Delivery Trucks", "8708": "Vehicle Parts", "8711": "Motorcycles",
    "8802": "Planes & Helicopters", "8803": "Aircraft Parts", "8806": "Drones",
    "8901": "Passenger & Cargo Ships", "9013": "Liquid Crystal Devices", "9018": "Medical Instruments",
    "9021": "Orthopedic Appliances", "9403": "Other Furniture", "9405": "Light Fixtures",
    "9503": "Toys", "9504": "Video & Card Games", "9701": "Paintings",
}


def _short_name(full):
    """Shortens an official HS heading description to a tile-sized label."""
    s = re.sub(r"\s*\([^)]*\)", "", full)          # drop parentheticals
    s = re.sub(r"\s+", " ", s).strip(" ;,.-")
    head, _, tail = s.partition(";")
    head, tail = head.strip(), tail.strip()
    first = head.split(",")[0].strip()
    name = first if len(first) >= 3 else head
    if tail and len(tail) <= 16 and "," not in tail:  # e.g. "; live", "; crude", "; frozen"
        name = f"{name} ({tail})"
    if len(name) > 48:
        name = name[:46].rstrip() + "…"
    return name[:1].upper() + name[1:]


_hs4_ref = None


def _hs4_reference():
    """HS4 heading -> {"name": short label, "full": official description},
    from Comtrade's public HS reference file (cached for a month)."""
    global _hs4_ref
    if _hs4_ref is not None:
        return _hs4_ref
    hit = _cache_get("ref:hs4")
    if hit is not None:
        _hs4_ref = hit["v"]
        return _hs4_ref
    body = _http_get_json(HS_REF_URL, timeout=120)
    out = {}
    for item in (body or {}).get("results", []):
        code = str(item.get("id", ""))
        if len(code) == 4 and code.isdigit():
            text = str(item.get("text") or "")
            full = text.split(" - ", 1)[1].strip() if " - " in text else text.strip()
            out[code] = {"name": PRODUCT_NAME_OVERRIDES.get(code) or _short_name(full), "full": full}
    if not out:
        raise RuntimeError("HS reference contained no 4-digit headings")
    _cache_set("ref:hs4", out, TTL_REFERENCE)
    _hs4_ref = out
    return out


HS4_BATCH = 400  # headings per request; <= 1 row per heading keeps us under the 500-row cap


def _fetch_hs4(m49, year, flow, codes):
    """{hs4: value} for the given headings. Batches of explicit codes keep each
    request under the preview tier's row cap; a batch the API rejects is
    split in half and retried before giving up."""
    values = {}

    def run(batch):
        params = {"reporterCode": m49, "period": year, "partnerCode": 0,
                  "flowCode": flow, "cmdCode": ",".join(batch)}
        try:
            rows = _comtrade(params)
        except RuntimeError:
            if len(batch) <= 25:
                raise
            mid = len(batch) // 2
            run(batch[:mid])
            run(batch[mid:])
            return
        for r in rows:
            if r["flow"] == flow and r["partner"] == 0 and len(r["cmd"]) == 4:
                values[r["cmd"]] = values.get(r["cmd"], 0.0) + r["value"]

    for i in range(0, len(codes), HS4_BATCH):
        run(codes[i:i + HS4_BATCH])
    return values


# Comtrade pseudo-partners that aren't countries (World, bunkers, free zones,
# "areas not elsewhere specified", special categories).
_NON_COUNTRY_PARTNERS = {0, 97, 837, 838, 839, 899}


# ----------------------------------------------------------------------
# Year resolution
# ----------------------------------------------------------------------

def _world_totals(m49, year):
    rows = _comtrade_both_flows({"reporterCode": m49, "period": year, "partnerCode": 0, "cmdCode": "TOTAL"})
    out = {"X": None, "M": None}
    for r in rows:
        if r["partner"] == 0 and r["flow"] in out:
            out[r["flow"]] = r["value"]
    return out


def _resolve_year(m49, year=None):
    """Returns (year, totals). With no year given, walks back from last year
    to the most recent year this country has reported."""
    if year:
        return int(year), _world_totals(m49, int(year))
    for y in available_years()[:6]:
        totals = _world_totals(m49, y)
        if totals["X"] is not None or totals["M"] is not None:
            return y, totals
    return None, {"X": None, "M": None}


# ----------------------------------------------------------------------
# Data functions (API-facing)
# ----------------------------------------------------------------------

def _build_sections(chapter_values, hs4_values=None, hs4_ref=None):
    """{'01': value, ...} -> section list with nested chapters (and, when HS4
    detail is supplied, nested products), with shares of the total.

    Products are HS4 headings. Any part of a chapter's reported value that its
    headings don't account for (codes from an older HS revision, confidential
    lines) becomes an "Other <chapter>" product, so tile areas always add up
    to the chapter totals rather than silently shrinking."""
    hs4_by_ch = {}
    if hs4_values:
        for code, v in hs4_values.items():
            if v > 0:
                hs4_by_ch.setdefault(code[:2], []).append((code, v))
        # A chapter total occasionally comes in a touch below the sum of its
        # headings (separately revised lines); use the larger so shares add up.
        chapter_values = {ch: max(v, sum(pv for _, pv in hs4_by_ch.get(ch, [])))
                          for ch, v in chapter_values.items()}
    total = sum(chapter_values.values())

    sections = []
    for sec_id, name, short, lo, hi, group in SECTIONS:
        chapters, products = [], []
        for ch, v in chapter_values.items():
            if not (lo <= int(ch) <= hi) or v <= 0:
                continue
            ch_name = CHAPTER_NAMES.get(ch, f"HS {ch}")
            chapters.append({"code": ch, "name": ch_name, "value": v,
                             "share": (v / total * 100) if total else None})
            if hs4_values is None:
                products.append({"code": ch, "name": ch_name, "full": ch_name, "chapter": ch, "value": v})
                continue
            items = hs4_by_ch.get(ch, [])
            covered = 0.0
            for code, pv in items:
                ref = (hs4_ref or {}).get(code, {})
                products.append({"code": code, "name": ref.get("name") or f"HS {code}",
                                 "full": ref.get("full") or ch_name, "chapter": ch, "value": pv})
                covered += pv
            gap = v - covered
            if gap > max(0.005 * v, 1.0):
                products.append({"code": f"{ch}..", "name": f"Other {ch_name}" if items else ch_name,
                                 "full": f"{ch_name}: value not broken down by heading", "chapter": ch,
                                 "value": gap})
        chapters.sort(key=lambda c: c["value"], reverse=True)
        products.sort(key=lambda p: p["value"], reverse=True)
        value = sum(c["value"] for c in chapters)
        for p in products:
            p["share"] = (p["value"] / total * 100) if total else None
            p["section_share"] = (p["value"] / value * 100) if value else None
        sections.append({
            "id": sec_id, "name": name, "short": short, "group": group, "value": value,
            "share": (value / total * 100) if total else None, "chapters": chapters,
            "products": products,
        })
    return total, sections


def get_trade_profile_full(country, flow="X", year=None):
    """What a country exports (flow='X') or imports (flow='M'), by product."""
    c = resolve_country(country)
    log_event(f"Fetching trade profile {c['iso3']} {flow} {year or 'latest'}")
    yr, totals = _resolve_year(c["code"], year)
    result = {
        "country": c, "flow": flow, "flow_name": FLOW_NAMES[flow], "year": yr,
        "world_exports": totals["X"], "world_imports": totals["M"],
        "total": None, "sections": [], "top_chapters": [], "top_products": [], "detail": None,
        "source": "UN Comtrade (HS, as reported)",
    }
    if yr is None:
        result["note"] = f"{c['name']} hasn't reported trade to UN Comtrade in recent years."
        return result

    rows = _comtrade({"reporterCode": c["code"], "period": yr, "partnerCode": 0,
                      "flowCode": flow, "cmdCode": "AG2"})
    chapter_values = {}
    for r in rows:
        if r["flow"] == flow and r["partner"] == 0 and r["cmd"].isdigit():
            chapter_values[r["cmd"].zfill(2)] = chapter_values.get(r["cmd"].zfill(2), 0.0) + r["value"]
    if not chapter_values:
        result["note"] = f"No {FLOW_NAMES[flow]} data reported by {c['name']} for {yr}."
        return result

    # HS4 detail. If the reference file or the detail queries fail, fall back
    # to chapter-level tiles instead of failing the whole panel.
    hs4_values, hs4_ref, detail = None, None, "HS4"
    try:
        hs4_ref = _hs4_reference()
        codes = sorted(code for code in hs4_ref if code[:2] in chapter_values)
        hs4_values = _fetch_hs4(c["code"], yr, flow, codes)
        if not hs4_values:
            raise RuntimeError("no HS4 rows returned")
    except Exception as e:
        warn(f"HS4 detail unavailable for {c['iso3']} {flow} {yr} ({e}); showing HS2 chapters")
        hs4_values, detail = None, "HS2"

    total, sections = _build_sections(chapter_values, hs4_values, hs4_ref)
    result["total"] = total
    result["sections"] = sections
    result["detail"] = detail
    all_ch = [dict(ch, section=s["id"], group=s["group"]) for s in sections for ch in s["chapters"]]
    all_ch.sort(key=lambda ch: ch["value"], reverse=True)
    result["top_chapters"] = all_ch[:10]
    all_p = [dict(p, section=s["id"]) for s in sections for p in s["products"]]
    all_p.sort(key=lambda p: p["value"], reverse=True)
    result["top_products"] = all_p[:10]
    log_event(f"Trade profile {c['iso3']} {flow} {yr} fetched ({len(chapter_values)} chapters, "
              f"{len(hs4_values or {})} HS4 headings)")
    return result


def get_trade_partners_full(country, year=None, limit=20):
    """Top trading partners, with exports to / imports from each and the
    bilateral balance."""
    c = resolve_country(country)
    log_event(f"Fetching trade partners {c['iso3']} {year or 'latest'}")
    yr, totals = _resolve_year(c["code"], year)
    result = {"country": c, "year": yr, "world_exports": totals["X"],
              "world_imports": totals["M"], "partners": [],
              "source": "UN Comtrade (as reported by the selected country)"}
    if yr is None:
        result["note"] = f"{c['name']} hasn't reported trade to UN Comtrade in recent years."
        return result

    # No partnerCode -> every partner; ~230 partners x 2 flows fits under the 500-row cap.
    rows = _comtrade_both_flows({"reporterCode": c["code"], "period": yr, "cmdCode": "TOTAL"})
    names = _partner_lookup()
    by_partner = {}
    for r in rows:
        p = r["partner"]
        if p is None or p in _NON_COUNTRY_PARTNERS or p == c["code"]:
            continue
        info = names.get(p, {})
        if info.get("is_group"):
            continue
        entry = by_partner.setdefault(p, {
            "code": p, "name": info.get("name") or f"Area {p}",
            "flag": _flag(info.get("iso2")), "iso3": _BY_M49[p][2] if p in _BY_M49 else None,
            "exports": 0.0, "imports": 0.0,
        })
        if r["flow"] == "X":
            entry["exports"] += r["value"]
        elif r["flow"] == "M":
            entry["imports"] += r["value"]

    partners = []
    for e in by_partner.values():
        e["total"] = e["exports"] + e["imports"]
        e["balance"] = e["exports"] - e["imports"]
        e["export_share"] = (e["exports"] / totals["X"] * 100) if totals["X"] else None
        e["import_share"] = (e["imports"] / totals["M"] * 100) if totals["M"] else None
        partners.append(e)
    partners.sort(key=lambda e: e["total"], reverse=True)
    result["partners"] = partners[:limit]
    if not partners:
        result["note"] = f"No partner breakdown reported by {c['name']} for {yr}."
    return result


def _world_bank_series(iso3, indicator, start, end):
    key = f"wb:{iso3}:{indicator}:{start}:{end}"
    hit = _cache_get(key)
    if hit is not None:
        return hit["v"]
    body = _http_get_json(WB_URL.format(iso3=iso3, indicator=indicator),
                          params={"format": "json", "date": f"{start}:{end}", "per_page": 200})
    series = {}
    if isinstance(body, list) and len(body) > 1 and body[1]:
        for pt in body[1]:
            if pt.get("value") is not None:
                series[str(pt["date"])] = float(pt["value"])
    elif isinstance(body, list) and body and isinstance(body[0], dict) and body[0].get("message"):
        msg = body[0]["message"][0].get("value", "unknown error")
        raise RuntimeError(f"World Bank: {msg}")
    _cache_set(key, series, TTL_DATA if series else TTL_EMPTY)
    return series


def get_trade_trend_full(country, years=15):
    """Merchandise exports, imports and balance over time."""
    c = resolve_country(country)
    log_event(f"Fetching trade trend {c['iso3']}")
    end = date.today().year
    start = end - years
    result = {"country": c, "points": [],
              "source": "World Bank / WTO (TX.VAL.MRCH.CD.WT, TM.VAL.MRCH.CD.WT)"}
    if c["iso3"] == "TWN":
        # Not a gap we can fill honestly: Taiwan isn't in World Bank data.
        result["note"] = "Taiwan isn't covered by the World Bank's trade series."
        return result
    exports = _world_bank_series(c["iso3"], "TX.VAL.MRCH.CD.WT", start, end)
    imports = _world_bank_series(c["iso3"], "TM.VAL.MRCH.CD.WT", start, end)
    for y in sorted(set(exports) | set(imports)):
        x, m = exports.get(y), imports.get(y)
        result["points"].append({
            "year": int(y), "exports": x, "imports": m,
            "balance": (x - m) if x is not None and m is not None else None,
        })
    if not result["points"]:
        result["note"] = f"No World Bank trade series for {c['name']}."
    return result


def get_trade_heatmap_full(countries=None, flow="X", year=None):
    """Country x HS-section matrix: each cell is that section's share of the
    country's total exports/imports (plus the raw value)."""
    idents = countries or DEFAULT_HEATMAP_COUNTRIES
    resolved = []
    for ident in idents:
        try:
            c = resolve_country(ident)
        except KeyError:
            continue
        if c["code"] not in [r["code"] for r in resolved]:
            resolved.append(c)
    yr = int(year) if year else available_years()[1]  # last year is usually incomplete
    log_event(f"Fetching trade heatmap {flow} {yr} for {[c['iso3'] for c in resolved]}")

    chapter_values = {c["code"]: {} for c in resolved}
    for i in range(0, len(resolved), 5):  # 5 reporters x <=98 chapters stays under 500 rows
        batch = resolved[i:i + 5]
        base = {"period": yr, "partnerCode": 0, "flowCode": flow, "cmdCode": "AG2"}
        try:
            rows = _comtrade({**base, "reporterCode": ",".join(str(c["code"]) for c in batch)})
        except RuntimeError as e:
            # Fall back to one reporter per call rather than losing the batch.
            warn(f"Batched heatmap query failed ({e}); retrying per country")
            rows = []
            for c in batch:
                try:
                    rows += _comtrade({**base, "reporterCode": c["code"]})
                except RuntimeError as e2:
                    warn(f"Heatmap query for {c['iso3']} failed ({e2})")
        for r in rows:
            if r["flow"] == flow and r["partner"] == 0 and r["cmd"].isdigit() and r["reporter"] in chapter_values:
                ch = r["cmd"].zfill(2)
                bucket = chapter_values[r["reporter"]]
                bucket[ch] = bucket.get(ch, 0.0) + r["value"]

    out_rows = []
    for c in resolved:
        values = chapter_values[c["code"]]
        if not values:
            out_rows.append({"country": c, "total": None, "cells": {}, "missing": True})
            continue
        total, sections = _build_sections(values)
        out_rows.append({
            "country": c, "total": total, "missing": False,
            "cells": {s["id"]: {"value": s["value"], "share": s["share"]} for s in sections},
        })
    return {
        "flow": flow, "flow_name": FLOW_NAMES[flow], "year": yr, "rows": out_rows,
        "sections": [{"id": s[0], "name": s[1], "short": s[2], "group": s[5]} for s in SECTIONS],
        "source": "UN Comtrade (HS, as reported)",
    }


# ----------------------------------------------------------------------
# World leaderboard + multi-country comparison (World Bank / WTO series)
# ----------------------------------------------------------------------
#
# Both use the World Bank's WTO-sourced merchandise trade series, which cover
# ~200 economies in one request per indicator -- far cheaper than asking
# Comtrade for every reporter -- and give consistent multi-year history.
# Taiwan isn't in World Bank data, so it's absent from both (noted in the UI).

WB_COUNTRIES_URL = "https://api.worldbank.org/v2/country"
WB_EXPORTS = "TX.VAL.MRCH.CD.WT"
WB_IMPORTS = "TM.VAL.MRCH.CD.WT"
DEFAULT_COMPARE = ["USA", "CHN", "DEU", "JPN", "IND", "MEX"]
MAX_COMPARE = 8


def _wb_countries():
    """iso3 -> {name, iso2, region} for real economies (aggregates such as
    'World' or 'East Asia & Pacific' are dropped), cached for a month."""
    hit = _cache_get("wb:countries")
    if hit is not None:
        return hit["v"]
    body = _http_get_json(WB_COUNTRIES_URL, params={"format": "json", "per_page": 400})
    out = {}
    if isinstance(body, list) and len(body) > 1:
        for c in body[1] or []:
            region = (c.get("region") or {}).get("value") or ""
            if region == "Aggregates" or not c.get("id"):
                continue
            out[c["id"]] = {"name": c.get("name") or c["id"], "iso2": c.get("iso2Code"), "region": region.strip()}
    if not out:
        raise RuntimeError("World Bank country list came back empty")
    _cache_set("wb:countries", out, TTL_REFERENCE)
    return out


def _wb_all(indicator, year):
    """iso3 -> value for every economy (and aggregates, incl. WLD) in one year."""
    key = f"wb:all:{indicator}:{year}"
    hit = _cache_get(key)
    if hit is not None:
        return hit["v"]
    body = _http_get_json(WB_URL.format(iso3="all", indicator=indicator),
                          params={"format": "json", "date": str(year), "per_page": 400})
    out = {}
    if isinstance(body, list) and len(body) > 1:
        for pt in body[1] or []:
            iso3 = pt.get("countryiso3code")
            if iso3 and pt.get("value") is not None:
                out[iso3] = float(pt["value"])
    elif isinstance(body, list) and body and isinstance(body[0], dict) and body[0].get("message"):
        raise RuntimeError(f"World Bank: {body[0]['message'][0].get('value', 'unknown error')}")
    _cache_set(key, out, TTL_DATA if out else TTL_EMPTY)
    return out


def _wb_country_dict(iso3, meta):
    m = meta.get(iso3, {})
    return {"iso3": iso3, "name": m.get("name", iso3), "flag": _flag(m.get("iso2")),
            "region": m.get("region"), "has_profile": iso3 in _BY_ISO3}


def get_trade_leaderboard_full(year=None):
    """Every economy ranked by merchandise trade (exports + imports), with
    exports, imports, balance, share of world trade, year-on-year growth and
    rank movement. Without a year, uses the latest year at least ~120
    economies have reported (the newest year fills in over several months)."""
    log_event(f"Fetching trade leaderboard {year or 'latest'}")
    meta = _wb_countries()
    this_year = date.today().year
    candidates = [int(year)] if year else list(range(this_year - 1, this_year - 5, -1))
    yr = None
    for y in candidates:
        x = _wb_all(WB_EXPORTS, y)
        if year or sum(1 for k in x if k in meta) >= 120:
            yr = y
            break
    if yr is None:
        yr = candidates[-1]

    def table(y):
        x, m = _wb_all(WB_EXPORTS, y), _wb_all(WB_IMPORTS, y)
        rows = {}
        for iso3 in meta:
            ex, im = x.get(iso3), m.get(iso3)
            if ex is None and im is None:
                continue
            rows[iso3] = {"exports": ex, "imports": im, "total": (ex or 0) + (im or 0),
                          "complete": ex is not None and im is not None}
        world = {"exports": x.get("WLD"), "imports": m.get("WLD")}
        return rows, world

    rows, world = table(yr)
    prev_rows, _ = table(yr - 1)
    world_total = (world["exports"] or 0) + (world["imports"] or 0) or sum(r["total"] for r in rows.values())

    def ranked(d):
        order = sorted((k for k, r in d.items() if r["complete"]), key=lambda k: d[k]["total"], reverse=True)
        return {k: i + 1 for i, k in enumerate(order)}

    rank_now, rank_prev = ranked(rows), ranked(prev_rows)
    out = []
    for iso3, r in rows.items():
        if not r["complete"]:
            continue
        prev = prev_rows.get(iso3)
        growth = ((r["total"] / prev["total"] - 1) * 100) if prev and prev["complete"] and prev["total"] else None
        out.append({
            **_wb_country_dict(iso3, meta),
            "rank": rank_now[iso3],
            "rank_change": (rank_prev[iso3] - rank_now[iso3]) if iso3 in rank_prev else None,
            "exports": r["exports"], "imports": r["imports"], "total": r["total"],
            "balance": r["exports"] - r["imports"],
            "world_share": (r["total"] / world_total * 100) if world_total else None,
            "growth": growth,
        })
    out.sort(key=lambda r: r["rank"])
    regions = sorted({r["region"] for r in out if r["region"]})
    return {
        "year": yr, "years": list(range(this_year - 1, 1999, -1)),
        "world_exports": world["exports"], "world_imports": world["imports"], "world_total": world_total,
        "countries": out, "regions": regions,
        "source": "World Bank / WTO merchandise trade (TX.VAL.MRCH.CD.WT, TM.VAL.MRCH.CD.WT)",
        "note": "Goods only (services excluded). Taiwan isn't covered by World Bank data.",
    }


def _wb_multi(iso3s, indicator, start, end):
    """{iso3: {year: value}} for several economies in one request."""
    joined = ";".join(sorted(iso3s))
    key = f"wb:multi:{indicator}:{joined}:{start}:{end}"
    hit = _cache_get(key)
    if hit is not None:
        return hit["v"]
    body = _http_get_json(WB_URL.format(iso3=joined, indicator=indicator),
                          params={"format": "json", "date": f"{start}:{end}", "per_page": 2000})
    out = {}
    if isinstance(body, list) and len(body) > 1:
        for pt in body[1] or []:
            iso3 = pt.get("countryiso3code")
            if iso3 and pt.get("value") is not None:
                out.setdefault(iso3, {})[str(pt["date"])] = float(pt["value"])
    elif isinstance(body, list) and body and isinstance(body[0], dict) and body[0].get("message"):
        raise RuntimeError(f"World Bank: {body[0]['message'][0].get('value', 'unknown error')}")
    _cache_set(key, out, TTL_DATA if out else TTL_EMPTY)
    return out


def get_trade_compare_full(countries=None, start=None, end=None):
    """Exports / imports / total / balance / share of world trade per year for
    up to MAX_COMPARE economies, for comparing trade patterns over time."""
    meta = _wb_countries()
    picked = []
    for c in (countries or DEFAULT_COMPARE):
        c = c.strip().upper()
        if c in meta and c not in picked:
            picked.append(c)
    picked = picked[:MAX_COMPARE]
    end = int(end) if end else date.today().year - 1
    start = int(start) if start else end - 20
    log_event(f"Fetching trade comparison {picked} {start}-{end}")
    if not picked:
        return {"start": start, "end": end, "series": [], "world": [], "countries": [],
                "source": "World Bank / WTO merchandise trade"}

    iso_list = picked + ["WLD"]
    x = _wb_multi(iso_list, WB_EXPORTS, start, end)
    m = _wb_multi(iso_list, WB_IMPORTS, start, end)

    def points(iso3):
        pts = []
        for y in range(start, end + 1):
            ex, im = x.get(iso3, {}).get(str(y)), m.get(iso3, {}).get(str(y))
            pts.append({"year": y, "exports": ex, "imports": im,
                        "total": (ex + im) if ex is not None and im is not None else None,
                        "balance": (ex - im) if ex is not None and im is not None else None})
        return pts

    world = points("WLD")
    world_by_year = {p["year"]: p["total"] for p in world}
    series = []
    for iso3 in picked:
        pts = points(iso3)
        for p in pts:
            wt = world_by_year.get(p["year"])
            p["world_share"] = (p["total"] / wt * 100) if p["total"] is not None and wt else None
        series.append({**_wb_country_dict(iso3, meta), "points": pts})

    # Trim trailing years nobody has reported yet.
    last = max((p["year"] for s in series for p in s["points"] if p["total"] is not None), default=end)
    for s in series:
        s["points"] = [p for p in s["points"] if p["year"] <= last]
    world = [p for p in world if p["year"] <= last]

    return {
        "start": start, "end": last, "series": series, "world": world,
        "countries": sorted((_wb_country_dict(k, meta) for k in meta), key=lambda c: c["name"]),
        "max_countries": MAX_COMPARE,
        "source": "World Bank / WTO merchandise trade (TX.VAL.MRCH.CD.WT, TM.VAL.MRCH.CD.WT)",
    }


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------

def _fmt_usd(v):
    if v is None:
        return "N/A"
    for div, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(v) >= div:
            return f"${v / div:,.2f}{suffix}"
    return f"${v:,.0f}"


def trade_profile():
    """Console version: top export/import sections for one country."""
    ident = input("Country (ISO3, e.g. USA, CHN, DEU): ").strip() or "USA"
    flow_in = input("Exports or imports? (x/m) [x]: ").strip().lower()
    flow = "M" if flow_in.startswith("m") else "X"
    try:
        data = get_trade_profile_full(ident, flow)
    except KeyError as e:
        print(f"  {e}")
        return None
    c = data["country"]
    print(f"\n===== {c['name']} — {data['flow_name'].upper()} {data['year'] or ''} =====")
    if not data["sections"]:
        print(f"  {data.get('note', 'No data')}")
        return data
    print(f"  Total: {_fmt_usd(data['total'])}\n")
    for s in sorted(data["sections"], key=lambda s: s["value"], reverse=True):
        if s["value"] <= 0:
            continue
        bar = "█" * max(1, int(round(s["share"] / 2)))
        print(f"  {s['name']:<26} {_fmt_usd(s['value']):>10}  {s['share']:5.1f}%  {bar}")
    print("=" * 50)
    print(f"  Source: {data['source']}\n")
    return data


if __name__ == "__main__":
    trade_profile()
