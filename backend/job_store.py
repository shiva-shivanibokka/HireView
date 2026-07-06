"""
job_store.py
Persistence layer for HireView.

Uses the `libsql` driver for BOTH environments:
  - local dev  -> a local SQLite file (config.LOCAL_DB_PATH)
  - production -> Turso cloud SQLite (config.TURSO_DATABASE_URL)

libsql is a SQLite fork with a sqlite3-compatible API, so the SQL below is
unchanged from plain SQLite. Rows are turned into dicts from cursor.description
rather than a row_factory, because that works identically for local and remote.
"""

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

import libsql

import config


@contextmanager
def _conn():
    if config.USE_TURSO:
        # ponytail: fresh HTTP connection per call. Adds a handshake per request;
        # fine at personal scale. Pool with a module-level client if latency bites.
        con = libsql.connect(
            database=config.TURSO_DATABASE_URL,
            auth_token=config.TURSO_AUTH_TOKEN,
        )
    else:
        config.LOCAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        con = libsql.connect(str(config.LOCAL_DB_PATH))
    try:
        yield con
        con.commit()
    except Exception:
        try:
            con.rollback()
        except Exception:
            pass
        raise


def _dicts(cur) -> list[dict]:
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _dict_one(cur) -> Optional[dict]:
    row = cur.fetchone()
    if row is None:
        return None
    cols = [c[0] for c in cur.description]
    return dict(zip(cols, row))


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init_db():
    with _conn() as con:
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
            status          TEXT DEFAULT 'new',
            status_updated_at TEXT DEFAULT ''
        )
        """)
        existing = {row[1] for row in con.execute("PRAGMA table_info(jobs)").fetchall()}
        for col, dflt in [
            ("posted_at", "TEXT DEFAULT ''"),
            ("workplace", "TEXT DEFAULT ''"),
            ("status_updated_at", "TEXT DEFAULT ''"),
        ]:
            if col not in existing:
                con.execute(f"ALTER TABLE jobs ADD COLUMN {col} {dflt}")


def upsert_job(job: dict):
    """
    Insert or update a job row.
    - status is preserved on re-scrape
    - scraped_at is preserved (reflects first-seen time, never overwritten)
    """
    with _conn() as con:
        existing = _dict_one(
            con.execute("SELECT status, scraped_at FROM jobs WHERE id=?", (job["id"],))
        )

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
                    job.get("scraped_at", _now()),
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
        rows = _dicts(con.execute(query, params))
    return [_hydrate(r) for r in rows]


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as con:
        row = _dict_one(con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)))
    return _hydrate(row) if row else None


def update_job_status(job_id: str, status: str):
    with _conn() as con:
        con.execute(
            "UPDATE jobs SET status=?, status_updated_at=? WHERE id=?",
            (status, _now(), job_id),
        )


def suggest_titles(query: str, limit: int = 10) -> list[str]:
    if not query.strip():
        return []
    with _conn() as con:
        rows = _dicts(
            con.execute(
                "SELECT DISTINCT title FROM jobs WHERE title LIKE ? ORDER BY title LIMIT ?",
                (f"%{query}%", limit),
            )
        )
    return [r["title"] for r in rows]


def _hydrate(row: dict) -> dict:
    row["required_skills"] = json.loads(row.get("required_skills") or "[]")
    row["keywords"] = json.loads(row.get("keywords") or "[]")
    return row


init_db()
