// ── Shared types ──────────────────────────────────────────────────────────────

export interface Job {
  id:              string
  title:           string
  company:         string
  location:        string
  job_type:        string
  source:          string
  url:             string
  description:     string
  required_skills: string[]
  keywords:        string[]
  match_score:     number   // 0.0 – 1.0
  scraped_at:      string
  status:          "new" | "generated" | "filled" | "dismissed"
}

export interface GenerateResult {
  resume_data:      object
  jd_structured:   object
  jd_raw:          string
  matched_payload: object
  docx_id:         string | null
  pdf_id:          string | null
  docx_name:       string | null
  pdf_name:        string | null
  resume_pdf_path: string
  scores:          {
    ats_score:        number
    ats_label:        string
    match_score:      number
    match_label:      string
    ats_feedback:     string[]
    match_feedback:   string[]
    matched_keywords: string[]
    missing_keywords: string[]
  } | null
  cover_letter_text: string
  cl_pdf_id:         string | null
  cl_docx_id:        string | null
  cl_pdf_name:       string | null
  cl_pdf_path:       string | null
}

export interface Application {
  id:                 number
  job_id:             string
  job_title:          string
  company:            string
  resume_pdf_path:    string
  cover_letter_path:  string
  cover_letter_text:  string
  filled_at:          string
  notes:              string
}

export interface UserProfile {
  name:            string
  email:           string
  phone:           string
  linkedin_url:    string
  github_url:      string
  address:         string
  current_company: string
}

// Per-job UI state — tracks generation result per job ID
export interface JobGenState {
  loading:  boolean
  progress: string[]
  result:   GenerateResult | null
  error:    string | null
}
