"""
job_store.py
SQLite persistence layer for HireView.
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent / "data" / "jobs.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = _conn()
    try:
        con.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            company         TEXT NOT NULL,
            location        TEXT,
            job_type        TEXT DEFAULT '',
            workplace       TEXT DEFAULT '',
            source          TEXT,
            url             TEXT,
            description     TEXT,
            required_skills TEXT,
            keywords        TEXT,
            match_score     REAL DEFAULT 0,
            scraped_at      TEXT,
            posted_at       TEXT DEFAULT '',
            status          TEXT DEFAULT 'new'
        )
        """)
        con.commit()

        # Add new columns to existing databases without breaking the transaction
        existing = {row[1] for row in con.execute("PRAGMA table_info(jobs)")}
        for col, dflt in [
            ("posted_at", "TEXT DEFAULT ''"),
            ("workplace", "TEXT DEFAULT ''"),
        ]:
            if col not in existing:
                con.execute(f"ALTER TABLE jobs ADD COLUMN {col} {dflt}")
        con.commit()
    finally:
        con.close()


def upsert_job(job: dict):
    """
    Insert or update a job row.
    - status is preserved from the existing row on re-scrape
    - scraped_at is preserved from the existing row so it reflects first-seen time
    - All other fields are updated to the latest scraped values
    """
    with _conn() as con:
        existing = con.execute(
            "SELECT status, scraped_at FROM jobs WHERE id=?", (job["id"],)
        ).fetchone()

        if existing:
            con.execute(
                """
                UPDATE jobs SET
                  title=?, company=?, location=?, job_type=?, workplace=?,
                  source=?, url=?, description=?, required_skills=?,
                  keywords=?, match_score=?, posted_at=?
                WHERE id=?
                """,
                (
                    job.get("title", ""),
                    job.get("company", ""),
                    job.get("location", ""),
                    job.get("job_type", ""),
                    job.get("workplace", ""),
                    job.get("source", ""),
                    job.get("url", ""),
                    job.get("description", ""),
                    json.dumps(job.get("required_skills", [])),
                    json.dumps(job.get("keywords", [])),
                    job.get("match_score", 0),
                    job.get("posted_at", ""),
                    job["id"],
                ),
            )
        else:
            con.execute(
                """
                INSERT INTO jobs
                  (id, title, company, location, job_type, workplace, source, url,
                   description, required_skills, keywords, match_score,
                   scraped_at, posted_at, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')
                """,
                (
                    job["id"],
                    job.get("title", ""),
                    job.get("company", ""),
                    job.get("location", ""),
                    job.get("job_type", ""),
                    job.get("workplace", ""),
                    job.get("source", ""),
                    job.get("url", ""),
                    job.get("description", ""),
                    json.dumps(job.get("required_skills", [])),
                    json.dumps(job.get("keywords", [])),
                    job.get("match_score", 0),
                    job.get("scraped_at", datetime.utcnow().isoformat()),
                    job.get("posted_at", ""),
                ),
            )


def get_jobs(
    status: Optional[str] = None,
    sort: str = "newest",
    limit: Optional[int] = None,
) -> list[dict]:
    order = (
        "COALESCE(NULLIF(posted_at,''), scraped_at) DESC"
        if sort == "newest"
        else "match_score DESC"
    )
    where = "WHERE status=?" if status else ""
    params: list = [status] if status else []
    query = f"SELECT * FROM jobs {where} ORDER BY {order}"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    with _conn() as con:
        rows = con.execute(query, params).fetchall()
    return [_row_to_job(r) for r in rows]


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_job(row) if row else None


def update_job_status(job_id: str, status: str):
    with _conn() as con:
        con.execute("UPDATE jobs SET status=? WHERE id=?", (status, job_id))


def _row_to_job(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["required_skills"] = json.loads(d.get("required_skills") or "[]")
    d["keywords"] = json.loads(d.get("keywords") or "[]")
    return d


init_db()
