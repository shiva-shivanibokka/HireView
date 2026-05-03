"""
matcher.py
Semantic + keyword scoring of job listings against user's resume / search keywords.

Two-signal score:
  1. Semantic similarity  (60%) — sentence-transformers cosine similarity
     between job title+description embedding and user profile embedding
  2. Keyword overlap      (40%) — fraction of search keywords found in job text

Final score is 0.0 – 1.0, displayed as 0–100 in the UI.

sentence-transformers is lazy-loaded on first use so the app starts fast.
"""

import re
from typing import Optional

_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _cosine(a, b) -> float:
    import numpy as np

    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _job_text(job: dict) -> str:
    """Concatenate the most signal-rich fields for embedding."""
    parts = [
        job.get("title", ""),
        job.get("company", ""),
        job.get("description", "")[:1500],
        " ".join(job.get("required_skills", [])),
        " ".join(job.get("keywords", [])),
    ]
    return " ".join(p for p in parts if p)


def _keyword_overlap(job_text: str, keywords: list[str]) -> float:
    """Fraction of user keywords present in job text (case-insensitive)."""
    if not keywords:
        return 0.5  # neutral if no keywords
    job_lower = job_text.lower()
    hits = sum(1 for kw in keywords if kw.lower() in job_lower)
    return hits / len(keywords)


def build_user_profile_embedding(
    resume_text: str,
    keywords: list[str],
) -> list[float]:
    """
    Create a single embedding representing the user's profile.
    Combines resume raw text snippet + search keywords.
    """
    profile_text = " ".join(keywords) + " " + resume_text[:1000]
    model = _get_model()
    return model.encode(profile_text, normalize_embeddings=True).tolist()


def score_job(
    job: dict,
    profile_embedding: list[float],
    keywords: list[str],
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
) -> float:
    """
    Score a single job against the user profile. Returns 0.0–1.0.
    """
    text = _job_text(job)
    if not text.strip():
        return 0.0

    model = _get_model()
    job_emb = model.encode(text, normalize_embeddings=True).tolist()

    semantic = max(0.0, _cosine(profile_embedding, job_emb))
    keyword = _keyword_overlap(text, keywords)

    return round(semantic * semantic_weight + keyword * keyword_weight, 4)


def score_jobs_batch(
    jobs: list[dict],
    resume_text: str,
    keywords: list[str],
) -> list[dict]:
    """
    Score all jobs in a batch. Returns jobs list with match_score populated,
    sorted descending by score.

    Batches all job embeddings together for efficiency.
    """
    if not jobs:
        return []

    model = _get_model()
    profile_text = " ".join(keywords) + " " + resume_text[:1000]
    profile_emb = model.encode(profile_text, normalize_embeddings=True)

    texts = [_job_text(j) for j in jobs]
    job_embs = model.encode(
        texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False
    )

    import numpy as np

    for i, job in enumerate(jobs):
        semantic = float(np.dot(profile_emb, job_embs[i]))
        semantic = min(1.0, max(0.0, semantic))  # clamp to [0, 1]
        keyword = _keyword_overlap(texts[i], keywords)
        job["match_score"] = round(min(1.0, semantic * 0.6 + keyword * 0.4), 4)

    return sorted(jobs, key=lambda j: j["match_score"], reverse=True)


def parse_keywords(raw: str) -> list[str]:
    """
    Parse a keyword string into a cleaned list.
    Handles comma/semicolon/pipe separated input.
    e.g. "ML engineer, AI engineer; LLM" → ["ML engineer", "AI engineer", "LLM"]
    """
    parts = re.split(r"[,;|]", raw)
    return [p.strip() for p in parts if p.strip()]
