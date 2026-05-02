"""
scraper.py
Job discovery from multiple sources:

  1. Adzuna API          — free, structured JSON, 50+ countries
  2. Greenhouse boards   — boards.greenhouse.io/{company}/jobs
  3. Lever boards        — jobs.lever.co/{company}
  4. Ashby boards        — jobs.ashbyhq.com/{company}

Company lists are NOT hardcoded. They come from:

  A. Simplify's live JSON repos (1000+ companies, updated daily by the community)
       - SimplifyJobs/New-Grad-Positions  (full-time roles)
       - SimplifyJobs/Summer2026-Internships (broader company coverage)
     Cached to disk for 24 hours so the app does NOT re-fetch on every run.

  B. A curated fallback list of 200+ AI/ML/tech companies built in.
     Used if GitHub is unreachable, and always merged in to ensure coverage
     of frontier AI companies that may not appear in the Simplify lists.

  C. User-supplied custom slugs entered in the UI.
"""

import re
import json
import hashlib
import requests
import threading
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup  # type: ignore[import-untyped]
from concurrent.futures import ThreadPoolExecutor, as_completed

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Disk cache path — persists across app restarts
CACHE_FILE = Path(__file__).parent / "data" / "company_cache.json"
CACHE_TTL_HOURS = 24

# ── Curated company lists ─────────────────────────────────────────────────────
# Always merged on top of Simplify data as a gap-filler.
# Covers every major AI/ML, cloud, infra, fintech, and high-growth tech company.
# Organised by ATS platform (Greenhouse / Lever / Ashby).

