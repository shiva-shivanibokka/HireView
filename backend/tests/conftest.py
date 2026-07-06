"""
Shared test setup. Points the app at a throwaway SQLite DB (via HIREVIEW_DB_PATH)
BEFORE any app module is imported, and wipes tables between tests.
"""

import os
import tempfile
from pathlib import Path

# Must be set before job_store/config import so the temp DB path takes effect.
_TMP_DB = Path(tempfile.gettempdir()) / "hireview_test.db"
os.environ["HIREVIEW_DB_PATH"] = str(_TMP_DB)
os.environ.pop("TURSO_DATABASE_URL", None)  # force local mode

import pytest  # noqa: E402

import job_store  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    with job_store._conn() as con:
        con.execute("DELETE FROM jobs")
        con.execute("DELETE FROM settings")
    yield


def make_job(job_id: str, **over) -> dict:
    base = {
        "id": job_id,
        "title": "Machine Learning Engineer",
        "company": "Acme",
        "location": "Remote",
        "url": f"https://example.com/{job_id}",
        "description": "python pytorch nlp",
        "required_skills": ["python", "ml"],
        "keywords": ["ml"],
    }
    base.update(over)
    return base
