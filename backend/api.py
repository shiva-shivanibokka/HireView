"""
AutoApply Job Agent — FastAPI Backend
======================================

Endpoints:
  POST /api/search          — scrape + score jobs, save to SQLite
  GET  /api/jobs            — list saved jobs (with optional status filter)
  GET  /api/jobs/{id}       — get single job detail
  POST /api/jobs/{id}/fetch-description — fetch full JD text from URL
  POST /api/jobs/{id}/generate          — generate resume + cover letter (SSE)
  POST /api/jobs/{id}/autofill          — launch Playwright autofill
  PATCH /api/jobs/{id}/status           — update job status
  GET  /api/applications               — application history
  GET  /api/download/{file_id}         — serve generated file
  GET  /api/health                     — health check

Run:
  cd backend
  uvicorn api:app --reload --port 8000
"""

import os
import uuid
import json
import asyncio
import tempfile
import threading
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import anthropic

from scraper import search_jobs, fetch_job_description
from matcher import score_jobs_batch, parse_keywords
from job_store import (
    upsert_job,
    get_jobs,
    get_job,
    update_job_status,
    update_job_match_score,
    log_application,
    get_applications,
)
from autofill import run_autofill
from resumeforge import (
    extract_jd_structured,
    parse_resume,
    build_resume,
    FontConfig,
    generate_cover_letter_text,
    build_cover_letter_docx,
    score_resume,
    extract_resume_text,
    match_and_tailor,
)

load_dotenv(override=True)

