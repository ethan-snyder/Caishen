"""
logger.py — logging for Caishen.

Two logs, written next to the script:
  - input_log.txt  : every prompt shown to the user and what they typed in
                      response, each with a timestamp, in order.
  - events_log.txt : major events (menu selections, data fetches, key
                      results) and any errors, timestamped down to the
                      millisecond.

setup_logging() is called once at startup (main.py does this first, before
anything else runs) to wire both up. Other modules import log_event(),
warn(), and log_error() to record into the events log.
"""

import os
import builtins
import logging
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_LOG_FILE = os.path.join(SCRIPT_DIR, "input_log.txt")
EVENTS_LOG_FILE = os.path.join(SCRIPT_DIR, "events_log.txt")

_event_logger = None
_original_input = builtins.input


def _logged_input(prompt=""):
    """Drop-in replacement for the builtin input() that also appends the
    prompt and the user's response to input_log.txt."""
    response = _original_input(prompt)
    try:
        with open(INPUT_LOG_FILE, "a", encoding="utf-8") as f:
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{ts}] {prompt}{response}\n")
    except Exception:
        pass  # logging should never be the reason the app breaks
    return response


def setup_logging():
    """Wires up both logs. Safe to call once at program start; a second
    call is a harmless no-op for the event logger (handler only added once)."""
    global _event_logger

    builtins.input = _logged_input

    _event_logger = logging.getLogger("caishen.events")
    _event_logger.setLevel(logging.DEBUG)
    if not _event_logger.handlers:
        handler = logging.FileHandler(EVENTS_LOG_FILE, encoding="utf-8")
        formatter = logging.Formatter(
            fmt="%(asctime)s.%(msecs)03d [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        _event_logger.addHandler(handler)

    log_event("Session started")


def log_event(message, level="INFO"):
    """Record a major event (menu choice, fetch attempted, key result) in
    the events log with a millisecond-precision timestamp."""
    if _event_logger is None:
        return
    fn = getattr(_event_logger, level.lower(), None) or _event_logger.info
    fn(message)


def warn(message):
    """Print a '[warn] ...' line to the console (matches the style already
    used throughout the app) AND record it in the events log as a WARNING,
    so console warnings and the error log always stay in sync."""
    print(f"  [warn] {message}")
    log_event(message, level="WARNING")


def log_error(message, exc=None):
    """Record an error/exception in the events log."""
    if exc is not None:
        log_event(f"{message}: {exc!r}", level="ERROR")
    else:
        log_event(message, level="ERROR")