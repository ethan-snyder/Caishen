"""
econ.py — data for the ECONOMICS tab.

    get_econ_data() -> {
        "indicators": [...],      # headline macro series (FRED)
        "groups": [...],          # indicator groups, in display order
        "calendar": [...],        # upcoming/recent release dates (FRED)
        "calendar_error": str|None,
        "fed": [...],             # Federal Reserve RSS: press, speeches, testimony
        "as_of": iso,
    }

The three parts fail independently: no FRED_API_KEY empties `indicators`
and sets `calendar_error`, while the Fed RSS feeds (no key) still load.
Cached for CACHE_SECONDS -- these series update monthly or weekly at most.

Indicator transforms (what the headline number means):
  level       the published value (unemployment rate, 10Y yield)
  yoy         % change vs. the observation ~12 months earlier (CPI, M2)
  mom_change  change vs. the prior observation (payrolls added this month)
History is reported in the same transformed space as the headline, so the
sparkline plots the quantity the number describes.
"""

import os
import threading
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import requests

from logger import warn
import market_info  # loads backend/.env and owns the shared fredapi client

CACHE_SECONDS = 1800
HISTORY_POINTS = 36
HEADERS = {"User-Agent": "Moneta/1.0 (investing terminal; personal use)"}

GROUPS = ["Growth", "Labor", "Inflation", "Rates", "Consumer", "Housing"]

# key, label, sub, group, unit, direction, series_id, transform, scale
INDICATORS = [
    ("gdp", "Real GDP", "Quarterly growth, annualized", "Growth", "%", "up_good", "A191RL1Q225SBEA", "level", 1),
    ("indpro", "Industrial Production", "12-month change", "Growth", "%", "up_good", "INDPRO", "yoy", 1),
    ("unrate", "Unemployment Rate", "U-3, seasonally adjusted", "Labor", "%", "up_bad", "UNRATE", "level", 1),
    ("payems", "Nonfarm Payrolls", "Jobs added vs. prior month", "Labor", "K", "up_good", "PAYEMS", "mom_change", 1),
    ("icsa", "Initial Jobless Claims", "Weekly, seasonally adjusted", "Labor", "K", "up_bad", "ICSA", "level", 0.001),
    ("cpi", "CPI Inflation", "All items, 12-month change", "Inflation", "%", "up_bad", "CPIAUCSL", "yoy", 1),
    ("core_cpi", "Core CPI", "Ex food & energy, 12-month change", "Inflation", "%", "up_bad", "CPILFESL", "yoy", 1),
    ("core_pce", "Core PCE", "The Fed's preferred gauge, 12-month change", "Inflation", "%", "up_bad", "PCEPILFE", "yoy", 1),
    ("fedfunds", "Fed Funds Rate", "Effective, monthly average", "Rates", "%", "neutral", "FEDFUNDS", "level", 1),
    ("dgs10", "10-Year Treasury", "Constant maturity yield", "Rates", "%", "neutral", "DGS10", "level", 1),
    ("m2", "M2 Money Supply", "12-month change", "Rates", "%", "neutral", "M2SL", "yoy", 1),
    ("retail", "Retail Sales", "12-month change", "Consumer", "%", "up_good", "RSAFS", "yoy", 1),
    ("umcsent", "Consumer Sentiment", "University of Michigan", "Consumer", "", "up_good", "UMCSENT", "level", 1),
    ("mortgage", "30-Yr Mortgage Rate", "Freddie Mac weekly average", "Housing", "%", "up_bad", "MORTGAGE30US", "level", 1),
    ("houst", "Housing Starts", "Annualized, thousands of units", "Housing", "K", "up_good", "HOUST", "level", 1),
]

# FRED release names worth showing on the calendar (it lists hundreds).
CALENDAR_KEYWORDS = [
    "Consumer Price Index", "Employment Situation", "Gross Domestic Product",
    "Personal Income and Outlays", "Producer Price Index",
    "Advance Monthly Sales for Retail", "Industrial Production",
    "New Residential Construction", "Unemployment Insurance Weekly Claims",
    "Job Openings and Labor Turnover", "Surveys of Consumers",
    "Advance Durable Goods", "Existing Home Sales", "New Residential Sales",
    "Employment Cost Index", "Productivity and Costs", "FOMC",
    "H.15 Selected Interest Rates", "Construction Spending",
]