FALLBACK_GREENHOUSE = [
    # ── Frontier AI Labs ──────────────────────────────────────────────────────
    "anthropic",
    "openai",
    "cohere",
    "adept",
    "characterai",
    "inflectionai",
    "imbue",
    "alephalpha",
    "xai",
    "mosaicml",
    "mistral-ai",
    "ai21labs",
    "tii",
    "technion",
    # ── AI Agents & Coding Assistants ─────────────────────────────────────────
    "codeium",
    "tabnine",
    "sourcegraph",
    "replit",
    "githubnext",
    "sweep-ai",
    "factory-ai",
    "cosine-ai",
    # ── AI Infrastructure & Serving ───────────────────────────────────────────
    "scale-ai",
    "huggingface",
    "together-ai",
    "anyscale",
    "modular",
    "lightning-ai",
    "replicate",
    "baseten",
    "weights-biases",
    "determined-ai",
    "nomic",
    "trychroma",
    "activeloop",
    "zenml",
    "bentoml",
    "seldon",
    "truefoundry",
    # ── Vector Databases ──────────────────────────────────────────────────────
    "pinecone",
    "weaviate",
    "qdrant",
    "milvusio",
    "chroma",
    # ── MLOps, Experiment Tracking, Feature Stores ────────────────────────────
    "arize-ai",
    "whylabs",
    "fiddler-ai",
    "aporia",
    "truera",
    "superwise",
    "gantry",
    "arthur-ai",
    "censius",
    "tecton",
    "feast-dev",
    "hopsworks",
    # ── Data Engineering & Warehousing ────────────────────────────────────────
    "databricks",
    "snowflake",
    "dbt-labs",
    "fivetran",
    "airbyte",
    "starburst",
    "dremio",
    "imply",
    "clickhouse",
    "motherduck",
    "rockset",
    "materialize",
    "timeplus",
    "greatexpectations",
    "monte-carlo-data",
    "datafold",
    "anomalo",
    "soda-data",
    "lightup-data",
    # ── Data Labeling & Annotation ────────────────────────────────────────────
    "labelbox",
    "scale-ai",
    "snorkel-ai",
    "humanloop",
    "argilla-io",
    "diffgram",
    "encord",
    "dataloop",
    # ── Cloud & Infrastructure ────────────────────────────────────────────────
    "hashicorp",
    "pulumi",
    "teleport",
    "tailscale",
    "cloudflare",
    "fastly",
    "render",
    "railway",
    "fly-io",
    "coherence",
    "nitric",
    "shuttle",
    "porter-dev",
    # ── Observability & DevOps ────────────────────────────────────────────────
    "honeycomb-io",
    "lightstep",
    "incident-io",
    "firehydrant",
    "rootly",
    "grafana",
    "chronosphere",
    "last9",
    # ── Developer Tools & Platforms ───────────────────────────────────────────
    "figma",
    "notion",
    "linear",
    "vercel",
    "netlify",
    "retool",
    "airtable",
    "webflow",
    "coda",
    "zapier",
    "make",
    "n8n",
    "workato",
    "tray-io",
    "postman",
    "readme",
    "stoplight",
    "bump-sh",
    # ── Search & Discovery ────────────────────────────────────────────────────
    "algolia",
    "elastic",
    "typesense",
    "meilisearch",
    # ── Feature Flags & Experimentation ──────────────────────────────────────
    "launchdarkly",
    "statsig",
    "eppo",
    "split-io",
    "optimizely",
    "flagsmith",
    "growthbook",
    # ── Security ──────────────────────────────────────────────────────────────
    "snyk",
    "lacework",
    "orca-security",
    "wiz",
    "cyera",
    "deepfence",
    "semgrep",
    "aikido-security",
    "socket-dev",
    "nightfall",
    "skyflow",
    "evervault",
    # ── Fintech ───────────────────────────────────────────────────────────────
    "stripe",
    "plaid",
    "brex",
    "ramp",
    "mercury",
    "moderntreasury",
    "lithic",
    "column",
    "increase",
    "bond",
    "unit",
    "synctera",
    "treasury-prime",
    "alpaca",
    "polygon-io",
    "tradier",
    # ── HR, Payroll & Compliance ──────────────────────────────────────────────
    "lattice",
    "rippling",
    "deel",
    "gusto",
    "workos",
    "merge-api",
    "finch-api",
    "pave",
    "comprehensive-io",
    # ── Healthcare & BioTech ──────────────────────────────────────────────────
    "commure",
    "ro",
    "cerebral",
    "hims",
    "novu",
    "tempus",
    "freenome",
    "recursion",
    "insitro",
    "bighat-biosciences",
    "absci",
    "inceptive",
    "profluent",
    # ── Autonomous Vehicles & Robotics ────────────────────────────────────────
    "zoox",
    "waymo",
    "aurora",
    "motional",
    "gatik",
    "nuro",
    "kodiak-robotics",
    "argo-ai",
    "boston-dynamics",
    "figure-ai",
    # ── Climate & Energy Tech ─────────────────────────────────────────────────
    "climateai",
    "watershed",
    "patch",
    "south-pole",
    "arcadia",
    "swell-energy",
    "anza",
    "banyan-infrastructure",
    # ── E-commerce & Marketplace ──────────────────────────────────────────────
    "shopify",
    "faire",
    "flexport",
    "stord",
    "convictional",
    # ── Productivity & Collaboration ──────────────────────────────────────────
    "notion",
    "coda",
    "craft",
    "taskade",
    "fibery",
    "height-app",
    "plane-so",
    "shortcut",
    # ── Analytics & BI ───────────────────────────────────────────────────────
    "amplitude",
    "mixpanel",
    "heap",
    "fullstory",
    "logrocket",
    "posthog",
    "june-so",
    "koala",
    "clearbit",
    # ── Communications & AI Voice ─────────────────────────────────────────────
    "twilio",
    "sendgrid",
    "postmark",
    "courier",
    "assembly-ai",
    "deepgram",
    "rev-ai",
    "speechmatics",
    # ── EdTech ────────────────────────────────────────────────────────────────
    "duolingo",
    "quizlet",
    "khan-academy",
    "brilliant",
    "coursera",
    "outschool",
    "synthesis",
    # ── Legal Tech ────────────────────────────────────────────────────────────
    "harvey",
    "clio",
    "ironclad",
    "lexion",
    "spellbook",
    "luminance",
    "contractpodai",
]