app = FastAPI(title="AutoApply Job Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory file store ──────────────────────────────────────────────────────
FILE_STORE: dict[str, str] = {}


def _register_file(path: str) -> str:
    fid = str(uuid.uuid4())
    FILE_STORE[fid] = path
    return fid


def _get_client(api_key: str = "") -> anthropic.Anthropic:
    key = (api_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(
            401,
            "Anthropic API key required. Set ANTHROPIC_API_KEY in .env or pass api_key.",
        )
    return anthropic.Anthropic(api_key=key)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _save_upload(file: UploadFile) -> str:
    suffix = Path(file.filename).suffix if file.filename else ".pdf"
    tmp = tempfile.mktemp(suffix=suffix, prefix="autoapply_")
    content = await file.read()
    Path(tmp).write_bytes(content)
    return tmp


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1 — Search + score jobs
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/search")
async def search(
    keywords: str = Form(...),
    location: str = Form(""),
    resume_file: UploadFile = File(...),
    adzuna_app_id: str = Form(""),
    adzuna_app_key: str = Form(""),
    use_greenhouse: str = Form("true"),
    use_lever: str = Form("true"),
    use_ashby: str = Form("true"),
):
    """
    Scrape jobs from all sources, score against uploaded resume, save to DB.
    Returns scored + sorted job list immediately (no streaming needed — <30s).
    """
    resume_path = await _save_upload(resume_file)

    try:
        # Read resume text for scoring (no API key needed — pure text extraction)
        from resumeforge.resume_parser import extract_raw_text

        resume_text = extract_raw_text(resume_path)
    finally:
        try:
            os.remove(resume_path)
        except Exception:
            pass

    kw_list = parse_keywords(keywords)

    # Scrape
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

    # Score batch
    scored = score_jobs_batch(raw_jobs, resume_text, kw_list)

    # Persist to SQLite
    for job in scored:
        upsert_job(job)

    return {
        "jobs": scored[:100],  # return top 100
        "total": len(scored),
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1b — Parse resume contact info (no API key needed)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/parse-resume-info")
async def parse_resume_info(resume_file: UploadFile = File(...)):
    """
    Extract name, email, phone, linkedin_url, github_url from a resume.
    Uses regex only — no LLM call, instant.
    """
    resume_path = await _save_upload(resume_file)
    try:
        from resumeforge.resume_parser import extract_raw_text, extract_contact_info

        raw_text = extract_raw_text(resume_path)
        info = extract_contact_info(raw_text)
        return {
            "name": info.get("name", ""),
            "email": info.get("email", ""),
            "phone": info.get("phone", ""),
            "linkedin_url": info.get("linkedin_url", ""),
            "github_url": info.get("github_url", ""),
        }
    except Exception as e:
        return {
            "name": "",
            "email": "",
            "phone": "",
            "linkedin_url": "",
            "github_url": "",
            "error": str(e),
        }
    finally:
        try:
            os.remove(resume_path)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2 — List saved jobs
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/jobs")
async def list_jobs(status: Optional[str] = None, limit: int = 100):
    return {"jobs": get_jobs(status=status, limit=limit)}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 3 — Get single job
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/jobs/{job_id}")
async def get_job_detail(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 4 — Fetch full JD text for a job
# ─────────────────────────────────────────────────────────────────────────────


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

    # Update stored description
    job["description"] = text
    upsert_job(job)

    return {"description": text}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 5 — Generate resume + cover letter  (SSE streaming)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/jobs/{job_id}/generate")
async def generate_application(
    job_id: str,
    resume_file: UploadFile = File(...),
    github_url: str = Form(""),
    gh_token: str = Form(""),
    linkedin_url: str = Form(""),
    page_option: str = Form("1-page"),
    font_family: str = Form("Calibri"),
    cl_tone: str = Form("Professional"),
    api_key: str = Form(""),
    # Override: user can upload their own resume/cover letter instead of generating
    use_custom_resume: str = Form("false"),
    custom_resume: Optional[UploadFile] = File(None),
):
    """
    Full pipeline: parse JD → parse resume → match projects → build resume → cover letter.
    Streams progress via SSE.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    client = _get_client(api_key)

    resume_path = await _save_upload(resume_file)

    # Handle custom resume upload
    custom_resume_path = None
    if use_custom_resume.lower() == "true" and custom_resume:
        custom_resume_path = await _save_upload(custom_resume)

    def _stream():
        log_queue: list[str] = []
        result_holder: dict = {}
        error_holder: dict = {}

        def log(msg: str):
            log_queue.append(msg)

        def _run():
            try:
                # ── Ensure we have a full JD description ──────────────────
                jd_text = job.get("description", "")
                if len(jd_text) < 200:
                    log("Fetching full job description...")
                    jd_text = fetch_job_description(job["url"])
                    if jd_text:
                        job["description"] = jd_text
                        upsert_job(job)

                if not jd_text:
                    error_holder["msg"] = (
                        "Could not fetch job description. Try pasting it manually."
                    )
                    return

                # ── Parse JD ──────────────────────────────────────────────
                log("Parsing job description...")
                jd_structured = extract_jd_structured(jd_text, client)
                # Merge in any data already scraped
                if not jd_structured.get("job_title"):
                    jd_structured["job_title"] = job.get("title", "")
                if not jd_structured.get("company"):
                    jd_structured["company"] = job.get("company", "")

                # ── Parse resume ──────────────────────────────────────────
                log("Parsing resume...")
                resume_data = parse_resume(resume_path, client)

                # Patch URLs
                if linkedin_url.strip():
                    resume_data["linkedin_url"] = linkedin_url.strip()
                if github_url.strip():
                    resume_data["github_url"] = github_url.strip()

                # ── If custom resume provided, skip generation ────────────
                if custom_resume_path:
                    log("Using your uploaded resume — skipping generation.")
                    result_holder["resume_data"] = resume_data
                    result_holder["jd_structured"] = jd_structured
                    result_holder["jd_raw"] = jd_text
                    result_holder["resume_pdf_path"] = custom_resume_path
                    result_holder["pdf_id"] = _register_file(custom_resume_path)
                    result_holder["pdf_name"] = Path(custom_resume_path).name
                    result_holder["docx_id"] = None
                    result_holder["docx_name"] = None
                    result_holder["matched_payload"] = {}
                    result_holder["scores"] = {}
                else:
                    # ── Fetch GitHub projects ─────────────────────────────
                    projects = []
                    if github_url.strip():
                        log(f"Fetching GitHub projects for {github_url}...")
                        from resumeforge.github_parser import parse_github_profile

                        gh_result = parse_github_profile(
                            github_url.strip(),
                            client,
                            token=gh_token.strip() or None,
                            max_repos=25,
                            progress_callback=log,
                        )
                        if gh_result["success"]:
                            from resumeforge.project_matcher import rank_projects_for_jd

                            log("Ranking projects for this JD...")
                            projects = rank_projects_for_jd(
                                jd_structured, gh_result["projects"], client, top_n=10
                            )

                    # ── Generate tailored resume content ──────────────────
                    log("Tailoring resume content to JD...")
                    matched = match_and_tailor(
                        jd_structured,
                        resume_data,
                        projects,
                        client,
                        num_projects=min(4, max(1, len(projects))),
                        bullets_per_project=3,
                    )

                    # ── Build DOCX + PDF ──────────────────────────────────
                    log(f"Building {page_option} resume...")
                    fc = FontConfig(
                        body_font=font_family,
                        name_font=font_family,
                        heading_font=font_family,
                    )
                    build_result = build_resume(
                        personal=resume_data,
                        education=resume_data.get("education", []),
                        matched_payload=matched,
                        output_dir=None,
                        to_pdf=True,
                        one_page=(page_option != "2-page"),
                        font_config=fc,
                        auto_fill=(page_option != "2-page"),
                    )

                    docx_path = build_result.get("docx_path")
                    pdf_path = build_result.get("pdf_path")

                    if not docx_path:
                        error_holder["msg"] = "Resume build failed."
                        return

                    # ── Score ─────────────────────────────────────────────
                    log("Scoring resume...")
                    resume_text_for_score = extract_resume_text(docx_path)
                    scores = score_resume(resume_text_for_score, jd_text, client)
                    log(
                        f"ATS: {scores.get('ats_score', 0)}/10  JD Match: {scores.get('match_score', 0)}/10"
                    )

                    result_holder["resume_data"] = resume_data
                    result_holder["jd_structured"] = jd_structured
                    result_holder["jd_raw"] = jd_text
                    result_holder["matched_payload"] = matched
                    result_holder["docx_id"] = _register_file(docx_path)
                    result_holder["pdf_id"] = (
                        _register_file(pdf_path) if pdf_path else None
                    )
                    result_holder["docx_name"] = Path(docx_path).name
                    result_holder["pdf_name"] = (
                        Path(pdf_path).name if pdf_path else None
                    )
                    result_holder["resume_pdf_path"] = pdf_path or docx_path
                    result_holder["scores"] = scores

                # ── Cover letter ──────────────────────────────────────────
                log("Generating cover letter...")
                cl_text = generate_cover_letter_text(
                    jd_structured=result_holder["jd_structured"],
                    resume_data=result_holder["resume_data"],
                    matched_payload=result_holder.get("matched_payload", {}),
                    selected_keywords=result_holder["jd_structured"].get(
                        "keywords", []
                    )[:10],
                    tone=cl_tone,
                    client=client,
                )
                cl_result = build_cover_letter_docx(
                    cl_text,
                    result_holder["resume_data"],
                    result_holder["jd_structured"],
                )
                cl_pdf = cl_result.get("pdf_path")
                cl_docx = cl_result.get("docx_path")

                result_holder["cover_letter_text"] = cl_text
                result_holder["cl_pdf_id"] = _register_file(cl_pdf) if cl_pdf else None
                result_holder["cl_docx_id"] = (
                    _register_file(cl_docx) if cl_docx else None
                )
                result_holder["cl_pdf_name"] = Path(cl_pdf).name if cl_pdf else None
                result_holder["cl_pdf_path"] = cl_pdf

                update_job_status(job_id, "generated")
                log("Done!")

            except Exception as e:
                import traceback

                error_holder["msg"] = str(e)
                log_queue.append(f"ERROR: {e}")
                log_queue.append(traceback.format_exc())
            finally:
                try:
                    os.remove(resume_path)
                except Exception:
                    pass

        t = threading.Thread(target=_run, daemon=True)
        t.start()

        import time

        sent = 0
        while t.is_alive() or sent < len(log_queue):
            while sent < len(log_queue):
                yield _sse({"type": "progress", "message": log_queue[sent]})
                sent += 1
            time.sleep(0.1)

        if error_holder:
            yield _sse({"type": "error", "message": error_holder["msg"]})
            return

        yield _sse({"type": "done", **result_holder})

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 6 — Autofill
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/jobs/{job_id}/autofill")
async def autofill(
    job_id: str,
    resume_pdf_path: str = Form(...),
    cover_letter_text: str = Form(""),
    cover_letter_path: str = Form(""),
    user_name: str = Form(""),
    user_email: str = Form(""),
    user_phone: str = Form(""),
    user_linkedin: str = Form(""),
    user_github: str = Form(""),
    user_address: str = Form(""),
    user_current_company: str = Form(""),
):
    """
    Launch Playwright to autofill the job application form.
    Browser opens visibly — user reviews and submits manually.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    url = job.get("url", "")
    if not url:
        raise HTTPException(400, "Job has no application URL")

    if not Path(resume_pdf_path).exists():
        raise HTTPException(400, f"Resume file not found: {resume_pdf_path}")

    user_info = {
        "name": user_name,
        "email": user_email,
        "phone": user_phone,
        "linkedin_url": user_linkedin,
        "github_url": user_github,
        "address": user_address,
        "current_company": user_current_company,
    }

    # Run autofill in a thread (Playwright needs its own event loop)
    import concurrent.futures

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        result = await loop.run_in_executor(
            pool,
            lambda: run_autofill(url, resume_pdf_path, cover_letter_text, user_info),
        )

    # Log to applications table
    if result.get("success") or result.get("fields_filled"):
        log_application(
            job_id=job_id,
            job_title=job.get("title", ""),
            company=job.get("company", ""),
            resume_pdf_path=resume_pdf_path,
            cover_letter_path=cover_letter_path,
            cover_letter_text=cover_letter_text,
            notes=f"Fields filled: {result.get('fields_filled', [])}",
        )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 7 — Update job status
# ─────────────────────────────────────────────────────────────────────────────


@app.patch("/api/jobs/{job_id}/status")
async def patch_status(job_id: str, status: str = Form(...)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    valid = {"new", "generated", "filled", "dismissed"}
    if status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")
    update_job_status(job_id, status)
    return {"job_id": job_id, "status": status}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 8 — Application history
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/applications")
async def applications(limit: int = 50):
    return {"applications": get_applications(limit=limit)}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 9 — Download file
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    path = FILE_STORE.get(file_id)
    if not path or not Path(path).exists():
        raise HTTPException(404, "File not found or expired.")

    suffix = Path(path).suffix.lower()
    media = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if suffix == ".docx"
        else "application/pdf"
    )
    disposition = "inline" if suffix == ".pdf" else "attachment"
    return FileResponse(
        path=path,
        filename=Path(path).name,
        media_type=media,
        content_disposition_type=disposition,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 10 — Health
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "AutoApply Job Agent API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
