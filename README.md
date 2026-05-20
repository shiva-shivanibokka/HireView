# HireView

HireView is a job search aggregator that searches hundreds of company career pages simultaneously so you never have to visit each one manually. You type a job title or company name, and HireView scrapes the ATS platforms those companies use — Greenhouse, Lever, and Ashby — returning every matching open role with a direct link to apply.

It is not a job board. It does not host job listings. Every result points directly to the company's own careers page.

---

## The problem it solves

Most job seekers either search on LinkedIn/Indeed (which miss many direct-apply roles and are full of noise) or visit company career pages one by one. Neither scales. HireView solves this by going directly to the ATS platforms companies use to manage hiring, scanning all of them at once, and returning results in a single unified view.

---

## How it works — end to end

### 1. Company list

When you first run a search, HireView fetches a live JSON dataset from [Simplify's open repositories](https://github.com/SimplifyJobs) on GitHub. These lists are maintained by the community and contain 1000+ companies along with their ATS platform (Greenhouse, Lever, or Ashby) and the URL to their job board. The app extracts the company slug from each URL (e.g. `anthropic` from `boards.greenhouse.io/anthropic`), merges this with a curated fallback list of 200+ AI/ML/tech companies built into the code, and caches the result to disk for 24 hours. On subsequent runs within that window, the disk cache is used instead of fetching from GitHub again.

### 2. Parallel scraping

Once the company list is ready, HireView fans out across all three ATS platforms simultaneously using a thread pool of 50 workers. Each worker is given a company slug and a scrape function. The three scrape functions work differently:

**Greenhouse** calls `boards-api.greenhouse.io/v1/boards/{slug}/jobs`. This is a public JSON API that returns structured job data including `first_published` (the exact datetime the job was posted). It falls back to HTML scraping of `boards.greenhouse.io/{slug}` if the API returns a non-200.

**Lever** calls `api.lever.co/v0/postings/{slug}?mode=json`. This is Lever's public JSON API which returns `createdAt` (a Unix millisecond timestamp), `workplaceType` (onsite/remote/hybrid), and `categories.commitment` (Full-time, Part-time, etc.). It falls back to HTML scraping of `jobs.lever.co/{slug}`.

**Ashby** calls `api.ashbyhq.com/posting-api/job-board/{slug}`. This returns `publishedAt`, `isRemote`, `employmentType`, and optionally inline `descriptionHtml`.

Each scraper filters results by your search keywords before returning them, so only relevant jobs travel through the pipeline. Each source has a 30-second wall-clock deadline — if a source doesn't finish within 30 seconds, any remaining requests are cancelled and whatever was collected so far is used. This ensures the total search time never exceeds 30–40 seconds regardless of how many companies are in the list.

### 3. Company-specific search

If you select specific companies in the search bar rather than just typing a title, the full fan-out is completely skipped. Instead, only those companies' slugs are sent to the scrapers. A search across 3 specific companies completes in 2–5 seconds.

### 4. Deduplication and filtering

After scraping, results are deduplicated by URL. Then the location filter is applied — since none of the ATS platforms support location as a query parameter, this is done as a post-scrape substring match against the `location` field of each job. Location keywords are mapped from the UI values (e.g. "United States" → "new york", "san francisco", "seattle", "usa", etc.).

### 5. Scoring and persistence

Each job is scored for keyword relevance: the fraction of your search keywords that appear in the job title, company name, required skills, and the first 2000 characters of the description. This score (0.0–1.0) is stored alongside the job and used by the "Most relevant" sort option.

All results are saved to a local SQLite database. On re-scrape, existing rows are updated but their `status` (new/saved/dismissed) and `scraped_at` timestamp are preserved.

### 6. Frontend rendering

The frontend fetches results from the backend via Next.js route handlers (not browser fetch calls, to avoid CORS and timeout issues). Results are displayed as a card grid sorted newest first by default. All filters — experience level, job type, workplace, date posted, sort order — are applied client-side to the already-fetched results, so toggling a filter is instant with no network request.

---

## Features in detail

### Job title autocomplete (multi-select)

The search input uses a tag-based autocomplete. Start typing a job title and a dropdown appears with matching suggestions. Suggestions come from two sources merged together: a curated list of 60+ common titles built into the backend, and any job titles already stored in your local SQLite database from past searches. The more you use the app, the smarter the suggestions get. You can add as many titles as you want — each becomes a tag. Searching with multiple titles uses OR logic: any job matching any of the selected titles is returned.

You are not restricted to the suggestions. Type anything and press Enter to add it as a freeform title.

### Company autocomplete (multi-select, optional)

A second input next to the title input lets you search by company name. Start typing and a dropdown shows matching companies from the Simplify dataset with their ATS platform shown as a colour-coded badge (green=Greenhouse, blue=Lever, purple=Ashby). Add multiple companies as tags.

When companies are selected:
- Only those specific companies are scraped (no full fan-out)
- If no title is entered, all open roles at those companies are returned
- If a title is also entered, only roles matching that title at those companies are returned

### Filters

All filters are in the Filters dropdown. Selecting or clearing any filter takes effect immediately without re-running the search.

**Location** filters by the `location` field of each job using keyword matching. Options are USA, Europe, India, and Remote. Jobs with a blank location field are always included since we cannot confirm they should be excluded.

**Experience level** scans both the job title and description text. Title keywords are checked first (higher confidence), then description text is checked for explicit year-range patterns like "2+ years", "5–8 years", "recent graduate", etc. The levels are:
- Internship — title: "intern", "co-op", "placement"; description: "internship program"
- New Grad / Entry (0–2 yrs) — title: "junior", "associate", "new grad"; description: "0-2 years", "no experience required"
- Mid-Level (2–5 yrs) — title: "mid-level", "intermediate"; description: "2+ years" through "4+ years"
- Senior (5–8 yrs) — title: "senior", "sr."; description: "5+ years" through "7+ years"
- Staff / Lead (8+ yrs) — title: "staff", "principal", "lead", "director"; description: "8+ years", "10+ years"

Jobs with no matching signals appear under "Any level" only — they are not hidden, just unclassified.

**Job type** checks the `job_type` field populated by the scraper (from Lever's `categories.commitment` and Ashby's `employmentType`). For jobs with no structured data, it falls back to scanning the job title for keywords like "intern", "contract", "part-time".

**Workplace** checks the `workplace` field populated by the scraper (from Lever's `workplaceType`, Ashby's `isRemote`, and Greenhouse's location metadata). Falls back to scanning the `location` string for "remote" or "hybrid".

**Date posted** filters using the actual posting date from the ATS — `first_published` from Greenhouse, `createdAt` from Lever, `publishedAt` from Ashby. For jobs without a posting date (e.g. some Ashby entries), `scraped_at` is used as a fallback.

**Sort** — "Newest first" sorts by posting date (normalised to a consistent ISO format so Ashby's date-only strings sort correctly against Greenhouse's full datetime strings). "Most relevant" sorts by the keyword match score.

### Job cards

Each card shows:
- Job title and company name
- Location
- Workplace badge (Remote / Hybrid / On-site) and job type badge (Full-time / Contract / Internship etc.), colour-coded by type
- Time since posting ("Posted 3d ago", "Posted 2w ago")
- ATS source badge (colour-coded: green=Greenhouse, blue=Lever, purple=Ashby, yellow=Adzuna)
- An X button to dismiss the job on hover

### Job detail modal

Clicking a card opens a modal with two tabs:

**Job Description tab** — the full job description is automatically fetched from the company's posting page when you open the modal. The fetch happens in the background; a spinner shows while it loads. The extraction uses a priority list of CSS selectors specific to each platform (Greenhouse uses `#content`, Lever uses `div.content`, Ashby has inline description in the API response). If the primary selectors fail, it falls back to finding the largest `<div>` after removing noise elements (nav, footer, scripts, etc.). A Refresh button re-fetches the description on demand.

At the top of the modal: job title, company, location, workplace and job type badges, posting date, skills tags, an Apply Now button (links directly to the original posting), a Save button, and a Not Interested button.

**Find Contacts tab** — two LinkedIn search buttons and a cold email template:

*Search recruiters at [Company]* — opens a LinkedIn people search pre-filtered to people with "recruiter" in their title at that company. Results give you names, titles, and LinkedIn profiles you can connect with or message directly.

*Search hiring managers* — opens a LinkedIn people search for people with the job title you are looking at, at that company.

*Cold email template* — a pre-written email with the company name and job title already filled in. Hit the Copy button and paste it into Gmail once you find the recruiter's email on LinkedIn.

### Save and dismiss

Saved and dismissed states are stored in SQLite and persist between sessions. Dismissed jobs are hidden from the list. Saved jobs show a bookmark badge on their card.

---

## API reference

The backend runs on FastAPI and exposes these endpoints:

### `POST /api/search`

Scrapes all enabled sources and returns results.

Form fields:
| Field | Type | Default | Description |
|---|---|---|---|
| `keywords` | string | `""` | Comma-separated job title keywords |
| `location` | string | `""` | Location string (e.g. "United States") |
| `companies` | string | `""` | JSON array of `{name, platform, slug}` objects for targeted company search |
| `use_greenhouse` | string | `"true"` | Whether to scrape Greenhouse |
| `use_lever` | string | `"true"` | Whether to scrape Lever |
| `use_ashby` | string | `"true"` | Whether to scrape Ashby |
| `adzuna_app_id` | string | `""` | Adzuna App ID (optional) |
| `adzuna_app_key` | string | `""` | Adzuna App Key (optional) |

Response: `{ jobs: Job[], total: number, message?: string }`

### `GET /api/suggestions?q=&limit=8`

Returns job title suggestions matching `q`. Merges the curated title list with titles from past searches in the local DB. Used by the autocomplete dropdown.

### `GET /api/companies?q=&limit=10`

Returns company name suggestions matching `q`. Each result includes `name`, `platform`, and `slug`. Used by the company autocomplete dropdown.

### `GET /api/jobs?status=&sort=newest&limit=0`

Returns saved jobs from the local DB. `status` filters by new/saved/dismissed. `sort` is `newest` or `relevance`. `limit=0` means no limit.

### `GET /api/jobs/{id}`

Returns a single job by its MD5-hashed URL ID.

### `POST /api/jobs/{id}/fetch-description`

Fetches the full job description text from the job's URL and saves it to the DB. Returns `{ description: string }`.

### `PATCH /api/jobs/{id}/status`

Updates a job's status. Form field `status` must be one of `new`, `saved`, `dismissed`.

### `GET /api/health`

Returns `{ status: "ok", service: "HireView API" }`.

---

## Data model

Each job in the database has these fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | MD5 hash of the job URL (16 chars) |
| `title` | string | Job title as returned by the ATS |
| `company` | string | Company display name |
| `location` | string | Location string from the ATS |
| `job_type` | string | `full-time`, `part-time`, `contract`, `internship`, or empty |
| `workplace` | string | `remote`, `hybrid`, `onsite`, or empty |
| `source` | string | `greenhouse`, `lever`, `ashby`, or `adzuna` |
| `url` | string | Direct URL to the job posting |
| `description` | string | Full job description text (fetched on demand) |
| `required_skills` | string[] | Skills parsed from the description |
| `keywords` | string[] | Search keywords used when this job was found |
| `match_score` | float | 0.0–1.0, fraction of search keywords found in the job |
| `scraped_at` | string | ISO 8601 UTC timestamp of when this job was first seen |
| `posted_at` | string | ISO 8601 date/datetime from the ATS (blank for Adzuna) |
| `status` | string | `new`, `saved`, or `dismissed` |

---

## Setup

You need Python 3.10+ and Node.js 18+.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

The backend starts on `http://localhost:8000`. On first run it will fetch the Simplify company list from GitHub (takes a few seconds) and cache it to `backend/data/company_cache.json`.

### Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:3000`. Open that in your browser.

### Environment variables

Create `backend/.env` (copy from `backend/.env.example`):

```
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

Adzuna is the only credential this app needs, and it is optional. Greenhouse, Lever, and Ashby are all scraped directly with no API key. If you leave the Adzuna fields blank, those sources are simply not included in results.

To get a free Adzuna key (250 requests/month): [developer.adzuna.com](https://developer.adzuna.com). You can also paste the keys into the Filters panel in the UI without touching `.env`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Inline CSS with CSS custom properties (no Tailwind, no CSS modules) |
| Backend framework | FastAPI, Python 3.10+ |
| ASGI server | Uvicorn |
| HTTP client | Requests |
| HTML parsing | BeautifulSoup 4 |
| Database | SQLite via Python's built-in `sqlite3` |
| Concurrency | `concurrent.futures.ThreadPoolExecutor` (50 workers) |
| Job sources | Greenhouse JSON API, Lever JSON API, Ashby JSON API, Adzuna REST API |
| Company data | Simplify live JSON (1000+ companies, 24h disk cache) |
| Proxy layer | Next.js App Router API route handlers (prevents browser CORS and timeout issues) |

---

## Project structure

```
HireView/
├── backend/
│   ├── api.py              FastAPI app — all HTTP endpoints
│   ├── scraper.py          Multi-source scraper, company list management,
│   │                       parallel fan-out, JD extraction, location filter
│   ├── job_store.py        SQLite read/write with context-managed connections
│   ├── matcher.py          (legacy, no longer used)
│   ├── requirements.txt
│   ├── .env                Adzuna credentials (not committed)
│   ├── .env.example        Template for .env
│   └── data/
│       ├── jobs.db              SQLite database
│       └── company_cache.json   Simplify company list + name map (24h cache)
└── frontend/
    ├── app/
    │   ├── api/
    │   │   ├── search/route.ts                      Proxies POST /api/search (115s timeout)
    │   │   ├── suggestions/route.ts                 Proxies GET /api/suggestions
    │   │   ├── companies/route.ts                   Proxies GET /api/companies
    │   │   └── jobs/[id]/
    │   │       ├── fetch-description/route.ts       Proxies POST /api/jobs/:id/fetch-description
    │   │       └── status/route.ts                  Proxies PATCH /api/jobs/:id/status
    │   ├── globals.css          CSS custom properties (colours, animations)
    │   ├── layout.tsx           Root layout and metadata
    │   └── page.tsx             Renders the HireView component
    ├── components/
    │   ├── AutoApplyApp.tsx     Root component — holds all state, filter logic, sort logic
    │   ├── SearchBar.tsx        Title tag input, company tag input, filter dropdown panel
    │   ├── JobGrid.tsx          Responsive card grid, job cards, type badges
    │   └── JobModal.tsx         Job detail modal, JD auto-fetch, Apply button, Find Contacts tab
    └── lib/
        ├── api.ts               All fetch calls to the backend (searchJobs, fetchSuggestions,
        │                        fetchCompanySuggestions, fetchJobDescription, updateJobStatus)
        └── types.ts             TypeScript interfaces (Job, CompanySuggestion)
```

---

## Known limitations

**No real-time job alerts** — HireView only finds jobs when you run a search. There is no background polling or email notification system.

**Ashby posting dates** — the Ashby public API exposes `publishedAt` on some endpoints but not all. Jobs from Ashby may occasionally show no posting date.

**Companies not in the database** — if a company uses Greenhouse, Lever, or Ashby but doesn't appear in the Simplify dataset or the curated fallback list, it won't be found in a general title search. You can still find it by typing the company name in the company input — if it returns no results, the company simply isn't in the known slug list.

**JD extraction** — some companies load their job descriptions via JavaScript after page load. Because HireView uses `requests` (not a headless browser), these pages will return an empty or minimal description. The Refresh button will re-attempt the fetch but the result will be the same. In those cases, click Apply Now to view the full posting directly.

**LinkedIn contact search** — the Find Contacts tab generates pre-built LinkedIn search URLs. It does not automatically retrieve names or emails. You still need to manually identify the right person on LinkedIn and find their contact information.

**Greenhouse resume upload errors** — this is a Greenhouse-side issue unrelated to HireView. Try Chrome in incognito mode, or convert your PDF to a fresh copy via Chrome's print-to-PDF function to remove any security flags.

---

## Future work

### Email alerts and background job tracking

Right now you have to manually open HireView and run a search to see new jobs. A natural next step would be a background scheduler (e.g. APScheduler or a cron job) that re-runs your saved searches at a set interval — say every morning — and sends you an email digest of new roles that appeared since your last search. This would turn HireView from a manual tool into a passive job monitor.

### Recruiter contact discovery via API

The current Find Contacts tab generates LinkedIn search URLs that the user has to navigate manually. A more powerful version would integrate with a contact enrichment API — Hunter.io, Apollo.io, or Snov.io all have free tiers — to automatically retrieve verified email addresses for recruiters and HR people at a company given its domain name. This would make cold outreach one step instead of three.

### Headless browser for JS-rendered job descriptions

Some companies render their job descriptions entirely via JavaScript after the page loads. HireView uses `requests` which only fetches the initial HTML, so those descriptions come back empty. Integrating Playwright or Puppeteer as a fallback (triggered only when the `requests` fetch yields no useful text) would fix this. The tradeoff is speed — headless browsers are 10–20x slower than raw HTTP requests — so it would only kick in for individual JD fetches, not during the bulk scrape.

### Salary data

None of the three ATS platforms expose salary in their public listing APIs. However, some companies include salary ranges in the job description text. An NLP extraction step — either a simple regex for patterns like "$120,000–$160,000" or "£60k–£80k", or a small language model — could parse salary from the description and display it on the card. This would also enable a salary filter.

### Application tracking

HireView currently has three statuses: new, saved, dismissed. A fuller application tracker would add statuses like "Applied", "Phone screen", "Interview", "Offer", "Rejected" with timestamps, and a Kanban-style view to move jobs through the pipeline. Notes and follow-up reminders per job would make it a complete job search CRM.

### User accounts and cloud sync

Currently everything is stored in a local SQLite database on the machine running the backend. Adding user authentication (OAuth with Google or GitHub) and a cloud database (PostgreSQL on Supabase or Railway) would allow the app to be deployed as a web service and accessed from any device without running a local server.

### More ATS sources

Greenhouse, Lever, and Ashby cover a large portion of tech companies but there are other ATS platforms in wide use — Workday, iCIMS, SmartRecruiters, BambooHR, and Rippling among others. Each has a different scraping approach (many require login or use highly obfuscated JavaScript). Adding even partial coverage of Workday (which is used by most large enterprises) would significantly expand the company coverage outside of tech.

### Smarter relevance ranking

The current match score is a simple keyword overlap fraction. A more meaningful ranking would use a sentence embedding model (like `all-MiniLM-L6-v2` from sentence-transformers) to compute semantic similarity between the job description and a user-provided profile or a few sentences describing what they are looking for. This was deliberately removed from the current version to keep the app simple, but the infrastructure for it exists in the original `matcher.py`.

### Mobile app

The current frontend is a web app. A React Native or Expo version of the same interface would let users browse and save jobs on their phone, which is where a lot of job searching actually happens. The backend API is already structured to support this — no changes to the backend would be needed.
