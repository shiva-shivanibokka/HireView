"""
ranker.py
Resume-aware relevance ranking via BM25 (rank-bm25).

Treats the user's resume as the query and each job as a document, so
score_by_resume() sets job["resume_score"] in [0, 1] = how well the job text
matches the resume, normalized by the top-scoring job in the batch.

BM25 is a lexical ranker: no embeddings, no torch, no model download — a few KB
of pure Python. Good enough to float genuinely-relevant roles to the top without
adding gigabytes to the Cloud Run image or seconds to cold start.
"""

import re

from rank_bm25 import BM25Okapi

_TOKEN = re.compile(r"[a-z0-9+#.]+")


def _tok(text: str) -> list[str]:
    return _TOKEN.findall((text or "").lower())


def _job_text(job: dict) -> str:
    parts = [
        job.get("title", ""),
        job.get("company", ""),
        job.get("description", "")[:1500],
        " ".join(job.get("required_skills", [])),
        " ".join(job.get("keywords", [])),
    ]
    return " ".join(p for p in parts if p)


def score_by_resume(jobs: list[dict], resume_text: str) -> None:
    """Set job['resume_score'] in [0, 1] for every job, in place."""
    if not resume_text or not resume_text.strip() or not jobs:
        for j in jobs:
            j["resume_score"] = 0.0
        return

    corpus = [_tok(_job_text(j)) for j in jobs]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(_tok(resume_text))
    top = max(scores) if len(scores) else 0.0

    for job, s in zip(jobs, scores):
        job["resume_score"] = round(float(s) / top, 4) if top > 0 else 0.0


if __name__ == "__main__":
    # ponytail self-check: the resume-matching job must top the ranking.
    # Needs a realistic corpus size — BM25's IDF is ~0 for a term in a 2-doc set.
    jobs = [
        {"title": "Machine Learning Engineer", "description": "pytorch nlp llm python"},
        {"title": "Warehouse Associate", "description": "forklift shipping pallets"},
        {"title": "Sales Representative", "description": "quota crm outbound calls"},
        {"title": "Registered Nurse", "description": "patient care clinical hospital"},
    ]
    score_by_resume(jobs, "python machine learning nlp pytorch engineer")
    assert jobs[0]["resume_score"] == 1.0, jobs[0]["resume_score"]
    assert all(j["resume_score"] < 1.0 for j in jobs[1:]), jobs
    score_by_resume(jobs, "")  # empty resume -> all zero, no crash
    assert all(j["resume_score"] == 0.0 for j in jobs)
    print("ranker self-check OK")
