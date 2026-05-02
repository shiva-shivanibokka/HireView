"""
scraper.py
Job discovery from multiple sources:

  1. Adzuna API          — free, structured JSON, 50+ countries
  2. Greenhouse boards   — boards.greenhouse.io/{company}/jobs (HTML scrape)
  3. Lever boards        — jobs.lever.co/{company} (HTML scrape)
  4. Ashby boards        — jobs.ashbyhq.com/{company} (HTML scrape)

All results are normalised to a common Job dict schema and deduplicated by URL.
"""

import re
import hashlib
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from typing import Optional

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Well-known companies on each ATS platform ─────────────────────────────────
# These are scraped directly when no Adzuna API key is configured.
# Focused on tech/ML companies that post AI/ML/SWE roles.

GREENHOUSE_COMPANIES = [
    "anthropic",
    "openai",
    "cohere",
    "mistral",
    "adept",
    "scale-ai",
    "huggingface",
    "together-ai",
    "anyscale",
    "databricks",
    "snowflake",
    "figma",
    "notion",
    "linear",
    "vercel",
    "stripe",
    "plaid",
    "brex",
    "ramp",
    "lattice",
    "rippling",
    "retool",
    "airtable",
    "webflow",
]

LEVER_COMPANIES = [
    "netflix",
    "lyft",
    "reddit",
    "dropbox",
    "pinterest",
    "cloudflare",
    "hashicorp",
    "grafana",
    "datadog",
    "elastic",
    "confluent",
    "dbt-labs",
    "prefect",
    "dagster",
]

ASHBY_COMPANIES = [
    "mistral",
    "cohere",
    "perplexity",
    "harvey",
    "cognition",
    "cursor",
    "arc",
    "luma-ai",
    "runway",
    "pika-labs",
    "modal-labs",
    "replicate",
    "baseten",
    "fireworks-ai",
]


# ── Job ID helper ─────────────────────────────────────────────────────────────


def _job_id(url: str) -> str:
    """Stable unique ID from URL."""
    return hashlib.md5(url.encode()).hexdigest()[:16]


# ── Normalised job schema ─────────────────────────────────────────────────────


def _job(
    title: str,
    company: str,
    location: str,
    url: str,
    description: str = "",
    job_type: str = "",
    source: str = "",
    required_skills: list = None,
    keywords: list = None,
) -> dict:
    return {
        "id": _job_id(url),
        "title": title.strip(),
        "company": company.strip(),
        "location": location.strip(),
        "url": url.strip(),
        "description": description.strip(),
        "job_type": job_type,
        "source": source,
        "required_skills": required_skills or [],
        "keywords": keywords or [],
        "match_score": 0.0,
        "scraped_at": datetime.utcnow().isoformat(),
    }


# ── 1. Adzuna API ─────────────────────────────────────────────────────────────


def search_adzuna(
    keywords: str,
    location: str = "us",
    results_per_page: int = 50,
    app_id: str = "",
    app_key: str = "",
) -> list[dict]:
    """
    Search Adzuna jobs API.
    Free tier: 250 req/month. Sign up at developer.adzuna.com.
    Falls back silently if no credentials.
    """
    if not app_id or not app_key:
        return []

    country = "us"
    # Map common location strings to Adzuna country codes
    loc_lower = location.lower()
    if any(x in loc_lower for x in ["uk", "london", "england", "britain"]):
        country = "gb"
    elif any(x in loc_lower for x in ["canada", "toronto", "vancouver"]):
        country = "ca"
    elif any(x in loc_lower for x in ["australia", "sydney", "melbourne"]):
        country = "au"

    url = (
        f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
        f"?app_id={app_id}&app_key={app_key}"
        f"&results_per_page={results_per_page}"
        f"&what={requests.utils.quote(keywords)}"
        f"&content-type=application/json"
        f"&sort_by=relevance"
    )

    if location and country == "us":
        url += f"&where={requests.utils.quote(location)}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    jobs = []
    for r in data.get("results", []):
        desc = r.get("description", "")
        jobs.append(
            _job(
                title=r.get("title", ""),
                company=r.get("company", {}).get("display_name", ""),
                location=r.get("location", {}).get("display_name", ""),
                url=r.get("redirect_url", ""),
                description=desc,
                job_type=r.get("contract_time", ""),
                source="adzuna",
            )
        )
    return jobs


