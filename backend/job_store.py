"""
job_store.py
SQLite persistence layer for AutoApply Job Agent.

Tables:
  jobs         — scraped/fetched job listings
  applications — autofill history (which jobs were filled, with which resume)
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
    """Create tables if they don't exist."""
    with _conn() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            company         TEXT NOT NULL,
            location        TEXT,
            job_type        TEXT,
            source          TEXT,
            url             TEXT,
            description     TEXT,
            required_skills TEXT,   -- JSON array
            keywords        TEXT,   -- JSON array
            match_score     REAL DEFAULT 0,
            scraped_at      TEXT,
            status          TEXT DEFAULT 'new'  -- new | generated | filled | dismissed
        );

        CREATE TABLE IF NOT EXISTS applications (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id          TEXT NOT NULL,
            job_title       TEXT,
            company         TEXT,
            resume_pdf_path TEXT,
            cover_letter_path TEXT,
            cover_letter_text TEXT,
            filled_at       TEXT,
            notes           TEXT,
            FOREIGN KEY (job_id) REFERENCES jobs(id)
        );
        """)


# ── Jobs ──────────────────────────────────────────────────────────────────────


def upsert_job(job: dict):
    """Insert or replace a job. job must have an 'id' field."""
    with _conn() as con:
        con.execute(
            """
            INSERT OR REPLACE INTO jobs
              (id, title, company, location, job_type, source, url,
               description, required_skills, keywords, match_score, scraped_at, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,
              COALESCE((SELECT status FROM jobs WHERE id=?), 'new'))
        """,
            (
                job["id"],
                job.get("title", ""),
                job.get("company", ""),
                job.get("location", ""),
                job.get("job_type", ""),
                job.get("source", ""),
                job.get("url", ""),
                job.get("description", ""),
                json.dumps(job.get("required_skills", [])),
                json.dumps(job.get("keywords", [])),
                job.get("match_score", 0),
                job.get("scraped_at", datetime.utcnow().isoformat()),
                job["id"],
            ),
        )


def get_jobs(status: Optional[str] = None, limit: int = 100) -> list[dict]:
    with _conn() as con:
        if status:
            rows = con.execute(
                "SELECT * FROM jobs WHERE status=? ORDER BY match_score DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT * FROM jobs ORDER BY match_score DESC LIMIT ?", (limit,)
            ).fetchall()
    return [_row_to_job(r) for r in rows]


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_job(row) if row else None


def update_job_status(job_id: str, status: str):
    with _conn() as con:
        con.execute("UPDATE jobs SET status=? WHERE id=?", (status, job_id))


def update_job_match_score(job_id: str, score: float):
    with _conn() as con:
        con.execute("UPDATE jobs SET match_score=? WHERE id=?", (score, job_id))


def _row_to_job(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["required_skills"] = json.loads(d.get("required_skills") or "[]")
    d["keywords"] = json.loads(d.get("keywords") or "[]")
    return d


# ── Applications ──────────────────────────────────────────────────────────────


def log_application(
    job_id: str,
    job_title: str,
    company: str,
    resume_pdf_path: str,
    cover_letter_path: str,
    cover_letter_text: str,
    notes: str = "",
) -> int:
    with _conn() as con:
        cur = con.execute(
            """
            INSERT INTO applications
              (job_id, job_title, company, resume_pdf_path,
               cover_letter_path, cover_letter_text, filled_at, notes)
            VALUES (?,?,?,?,?,?,?,?)
        """,
            (
                job_id,
                job_title,
                company,
                resume_pdf_path,
                cover_letter_path,
                cover_letter_text,
                datetime.utcnow().isoformat(),
                notes,
            ),
        )
        update_job_status(job_id, "filled")
        return cur.lastrowid


def get_applications(limit: int = 50) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM applications ORDER BY filled_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# Initialise on import
init_db()
