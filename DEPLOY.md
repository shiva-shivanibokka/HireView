# HireView — Deployment & TODO

Status as of 2026-07-07: **revamp complete, verified end-to-end, NOT yet deployed.**
All feature work is done and on `main`. What's left is deployment execution (needs your
own accounts/secrets) plus a few optional extras.

Target stack ($0/month): **Vercel** (frontend) + **Google Cloud Run** (backend) + **Turso** (data).

---

## ✅ Done (shipped to main, verified)

- Turso/libsql data layer (local SQLite in dev, Turso in prod — one code path)
- Config hardening: `config.py` + startup validation, env-driven CORS, structured logging
- Scraper resilience: shared `_get()` logs failures instead of swallowing them
- Application pipeline funnel (saved → applied → interviewing → offer/rejected) + My Pipeline view
- "New since last look" flag + count
- Visa-sponsorship filter
- BM25 resume-fit ranking (`ranker.py`, no torch)
- Scheduled refresh: auto-close tracked jobs + daily email digest (`refresh.py`, `POST /api/refresh`)
- pytest suite (23 tests) + `ruff`; frontend `tsc` + `next build` green
- Dockerfile + `.dockerignore` + GitHub Actions CI + manual Cloud Run deploy workflow
- `BACKEND_URL` env-ification of all Next route handlers
- README rewrite

E2E test done 2026-07-06 (live scrape of 142 jobs, status/pipeline, BM25, fetch-description,
proxy chain, Pipeline view in the browser). Local dev DB cleaned of test data afterward.

---

## ☐ TODO — Deploy (do in order; B before C due to a URL dependency)

### A. Turso (data) — no credit card
- [ ] Install CLI + sign up: `turso auth signup`
- [ ] `turso db create hireview`
- [ ] `turso db show hireview --url`   → save as `TURSO_DATABASE_URL`
- [ ] `turso db tokens create hireview` → save as `TURSO_AUTH_TOKEN`

### B. Cloud Run (backend) — your GCP account (card on file, free tier)
- [ ] Pick a random `REFRESH_TOKEN` (e.g. `openssl rand -hex 16`)
- [ ] From `backend/`: `gcloud run deploy hireview-api --source . --region us-central1 --allow-unauthenticated`
- [ ] Set service env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `REFRESH_TOKEN`,
      and `FRONTEND_ORIGINS` (temporarily `*`, tighten in D)
- [ ] Copy the service URL (e.g. `https://hireview-api-xxxx.run.app`)
- [ ] Sanity check: open `<url>/api/health` → `{"status":"ok"}`
- [ ] Watch the first build log — it compiles `libsql`/`rank-bm25` (Linux wheels, should just work)

### C. Vercel (frontend) — no credit card
- [ ] Import repo `shiva-shivanibokka/HireView`, set **Root Directory = `frontend`**
- [ ] Add env `BACKEND_URL` = the Cloud Run URL from B
- [ ] Deploy → copy the Vercel URL (e.g. `https://hireview.vercel.app`)

### D. Wire CORS (closes the loop)
- [ ] Set Cloud Run `FRONTEND_ORIGINS` to the exact Vercel URL, redeploy the service

---

## ☐ TODO — Optional extras

### E. Daily email digest
- [ ] Create a Gmail app password (https://myaccount.google.com/apppasswords)
- [ ] Set `SMTP_USER`, `SMTP_PASS`, `DIGEST_TO` on Cloud Run
- [ ] Cloud Scheduler job: daily `POST https://<cloud-run-url>/api/refresh?token=<REFRESH_TOKEN>`

### F. Auto-deploy backend on push
- [ ] Add repo secrets `GCP_PROJECT_ID` + `GCP_SA_KEY` (service-account JSON with Cloud Run + Cloud Build access)
- [ ] Run the `Deploy backend (Cloud Run)` workflow from the Actions tab

---

## Known minor notes (not blockers)

- Company autocomplete only surfaces companies present in the SimplifyJobs dataset
  (~1,526 with display names). Fallback-only companies (e.g. Stripe) scrape fine by slug
  but won't appear in name autocomplete. Pre-existing; upgrade later if desired.
- No frontend unit-test framework — deliberate; `tsc` + `next build` are the frontend gate.

---

## Run locally

```bash
# backend
cd backend && uvicorn api:app --reload --port 8000
# frontend (separate terminal)
cd frontend && npm run dev        # http://localhost:3000
```

Env: copy `backend/.env.example` → `backend/.env`. Leave `TURSO_*` blank for local SQLite.