FALLBACK_LEVER = [
    # ── Big Tech & Established ────────────────────────────────────────────────
    "netflix",
    "lyft",
    "reddit",
    "dropbox",
    "pinterest",
    "etsy",
    "wayfair",
    "robinhood",
    "coinbase",
    "twitch",
    "box",
    "zendesk",
    "surveymonkey",
    "hootsuite",
    # ── AI & ML ───────────────────────────────────────────────────────────────
    "clarifai",
    "roboflow",
    "landing-ai",
    "v7labs",
    "scale",
    "labelbox",
    "snorkel-ai",
    "comet-ml",
    "neptune-ai",
    "valohai",
    # ── Data & Analytics ──────────────────────────────────────────────────────
    "lightdash",
    "metabase",
    "mode-analytics",
    "preset",
    "sigma-computing",
    "omni-analytics",
    "cube-dev",
    "census-data",
    "hightouch",
    "polytomic",
    # ── Infrastructure & Cloud ────────────────────────────────────────────────
    "cockroachdb",
    "planetscale",
    "neon",
    "turso",
    "grafana",
    "datadog",
    "elastic",
    "confluent",
    "temporal",
    "inngest",
    "trigger-dev",
    # ── Developer Tools ───────────────────────────────────────────────────────
    "doppler",
    "infisical",
    "vault-by-hashicorp",
    "ngrok",
    "hookdeck",
    "svix",
    "mintlify",
    "gitbook",
    "archbee",
    # ── Security ──────────────────────────────────────────────────────────────
    "drata",
    "vanta",
    "secureframe",
    "tugboat-logic",
    "anecdotes",
    "hyperproof",
    # ── Fintech & Crypto ──────────────────────────────────────────────────────
    "affirm",
    "marqeta",
    "chime",
    "current",
    "kraken",
    "gemini",
    "bitgo",
    "chainalysis",
    "alchemy",
    "quicknode",
    "moralis",
    # ── Sales & Marketing Tech ────────────────────────────────────────────────
    "outreach",
    "salesloft",
    "gong-io",
    "chorus",
    "clari",
    "people-ai",
    "dooly",
    "grain",
    "apollo-io",
    "instantly",
    "smartlead",
    # ── HR Tech ───────────────────────────────────────────────────────────────
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "bamboohr",
    "15five",
    "leapsome",
    "culture-amp",
    # ── EdTech & Consumer ─────────────────────────────────────────────────────
    "miro",
    "loom",
    "pitch",
    "mmhmm",
    "read-ai",
    "otter-ai",
    "fireflies-ai",
    # ── Healthcare ────────────────────────────────────────────────────────────
    "health-gorilla",
    "redox",
    "zus-health",
    "canvas-medical",
    "elation-health",
    # ── Real Estate & PropTech ────────────────────────────────────────────────
    "opendoor",
    "offerpad",
    "knock",
    "orchard",
    "doorstead",
    "atlas",
    "lessen",
    # ── Supply Chain & Logistics ──────────────────────────────────────────────
    "project44",
    "fourkites",
    "visible-scm",
    "turvo",
    "loadsmart",
    "transfix",
]

