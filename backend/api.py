"""
HireView — FastAPI Backend

Endpoints:
  POST /api/search                       — scrape jobs, save to SQLite, return all results
  GET  /api/jobs                         — list saved jobs (optional status + sort filters)
  GET  /api/jobs/{id}                    — get single job detail
  POST /api/jobs/{id}/fetch-description  — fetch full JD text from URL
  PATCH /api/jobs/{id}/status            — update job status
  GET  /api/health                       — health check

Run:
  cd backend
  uvicorn api:app --reload --port 8000
"""

import re
from typing import Optional

from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from scraper import search_jobs, fetch_job_description
from job_store import upsert_job, get_jobs, get_job, update_job_status

load_dotenv(override=True)

app = FastAPI(title="HireView API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _keyword_score(job: dict, keywords: list[str]) -> float:
    """Fraction of search keywords found in job title + description (0.0–1.0)."""
    if not keywords:
        return 0.0
    text = (
        job.get("title", "")
        + " "
        + job.get("company", "")
        + " "
        + job.get("description", "")[:2000]
        + " "
        + " ".join(job.get("required_skills", []))
    ).lower()
    hits = sum(1 for kw in keywords if kw.lower() in text)
    return round(hits / len(keywords), 4)


def _parse_keywords(raw: str) -> list[str]:
    parts = re.split(r"[,;|]", raw)
    return [p.strip() for p in parts if p.strip()]


@app.post("/api/search")
async def search(
    keywords: str = Form(...),
    location: str = Form(""),
    adzuna_app_id: str = Form(""),
    adzuna_app_key: str = Form(""),
    use_greenhouse: str = Form("true"),
    use_lever: str = Form("true"),
    use_ashby: str = Form("true"),
):
    """
    Scrape all enabled sources, score by keyword relevance, persist to SQLite,
    and return all results sorted newest first.
    """
    kw_list = _parse_keywords(keywords)

    raw_jobs = search_jobs(
        keywords=keywords,
        location=location,
        adzuna_app_id=adzuna_app_id,
        adzuna_app_key=adzuna_app_key,
        use_greenhouse=(use_greenhouse.lower() == "true"),
        use_lever=(use_lever.lower() == "true"),
        use_ashby=(use_ashby.lower() == "true"),
    )

    if not raw_jobs:
        return {
            "jobs": [],
            "total": 0,
            "message": "No jobs found. Try different keywords or enable more sources.",
        }

    for job in raw_jobs:
        job["match_score"] = _keyword_score(job, kw_list)
        upsert_job(job)

    # Default sort: newest first by actual posting date, fall back to scraped_at
    raw_jobs.sort(
        key=lambda j: j.get("posted_at") or j.get("scraped_at", ""),
        reverse=True,
    )

    return {"jobs": raw_jobs, "total": len(raw_jobs)}


@app.get("/api/jobs")
async def list_jobs(
    status: Optional[str] = None,
    sort: str = "newest",  # "newest" | "relevance"
    limit: int = 0,  # 0 = no limit
):
    return {"jobs": get_jobs(status=status, sort=sort, limit=limit or None)}


@app.get("/api/jobs/{job_id}")
async def get_job_detail(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.post("/api/jobs/{job_id}/fetch-description")
async def fetch_description(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    url = job.get("url", "")
    if not url:
        raise HTTPException(400, "Job has no URL")

    text = fetch_job_description(url)
    if not text:
        raise HTTPException(
            422, "Could not extract JD text from this URL. The page may require login."
        )

    job["description"] = text
    upsert_job(job)
    return {"description": text}


@app.patch("/api/jobs/{job_id}/status")
async def patch_status(job_id: str, status: str = Form(...)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    valid = {"new", "saved", "dismissed"}
    if status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")
    update_job_status(job_id, status)
    return {"job_id": job_id, "status": status}


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "HireView API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