FED_FEEDS = [
    ("press", "Press release", "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("speeches", "Speech", "https://www.federalreserve.gov/feeds/speeches.xml"),
    ("testimony", "Testimony", "https://www.federalreserve.gov/feeds/testimony.xml"),
]

_lock = threading.Lock()
_cache = None
_cache_at = 0.0


# ---------------------------------------------------------------------
# Indicators
# ---------------------------------------------------------------------

def _transform(series, transform):
    """pandas Series (DatetimeIndex) -> list of (date, value) in transformed space."""
    s = series.dropna()
    if transform == "level":
        return [(d, float(v)) for d, v in s.items()]
    if transform == "mom_change":
        diff = s.diff().dropna()
        return [(d, float(v)) for d, v in diff.items()]
    if transform == "yoy":
        out = []
        for d, v in s.items():
            prior = s[s.index <= d - timedelta(days=360)]
            if not len(prior):
                continue
            p = float(prior.iloc[-1])
            if p:
                out.append((d, (float(v) - p) / p * 100))
        return out
    raise ValueError(transform)


def _indicator(spec):
    key, label, sub, group, unit, direction, series_id, transform, scale = spec
    fred = market_info._get_fred_client()
    start = (date.today() - timedelta(days=365 * 5)).isoformat()
    series = fred.get_series(series_id, observation_start=start)
    pts = [(d, v * scale) for d, v in _transform(series, transform)]
    if not pts:
        raise ValueError(f"{series_id}: no observations")
    tail = pts[-HISTORY_POINTS:]
    value = tail[-1][1]
    prev = tail[-2][1] if len(tail) >= 2 else None
    return {
        "key": key, "label": label, "sub": sub, "group": group, "unit": unit,
        "direction": direction, "series_id": series_id, "source": "FRED",
        "transform": transform,
        "value": value,
        "prev": prev,
        "change": (value - prev) if prev is not None else None,
        "date": tail[-1][0].date().isoformat(),
        "history": [{"date": d.date().isoformat(), "value": v} for d, v in tail],
    }


def _indicators():
    out = []
    for spec in INDICATORS:
        try:
            out.append(_indicator(spec))
        except Exception as e:
            warn(f"econ: {spec[6]} unavailable ({e})")
    return out


# ---------------------------------------------------------------------
# Release calendar (FRED /releases/dates)
# ---------------------------------------------------------------------

def _calendar():
    key = os.environ.get("FRED_API_KEY", "")
    if not key:
        raise ValueError("FRED_API_KEY not set (get a free key at fred.stlouisfed.org/docs/api/api_key.html)")
    today = date.today()
    r = requests.get(
        "https://api.stlouisfed.org/fred/releases/dates",
        params={
            "api_key": key, "file_type": "json",
            "realtime_start": (today - timedelta(days=7)).isoformat(),
            "realtime_end": (today + timedelta(days=28)).isoformat(),
            "include_release_dates_with_no_data": "true",
            "sort_order": "asc", "limit": 1000,
        },
        headers=HEADERS, timeout=15,
    )
    r.raise_for_status()
    seen, out = set(), []
    for row in r.json().get("release_dates", []):
        name = row.get("release_name") or ""
        if not any(k.lower() in name.lower() for k in CALENDAR_KEYWORDS):
            continue
        d = row.get("date")
        sig = (d, name)
        if not d or sig in seen:
            continue
        seen.add(sig)
        out.append({
            "date": d, "name": name, "release_id": row.get("release_id"),
            "is_past": d < today.isoformat(),
        })
    out.sort(key=lambda x: x["date"])
    return out


# ---------------------------------------------------------------------
# Federal Reserve RSS
# ---------------------------------------------------------------------

def _fed_feed(feed, label, url):
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        if not title:
            continue
        pub = it.findtext("pubDate")
        published = None
        if pub:
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat(timespec="minutes")
            except (TypeError, ValueError):
                published = None
        summary = (it.findtext("description") or "").strip() or None
        items.append({
            "feed": feed, "feed_label": label, "title": title,
            "link": (it.findtext("link") or "").strip() or None,
            "published": published,
            "summary": summary[:400] if summary else None,
        })
    return items


def _fed():
    out = []
    for feed, label, url in FED_FEEDS:
        try:
            out.extend(_fed_feed(feed, label, url))
        except Exception as e:
            warn(f"econ: Fed feed '{feed}' unavailable ({e})")
    out.sort(key=lambda x: x["published"] or "", reverse=True)
    return out[:40]


# ---------------------------------------------------------------------

def get_econ_data(force=False):
    global _cache, _cache_at
    with _lock:
        if not force and _cache is not None and (time.monotonic() - _cache_at) < CACHE_SECONDS:
            return _cache

    calendar, calendar_error = [], None
    try:
        calendar = _calendar()
    except Exception as e:
        calendar_error = str(e)

    indicators = _indicators()
    data = {
        "indicators": indicators,
        "groups": [g for g in GROUPS if any(i["group"] == g for i in indicators)],
        "calendar": calendar,
        "calendar_error": calendar_error,
        "fed": _fed(),
        "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with _lock:
        _cache = data
        # A payload with nothing in it (network blip, missing key) is only
        # cached briefly so it doesn't stick for the full half hour.
        _cache_at = time.monotonic() - (CACHE_SECONDS - 120 if not indicators else 0)
    return data