# ── 2. Greenhouse scraper ─────────────────────────────────────────────────────


def _scrape_greenhouse(company_slug: str, keywords: list[str]) -> list[dict]:
    """Scrape all jobs from a Greenhouse board and filter by keywords."""
    url = f"https://boards.greenhouse.io/{company_slug}/jobs"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]

    # Greenhouse HTML structure: <div class="opening"> contains <a> with job title
    for opening in soup.find_all("div", class_="opening"):
        a = opening.find("a")
        if not a:
            continue
        title = a.get_text(strip=True)
        job_url = a.get("href", "")
        if not job_url.startswith("http"):
            job_url = f"https://boards.greenhouse.io{job_url}"

        location_el = opening.find("span", class_="location")
        location = location_el.get_text(strip=True) if location_el else ""

        # Keyword filter — skip if no keyword matches title
        title_lower = title.lower()
        if kw_lower and not any(kw in title_lower for kw in kw_lower):
            continue

        jobs.append(
            _job(
                title=title,
                company=company_slug.replace("-", " ").title(),
                location=location,
                url=job_url,
                source="greenhouse",
            )
        )

    return jobs


def scrape_greenhouse_companies(
    keywords: list[str],
    companies: list[str] = None,
) -> list[dict]:
    companies = companies or GREENHOUSE_COMPANIES
    results = []
    for slug in companies:
        try:
            results.extend(_scrape_greenhouse(slug, keywords))
        except Exception:
            continue
    return results


# ── 3. Lever scraper ─────────────────────────────────────────────────────────


def _scrape_lever(company_slug: str, keywords: list[str]) -> list[dict]:
    """Scrape all jobs from a Lever board and filter by keywords."""
    url = f"https://jobs.lever.co/{company_slug}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]

    # Lever HTML: <div class="posting"> contains <h5> title and <span class="location">
    for posting in soup.find_all("div", class_="posting"):
        h5 = posting.find("h5")
        if not h5:
            continue
        title = h5.get_text(strip=True)

        a = posting.find("a", class_="posting-btn-submit")
        if not a:
            a = posting.find("a")
        job_url = a.get("href", "") if a else ""
        if not job_url:
            continue
        if not job_url.startswith("http"):
            job_url = f"https://jobs.lever.co{job_url}"

        location_el = posting.find("span", class_="location")
        location = location_el.get_text(strip=True) if location_el else ""

        title_lower = title.lower()
        if kw_lower and not any(kw in title_lower for kw in kw_lower):
            continue

        jobs.append(
            _job(
                title=title,
                company=company_slug.replace("-", " ").title(),
                location=location,
                url=job_url,
                source="lever",
            )
        )

    return jobs


def scrape_lever_companies(
    keywords: list[str],
    companies: list[str] = None,
) -> list[dict]:
    companies = companies or LEVER_COMPANIES
    results = []
    for slug in companies:
        try:
            results.extend(_scrape_lever(slug, keywords))
        except Exception:
            continue
    return results


# ── 4. Ashby scraper ─────────────────────────────────────────────────────────


def _scrape_ashby(company_slug: str, keywords: list[str]) -> list[dict]:
    """Scrape Ashby job board (JSON API endpoint they expose publicly)."""
    api_url = f"https://api.ashbyhq.com/posting-api/job-board/{company_slug}"
    try:
        resp = requests.get(api_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]
    company_name = company_slug.replace("-", " ").title()

    for posting in data.get("jobPostings", []):
        title = posting.get("title", "")
        job_url = (
            posting.get("jobUrl", "")
            or f"https://jobs.ashbyhq.com/{company_slug}/{posting.get('id', '')}"
        )
        location = (
            posting.get("locationName", "")
            or posting.get("isRemote", False)
            and "Remote"
            or ""
        )
        desc = posting.get("descriptionHtml", "")
        # Strip HTML tags from description
        if desc:
            desc = BeautifulSoup(desc, "html.parser").get_text(separator="\n")

        title_lower = title.lower()
        if kw_lower and not any(kw in title_lower for kw in kw_lower):
            continue

        jobs.append(
            _job(
                title=title,
                company=company_name,
                location=str(location),
                url=job_url,
                description=desc[:3000],
                source="ashby",
            )
        )

    return jobs


