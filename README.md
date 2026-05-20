# HireView

HireView searches hundreds of company job boards at once so you don't have to open each one manually. You type a job title, pick a location, and it returns matching roles from Greenhouse, Lever, and Ashby — three platforms that thousands of companies use to post jobs. Every result has a direct link to apply on the company's own site.

## What it does

You run one search and HireView checks hundreds of companies simultaneously. It pulls jobs from:

- **Greenhouse** — used by Anthropic, Figma, Notion, and thousands of others
- **Lever** — used by Netflix, Scale AI, Zoox, and many more
- **Ashby** — popular with AI startups and fast-growing tech companies
- **Adzuna** (optional) — a general job board, good for non-tech roles

Results come back with the job title, company, location, how long ago it was posted, and whether it's remote, hybrid, or on-site. Click any card to see the full job description and an Apply button that takes you straight to the real posting.

## Filters

All filters apply instantly to the results already on screen — no need to search again.

- **Location** — USA, Europe, India, or Remote
- **Experience level** — Internship, New Grad (0–2 yrs), Mid-Level (2–5 yrs), Senior (5–8 yrs), Staff / Lead (8+ yrs)
- **Job type** — Full-time, Part-time, Contract, Internship, Remote, Hybrid, On-site
- **Date posted** — Last 7 days, Last 2 weeks, Last 30 days
- **Sort** — Newest first (by actual posting date) or Most relevant (by keyword match)

## How to run it

You need Python 3.10+ and Node.js 18+.

Start the backend:
```
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Start the frontend in a second terminal:
```
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Adzuna (optional)

Adzuna is a general job board that covers industries beyond tech. It's free — you get 250 requests per month. Sign up at [developer.adzuna.com](https://developer.adzuna.com), then either paste your App ID and App Key into the Filters panel in the UI, or add them to `backend/.env`:

```
ADZUNA_APP_ID=your_id
ADZUNA_APP_KEY=your_key
```

## Tech stack

| | |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | FastAPI, Python 3.10+ |
| Job sources | Greenhouse JSON API, Lever JSON API, Ashby JSON API, Adzuna REST API |
| Database | SQLite |
| Scraping | Requests, BeautifulSoup |

## Project structure

```
HireView/
├── backend/
│   ├── api.py           FastAPI endpoints
│   ├── scraper.py       Fetches jobs from all sources in parallel
│   ├── job_store.py     SQLite read/write
│   ├── requirements.txt
│   └── data/
│       └── jobs.db
└── frontend/
    ├── app/
    │   ├── api/         Next.js route handlers (proxy to backend)
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── AutoApplyApp.tsx   Root layout and filter logic
    │   ├── SearchBar.tsx      Search input and filter panel
    │   ├── JobGrid.tsx        Job card grid
    │   └── JobModal.tsx       Job detail modal with JD and Apply button
    └── lib/
        ├── api.ts
        └── types.ts
```