FALLBACK_ASHBY = [
    # ── Frontier AI / Agents (Ashby-heavy) ───────────────────────────────────
    "mistral",
    "perplexity",
    "harvey",
    "cognition",
    "cursor",
    "magic",
    "factory",
    "cosine",
    "sweep",
    "devin-ai",
    "aide",
    "cline",
    "continue-dev",
    "aider-chat",
    "plandex",
    "mentat",
    # ── AI Coding & Dev Tools ─────────────────────────────────────────────────
    "codeium",
    "tabnine",
    "sourcegraph",
    "githubnext",
    "pieces-app",
    "bloop",
    "greptile",
    "codestory",
    "e2b",
    "daytona",
    "gitpod",
    "coder",
    # ── AI Applications & Vertical AI ─────────────────────────────────────────
    "luma-ai",
    "runway",
    "pika-labs",
    "stability-ai",
    "midjourney",
    "ideogram",
    "adobe-firefly",
    "elevenlabs",
    "playht",
    "resemble-ai",
    "cartesia",
    "suno",
    "udio",
    "soundraw",
    "photoroom",
    "clipdrop",
    "pixelcut",
    "jasper-ai",
    "writer-com",
    "copy-ai",
    "glean",
    "guru",
    "tettra",
    "notion-ai",
    # ── AI Infrastructure & Compute ───────────────────────────────────────────
    "modal-labs",
    "baseten",
    "fireworks-ai",
    "deepinfra",
    "groq",
    "cerebras",
    "sambanova",
    "d-matrix",
    "tenstorrent",
    "graphcore",
    "lambda-labs",
    "coreweave",
    "vast-ai",
    "together-ai",
    "lepton-ai",
    "mystic",
    # ── LLM Ops & Evaluation ──────────────────────────────────────────────────
    "langchain",
    "llamaindex",
    "brainlid",
    "langfuse",
    "helicone",
    "traceloop",
    "promptlayer",
    "pezzo-ai",
    "agentops",
    "braintrust-data",
    "log10-io",
    "patronus-ai",
    # ── Robotics & Embodied AI ────────────────────────────────────────────────
    "physical-intelligence",
    "covariant",
    "1x-technologies",
    "apptronik",
    "agility-robotics",
    "figure-ai",
    "arc-motors",
    "marble",
    "machina-labs",
    "viam-robotics",
    "formant",
    "formant-io",
    # ── AI for Science & Bio ──────────────────────────────────────────────────
    "inceptive",
    "profluent",
    "openfold",
    "isomorphic-labs",
    "exscientia",
    "menten-ai",
    "enveda",
    "peptone",
    "charm-therapeutics",
    # ── Search & Knowledge ────────────────────────────────────────────────────
    "perplexity",
    "you-com",
    "metaphor-systems",
    "exa-ai",
    "kagi",
    "phind",
    # ── Developer Experience ──────────────────────────────────────────────────
    "linear",
    "raycast",
    "superhuman",
    "clerk",
    "supabase",
    "neon",
    "resend",
    "loops",
    "trigger-dev",
    "inngest",
    "zuplo",
    "unkey",
    "stytch",
    "hanko",
    # ── Infrastructure for AI Apps ────────────────────────────────────────────
    "langsmith",
    "weaviate",
    "qdrant",
    "milvus",
    "turbopuffer",
    "lancedb",
    "vespa-engine",
    # ── B2B SaaS & Vertical AI ────────────────────────────────────────────────
    "ashby",
    "gem",
    "dover",
    "teamable",
    "karat",
    "interviewing-io",
    "pramp",
    "arc-dev",
    "lemon-io",
    "toptal",
    # ── Fintech & Crypto ──────────────────────────────────────────────────────
    "moonpay",
    "privy",
    "dynamic-xyz",
    "particle-network",
    "turnkey",
    # ── Consumer & Social ─────────────────────────────────────────────────────
    "bereal",
    "artifact-news",
    "read-cv",
    "cosmos-fm",
    "farcaster",
    "lens-protocol",
]

# ── Simplify live JSON sources ────────────────────────────────────────────────
# Both repos are maintained by the community and updated daily.
# New-Grad has full-time roles. Summer2026 has broader company coverage.

SIMPLIFY_URLS = [
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
]

_cache_lock = threading.Lock()


def _load_disk_cache() -> dict | None:
    """Load company list from disk cache if it exists and is fresh."""
    try:
        if not CACHE_FILE.exists():
            return None
        data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(data.get("fetched_at", "2000-01-01"))
        if datetime.utcnow() - fetched_at > timedelta(hours=CACHE_TTL_HOURS):
            return None  # stale
        return data.get("companies")
    except Exception:
        return None


