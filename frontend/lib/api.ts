// ── API client ────────────────────────────────────────────────────────────────
// All calls go to /api/* which Next.js proxies to FastAPI on port 8000

import type { Job, GenerateResult, Application } from "./types"

async function post<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? "Request failed")
  }
  return res.json()
}

export async function streamPost<T>(
  path: string,
  body: FormData,
  onProgress: (msg: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, { method: "POST", body, signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? "Request failed")
  }
  if (!res.body) throw new Error("No response body")

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop() ?? ""
    for (const chunk of lines) {
      const line = chunk.trim()
      if (!line.startsWith("data:")) continue
      const json = line.slice(5).trim()
      try {
        const event = JSON.parse(json)
        if (event.type === "progress") onProgress(event.message)
        else if (event.type === "error") throw new Error(event.message)
        else if (event.type === "done")  return event as T
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  throw new Error("Stream ended without a done event")
}

// ── Typed calls ───────────────────────────────────────────────────────────────

export async function searchJobs(params: {
  keywords:       string
  location:       string
  resumeFile:     File
  adzunaAppId:    string
  adzunaAppKey:   string
  useGreenhouse:  boolean
  useLever:       boolean
  useAshby:       boolean
}): Promise<{ jobs: Job[]; total: number; message?: string }> {
  const fd = new FormData()
  fd.append("keywords",        params.keywords)
  fd.append("location",        params.location)
  fd.append("resume_file",     params.resumeFile)
  fd.append("adzuna_app_id",   params.adzunaAppId)
  fd.append("adzuna_app_key",  params.adzunaAppKey)
  fd.append("use_greenhouse",  String(params.useGreenhouse))
  fd.append("use_lever",       String(params.useLever))
  fd.append("use_ashby",       String(params.useAshby))
  return post("/api/search", fd)
}

export async function parseResumeInfo(resumeFile: File): Promise<{
  name: string; email: string; phone: string
  linkedin_url: string; github_url: string
}> {
  const fd = new FormData()
  fd.append("resume_file", resumeFile)
  return post("/api/parse-resume-info", fd)
}

export async function listJobs(status?: string): Promise<{ jobs: Job[] }> {
  const url = status ? `/api/jobs?status=${status}` : "/api/jobs"
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to load jobs")
  return res.json()
}

export async function generateApplication(params: {
  jobId:          string
  resumeFile:     File
  githubUrl:      string
  ghToken:        string
  linkedinUrl:    string
  pageOption:     string
  fontFamily:     string
  clTone:         string
  apiKey:         string
  useCustomResume: boolean
  customResume?:  File
  onProgress:     (msg: string) => void
  signal?:        AbortSignal
}): Promise<GenerateResult> {
  const fd = new FormData()
  fd.append("resume_file",       params.resumeFile)
  fd.append("github_url",        params.githubUrl)
  fd.append("gh_token",          params.ghToken)
  fd.append("linkedin_url",      params.linkedinUrl)
  fd.append("page_option",       params.pageOption)
  fd.append("font_family",       params.fontFamily)
  fd.append("cl_tone",           params.clTone)
  fd.append("api_key",           params.apiKey)
  fd.append("use_custom_resume", String(params.useCustomResume))
  if (params.customResume) fd.append("custom_resume", params.customResume)

  return streamPost(
    `/api/jobs/${params.jobId}/generate`,
    fd,
    params.onProgress,
    params.signal,
  )
}

export async function autofillJob(params: {
  jobId:              string
  resumePdfPath:      string
  coverLetterText:    string
  coverLetterPath:    string
  name:               string
  email:              string
  phone:              string
  linkedin:           string
  github:             string
  address:            string
  currentCompany:     string
}): Promise<{ success: boolean; fields_filled: string[]; fields_skipped: string[]; error: string | null }> {
  const fd = new FormData()
  fd.append("resume_pdf_path",      params.resumePdfPath)
  fd.append("cover_letter_text",    params.coverLetterText)
  fd.append("cover_letter_path",    params.coverLetterPath)
  fd.append("user_name",            params.name)
  fd.append("user_email",           params.email)
  fd.append("user_phone",           params.phone)
  fd.append("user_linkedin",        params.linkedin)
  fd.append("user_github",          params.github)
  fd.append("user_address",         params.address)
  fd.append("user_current_company", params.currentCompany)
  return post(`/api/jobs/${params.jobId}/autofill`, fd)
}

export async function getApplications(): Promise<{ applications: Application[] }> {
  const res = await fetch("/api/applications")
  if (!res.ok) throw new Error("Failed to load applications")
  return res.json()
}

export async function updateJobStatus(jobId: string, status: string): Promise<void> {
  const fd = new FormData()
  fd.append("status", status)
  await fetch(`/api/jobs/${jobId}/status`, { method: "PATCH", body: fd })
}

export function downloadUrl(fileId: string): string {
  return `/api/download/${fileId}`
}
