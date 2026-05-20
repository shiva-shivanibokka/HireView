// API client — all requests go to /api/* which Next.js route handlers proxy to FastAPI.
// This keeps everything on the same origin (localhost:3000) — no CORS, no timeout issues.

import type { Job } from "./types"

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, options)
  } catch {
    throw new Error(
      "Cannot reach the backend. Make sure it is running:\n" +
      "cd backend && uvicorn api:app --reload --port 8000"
    )
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? "Request failed")
  }
  return res.json()
}

export async function searchJobs(params: {
  keywords:      string
  location:      string
  adzunaAppId:   string
  adzunaAppKey:  string
  useGreenhouse: boolean
  useLever:      boolean
  useAshby:      boolean
}): Promise<{ jobs: Job[]; total: number; message?: string }> {
  const fd = new FormData()
  fd.append("keywords",       params.keywords)
  fd.append("location",       params.location)
  fd.append("adzuna_app_id",  params.adzunaAppId)
  fd.append("adzuna_app_key", params.adzunaAppKey)
  fd.append("use_greenhouse", String(params.useGreenhouse))
  fd.append("use_lever",      String(params.useLever))
  fd.append("use_ashby",      String(params.useAshby))
  return request("/api/search", { method: "POST", body: fd })
}

export async function fetchJobDescription(jobId: string): Promise<{ description: string }> {
  return request(`/api/jobs/${jobId}/fetch-description`, { method: "POST" })
}

export async function listJobs(status?: string): Promise<{ jobs: Job[] }> {
  return request(status ? `/api/jobs?status=${status}` : "/api/jobs")
}

export async function updateJobStatus(jobId: string, status: string): Promise<void> {
  const fd = new FormData()
  fd.append("status", status)
  await request(`/api/jobs/${jobId}/status`, { method: "PATCH", body: fd })
}