def _save_disk_cache(companies: dict):
    """Persist company list to disk with a timestamp."""
    try:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(
            json.dumps(
                {
                    "fetched_at": datetime.utcnow().isoformat(),
                    "companies": companies,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception:
        pass


def _fetch_simplify_companies() -> dict:
    """
    Fetch Greenhouse/Lever/Ashby slugs from Simplify's live JSON.
    Returns {"greenhouse": [...], "lever": [...], "ashby": [...]}

    Cache strategy:
      1. Check disk cache (fresh for 24h, survives app restarts)
      2. If stale/missing, fetch from GitHub
      3. Save result to disk for next run
    """
    with _cache_lock:
        # Try disk cache first
        cached = _load_disk_cache()
        if cached:
            return cached

        result: dict = {"greenhouse": [], "lever": [], "ashby": []}

        for url in SIMPLIFY_URLS:
            try:
                resp = requests.get(url, timeout=25, headers=HEADERS)
                if resp.status_code != 200:
                    continue
                listings = resp.json()
                if not isinstance(listings, list):
                    continue

                for item in listings:
                    link = str(item.get("url", "") or item.get("link", "") or "")
                    if not link:
                        continue

                    gh = re.search(r"boards\.greenhouse\.io/([^/?#\s]+)", link)
                    if gh:
                        slug = gh.group(1).lower().split("?")[0]
                        if slug and slug not in result["greenhouse"]:
                            result["greenhouse"].append(slug)
                        continue

                    lv = re.search(r"jobs\.lever\.co/([^/?#\s]+)", link)
                    if lv:
                        slug = lv.group(1).lower().split("?")[0]
                        if slug and slug not in result["lever"]:
                            result["lever"].append(slug)
                        continue

                    ab = re.search(r"jobs\.ashbyhq\.com/([^/?#\s]+)", link)
                    if ab:
                        slug = ab.group(1).lower().split("?")[0]
                        if slug and slug not in result["ashby"]:
                            result["ashby"].append(slug)
                        continue

            except Exception:
                continue

        # Save to disk so next app start doesn't re-fetch for 24h
        if any(result.values()):
            _save_disk_cache(result)

        return result


def get_company_lists(
    custom_greenhouse: "list | None" = None,
    custom_lever: "list | None" = None,
    custom_ashby: "list | None" = None,
) -> dict:
    """
    Build final company lists by merging:
      1. Simplify live JSON (1000+ companies, disk-cached 24h)
      2. Curated fallback (200+ AI/ML companies — always present)
      3. User-supplied custom slugs from the UI
    """
    simplify = _fetch_simplify_companies()

    def merge(simplify_list: list, fallback: list, custom: list | None) -> list:
        combined = list(simplify_list)
        for slug in fallback:
            if slug not in combined:
                combined.append(slug)
        for slug in custom or []:
            slug = slug.strip().lower()
            if slug and slug not in combined:
                combined.append(slug)
        return combined

    return {
        "greenhouse": merge(
            simplify.get("greenhouse", []), FALLBACK_GREENHOUSE, custom_greenhouse
        ),
        "lever": merge(simplify.get("lever", []), FALLBACK_LEVER, custom_lever),
        "ashby": merge(simplify.get("ashby", []), FALLBACK_ASHBY, custom_ashby),
    }


# ── Job ID helper ─────────────────────────────────────────────────────────────


def _job_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:16]


# ── Normalised job schema ─────────────────────────────────────────────────────


def _make_job(
    title: str,
    company: str,
    location: str,
    url: str,
    description: str = "",
    job_type: str = "",
    source: str = "",
    required_skills: list | None = None,
    keywords: list | None = None,
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
    location: str = "",
    results_per_page: int = 50,
    app_id: str = "",
    app_key: str = "",
) -> list:
    if not app_id or not app_key:
        return []

    country = "us"
    loc = location.lower()
    if any(x in loc for x in ["uk", "london", "england"]):
        country = "gb"
    elif any(x in loc for x in ["canada", "toronto"]):
        country = "ca"
    elif any(x in loc for x in ["australia", "sydney"]):
        country = "au"

    base = (
        f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
        f"?app_id={app_id}&app_key={app_key}"
        f"&results_per_page={results_per_page}"
        f"&what={quote(keywords)}"
        f"&content-type=application/json&sort_by=relevance"
    )
    if location and country == "us":
        base += f"&where={quote(location)}"

    try:
        resp = requests.get(base, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    return [
        _make_job(
            title=r.get("title", ""),
            company=(r.get("company") or {}).get("display_name", ""),
            location=(r.get("location") or {}).get("display_name", ""),
            url=r.get("redirect_url", ""),
            description=r.get("description", ""),
            job_type=r.get("contract_time", ""),
            source="adzuna",
        )
        for r in data.get("results", [])
        if r.get("redirect_url")
    ]


# ── 2. Greenhouse scraper ─────────────────────────────────────────────────────


def _scrape_greenhouse(company_slug: str, keywords: list) -> list:
    url = f"https://boards.greenhouse.io/{company_slug}/jobs"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]
    company_name = company_slug.replace("-", " ").replace("_", " ").title()

    for opening in soup.find_all("div", class_="opening"):
        a_tag = opening.find("a")
        if not a_tag:
            continue
        title = a_tag.get_text(strip=True)
        href = str(a_tag.get("href") or "")
        job_url = (
            href if href.startswith("http") else f"https://boards.greenhouse.io{href}"
        )

        loc_tag = opening.find("span", attrs={"class": "location"})
        location = loc_tag.get_text(strip=True) if loc_tag else ""

        if kw_lower and not any(kw in title.lower() for kw in kw_lower):
            continue
        if not job_url or job_url == "https://boards.greenhouse.io":
            continue

        jobs.append(
            _make_job(
                title=title,
                company=company_name,
                location=location,
                url=job_url,
                source="greenhouse",
            )
        )
    return jobs


# ── 3. Lever scraper ─────────────────────────────────────────────────────────


def _scrape_lever(company_slug: str, keywords: list) -> list:
    url = f"https://jobs.lever.co/{company_slug}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]
    company_name = company_slug.replace("-", " ").replace("_", " ").title()

    for posting in soup.find_all("div", class_="posting"):
        h5 = posting.find("h5")
        if not h5:
            continue
        title = h5.get_text(strip=True)

        a_tag = posting.find("a", class_="posting-btn-submit") or posting.find("a")
        if not a_tag:
            continue
        href = str(a_tag.get("href") or "")
        job_url = href if href.startswith("http") else f"https://jobs.lever.co{href}"

        loc_tag = posting.find("span", class_="location")
        location = loc_tag.get_text(strip=True) if loc_tag else ""

        if kw_lower and not any(kw in title.lower() for kw in kw_lower):
            continue
        if not job_url:
            continue

        jobs.append(
            _make_job(
                title=title,
                company=company_name,
                location=location,
                url=job_url,
                source="lever",
            )
        )
    return jobs


# ── 4. Ashby scraper ─────────────────────────────────────────────────────────


def _scrape_ashby(company_slug: str, keywords: list) -> list:
    api_url = f"https://api.ashbyhq.com/posting-api/job-board/{company_slug}"
    try:
        resp = requests.get(api_url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception:
        return []

    jobs = []
    kw_lower = [k.lower() for k in keywords]
    company_name = company_slug.replace("-", " ").replace("_", " ").title()

    for posting in data.get("jobPostings", []):
        title = str(posting.get("title") or "")
        posting_id = str(posting.get("id") or "")
        job_url = (
            str(posting.get("jobUrl") or "")
            or f"https://jobs.ashbyhq.com/{company_slug}/{posting_id}"
        )
        location = str(
            posting.get("locationName") or ("Remote" if posting.get("isRemote") else "")
        )
        desc_html = str(posting.get("descriptionHtml") or "")
        desc = (
            BeautifulSoup(desc_html, "html.parser").get_text(separator="\n")
            if desc_html
            else ""
        )

        if kw_lower and not any(kw in title.lower() for kw in kw_lower):
            continue
        if not job_url:
            continue

        jobs.append(
            _make_job(
                title=title,
                company=company_name,
                location=location,
                url=job_url,
                description=desc[:3000],
                source="ashby",
            )
        )
    return jobs


# ── 5. Parallel multi-company scraper ────────────────────────────────────────


def _scrape_parallel(
    slugs: list, keywords: list, scrape_fn, max_workers: int = 20
) -> list:
    """Scrape a list of company slugs in parallel."""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(scrape_fn, slug, keywords): slug for slug in slugs}
        for future in as_completed(futures):
            try:
                results.extend(future.result())
            except Exception:
                pass
    return results


# ── 6. Fetch full job description ─────────────────────────────────────────────


def fetch_job_description(url: str) -> str:
    """Fetch and clean the full job description text from a job posting URL."""
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
    NOISE_CLASSES = [
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
        classes = " ".join(tag.get("class") or [])
        tag_id = tag.get("id") or ""
        combined = f"{classes} {tag_id}".lower()
        if any(p in combined for p in NOISE_CLASSES):
            tag.decompose()

    # Try platform-specific content containers first
    text = ""
    for sel in [
        {"id": "content"},
        {"id": "jobDescriptionText"},
        {"class_": "posting-content"},
        {"class_": "job-description"},
        {"class_": "jobDescription"},
        {"class_": "content"},
    ]:
        el = soup.find(True, **sel)
        if el:
            candidate = el.get_text(separator="\n", strip=True)
            if len(candidate) > 200:
                text = candidate
                break

    if len(text) < 200:
        for tag_name in ("article", "main", "section"):
            el = soup.find(tag_name)
            if el:
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 200:
                    break

    if len(text) < 200:
        all_divs = soup.find_all("div")
        if all_divs:
            best = max(all_divs, key=lambda t: len(t.get_text()))
            text = best.get_text(separator="\n", strip=True)

    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(ln.strip() for ln in text.splitlines() if ln.strip())[:12000]


# ── 7. Main search entry point ────────────────────────────────────────────────


def search_jobs(
    keywords: str,
    location: str = "",
    adzuna_app_id: str = "",
    adzuna_app_key: str = "",
    use_greenhouse: bool = True,
    use_lever: bool = True,
    use_ashby: bool = True,
    custom_greenhouse: list | None = None,
    custom_lever: list | None = None,
    custom_ashby: list | None = None,
) -> list:
    """
    Run all enabled scrapers and return deduplicated, normalised job list.

    Company lists are fetched from Simplify (disk-cached 24h) + curated fallback.
    Scraping runs in parallel — typically 500-1000 companies in ~20-30 seconds.
    """
    # Expand keywords: "ML Engineer" → ["ML Engineer", "ml", "engineer"]
    kw_list = [k.strip() for k in re.split(r"[,;|]", keywords) if k.strip()]
    expanded: list = []
    for kw in kw_list:
        expanded.append(kw)
        expanded.extend(kw.lower().split())
    kw_list = list(dict.fromkeys(expanded))

    companies = get_company_lists(custom_greenhouse, custom_lever, custom_ashby)

    all_jobs: list = []

    if adzuna_app_id and adzuna_app_key:
        all_jobs.extend(
            search_adzuna(keywords, location, 50, adzuna_app_id, adzuna_app_key)
        )

    if use_greenhouse and companies["greenhouse"]:
        all_jobs.extend(
            _scrape_parallel(companies["greenhouse"], kw_list, _scrape_greenhouse)
        )

    if use_lever and companies["lever"]:
        all_jobs.extend(_scrape_parallel(companies["lever"], kw_list, _scrape_lever))

    if use_ashby and companies["ashby"]:
        all_jobs.extend(_scrape_parallel(companies["ashby"], kw_list, _scrape_ashby))

    # Deduplicate by URL
    seen: set = set()
    unique: list = []
    for job in all_jobs:
        url = job.get("url", "")
        if url and url not in seen:
            seen.add(url)
            unique.append(job)

    return unique