def scrape_ashby_companies(
    keywords: list[str],
    companies: list[str] = None,
) -> list[dict]:
    companies = companies or ASHBY_COMPANIES
    results = []
    for slug in companies:
        try:
            results.extend(_scrape_ashby(slug, keywords))
        except Exception:
            continue
    return results


# ── 5. Fetch full job description from a single job URL ──────────────────────


def fetch_job_description(url: str) -> str:
    """
    Fetch and clean the full job description from a specific job URL.
    Reuses the same logic as ResumeForge's jd_parser but inline here
    to avoid circular imports.
    """
    NOISE_TAGS = {
        "script",
        "style",
        "noscript",
        "header",
        "footer",
        "nav",
        "aside",
        "form",
        "svg",
        "img",
        "button",
        "iframe",
    }
    NOISE_PATTERNS = [
        "nav",
        "menu",
        "header",
        "footer",
        "sidebar",
        "cookie",
        "banner",
        "advertisement",
        "social",
        "modal",
    ]

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception:
        return ""

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup.find_all(NOISE_TAGS):
        tag.decompose()
    for tag in soup.find_all(True):
        attrs = tag.attrs or {}
        for attr in ("class", "id"):
            val = attrs.get(attr, "")
            if isinstance(val, list):
                val = " ".join(val)
            if any(p in val.lower() for p in NOISE_PATTERNS):
                tag.decompose()
                break

    # Platform-specific selectors
    selectors = [
        {"id": "content"},
        {"class_": "content"},
        {"id": "jobDescriptionText"},
        {"class_": "posting-content"},
        {"class_": "job-description"},
        {"class_": "jobDescription"},
    ]
    text = ""
    for sel in selectors:
        el = soup.find(**sel)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 200:
                break

    if len(text) < 200:
        for tag_name in ("article", "main", "section", "div"):
            candidates = soup.find_all(tag_name)
            if candidates:
                best = max(candidates, key=lambda t: len(t.get_text()))
                text = best.get_text(separator="\n", strip=True)
            if len(text) > 200:
                break

    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = [ln.strip() for ln in text.splitlines()]
    text = "\n".join(ln for ln in lines if ln)
    return text[:12000]


# ── 6. Main search entry point ────────────────────────────────────────────────


def search_jobs(
    keywords: str,
    location: str = "",
    adzuna_app_id: str = "",
    adzuna_app_key: str = "",
    use_greenhouse: bool = True,
    use_lever: bool = True,
    use_ashby: bool = True,
    custom_greenhouse: list[str] = None,
    custom_lever: list[str] = None,
    custom_ashby: list[str] = None,
) -> list[dict]:
    """
    Run all enabled scrapers and return deduplicated, normalised job list.

    Args:
        keywords:     search string e.g. "ML engineer" or "AI engineer"
        location:     e.g. "San Francisco" or "remote"
        adzuna_*:     optional Adzuna API credentials
        use_*:        toggle each source on/off
        custom_*:     override default company lists per source

    Returns:
        List of normalised job dicts, deduplicated by URL.
    """
    kw_list = [k.strip() for k in re.split(r"[,;|]", keywords) if k.strip()]
    # Also split on spaces for multi-word phrases like "machine learning"
    expanded = []
    for kw in kw_list:
        expanded.append(kw)
        expanded.extend(kw.lower().split())
    kw_list = list(dict.fromkeys(expanded))  # deduplicate, preserve order

    all_jobs: list[dict] = []

    # Adzuna
    if adzuna_app_id and adzuna_app_key:
        all_jobs.extend(
            search_adzuna(keywords, location, 50, adzuna_app_id, adzuna_app_key)
        )

    # Greenhouse
    if use_greenhouse:
        all_jobs.extend(scrape_greenhouse_companies(kw_list, custom_greenhouse))

    # Lever
    if use_lever:
        all_jobs.extend(scrape_lever_companies(kw_list, custom_lever))

    # Ashby
    if use_ashby:
        all_jobs.extend(scrape_ashby_companies(kw_list, custom_ashby))

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique: list[dict] = []
    for job in all_jobs:
        url = job.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique.append(job)

    return unique
