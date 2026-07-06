"""
config.py
Central configuration + startup validation for HireView.

Read every environment variable in ONE place so nothing reads os.getenv ad hoc,
and fail loudly at startup (validate()) instead of silently later at runtime.

Data layer:
  - If TURSO_DATABASE_URL is set  -> connect to Turso (cloud SQLite) in production.
  - If it is empty                -> fall back to a local SQLite file for dev.
    Both use the same `libsql` driver, so there is exactly one code path.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


# --- Data ---
TURSO_DATABASE_URL = _env("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = _env("TURSO_AUTH_TOKEN")
USE_TURSO = bool(TURSO_DATABASE_URL)
LOCAL_DB_PATH = Path(__file__).parent / "data" / "jobs.db"

# --- Web ---
# Comma-separated list of origins allowed to call the API (the deployed frontend).
FRONTEND_ORIGINS = [
    o.strip()
    for o in _env(
        "FRONTEND_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")
    if o.strip()
]

# --- Logging ---
LOG_LEVEL = _env("LOG_LEVEL", "INFO").upper()


def validate() -> None:
    """Raise on inconsistent config. Called once at API startup."""
    if TURSO_DATABASE_URL and not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            "TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing. "
            "Set both (Turso) or neither (local SQLite)."
        )
    if not FRONTEND_ORIGINS:
        raise RuntimeError("FRONTEND_ORIGINS resolved to an empty list.")
