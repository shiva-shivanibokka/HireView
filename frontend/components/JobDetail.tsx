"use client"

import { useState } from "react"
import type { Job, JobGenState, UserProfile } from "@/lib/types"
import { generateApplication, autofillJob, updateJobStatus, downloadUrl, fetchJobDescription } from "@/lib/api"
import {
  ExternalLinkIcon, FileTextIcon, FileIcon, LoaderIcon,
  ZapIcon, UploadIcon, ChevronDownIcon, ChevronUpIcon,
  RefreshCwIcon, XIcon,
} from "lucide-react"

interface Props {
  job:            Job
  profile:        UserProfile
  resumeFile:     File | null           // shared from SearchPanel — no double upload
  genState:       JobGenState
  onGenState:     (s: Partial<JobGenState>) => void
  onStatusChange: (status: Job["status"]) => void
}

export default function JobDetail({ job, profile, resumeFile, genState, onGenState, onStatusChange }: Props) {
  const [githubUrl, setGithubUrl]       = useState(profile.github_url || "")
  const [ghToken, setGhToken]           = useState("")
  const [linkedinUrl, setLinkedinUrl]   = useState(profile.linkedin_url || "")
  const [apiKey, setApiKey]             = useState("")
  const [pageOption, setPageOption]     = useState("1-page")
  const [fontFamily, setFontFamily]     = useState("Calibri")
  const [clTone, setClTone]             = useState("Professional")
  const [showSettings, setShowSettings] = useState(false)
  const [autofilling, setAutofilling]   = useState(false)
  const [autofillResult, setAutofillResult] = useState<{
    fields_filled: string[]; fields_skipped: string[]; error: string | null
  } | null>(null)
  const [useCustom, setUseCustom]       = useState(false)
  const [customResume, setCustomResume] = useState<File | null>(null)
  const [fetchingDesc, setFetchingDesc] = useState(false)
  const [jobDesc, setJobDesc]           = useState(job.description || "")
  const customRef = React.useRef<HTMLInputElement>(null)

  const { loading, progress, result, error } = genState
  const score = Math.round(job.match_score * 100)

  async function handleFetchDescription() {
    setFetchingDesc(true)
    try {
      const res = await fetchJobDescription(job.id)
      setJobDesc(res.description)
    } catch (e: unknown) {
      // silent — keep existing description
    } finally {
      setFetchingDesc(false)
    }
  }

  async function handleGenerate() {
    const file = useCustom ? (customResume ?? resumeFile) : resumeFile
    if (!file) { alert("Please upload your resume first in the search panel"); return }
    if (!apiKey.trim()) { alert("Please enter your Anthropic API key"); return }

    onGenState({ loading: true, progress: [], result: null, error: null })
    try {
      const res = await generateApplication({
        jobId: job.id,
        resumeFile: file,
        githubUrl: githubUrl || profile.github_url,
        ghToken,
        linkedinUrl: linkedinUrl || profile.linkedin_url,
        apiKey, pageOption, fontFamily, clTone,
        useCustomResume: useCustom,
        customResume: (useCustom && customResume) ? customResume : undefined,
        onProgress: (msg) => onGenState({ progress: [...(genState.progress ?? []), msg] }),
      })
      onGenState({ loading: false, result: res })
      await updateJobStatus(job.id, "generated")
      onStatusChange("generated")
    } catch (e: unknown) {
      onGenState({ loading: false, error: e instanceof Error ? e.message : "Generation failed" })
    }
  }

  async function handleAutofill() {
    if (!result?.resume_pdf_path) { alert("Generate resume first"); return }
    setAutofilling(true)
    setAutofillResult(null)
    try {
      const res = await autofillJob({
        jobId:           job.id,
        resumePdfPath:   result.resume_pdf_path,
        coverLetterText: result.cover_letter_text ?? "",
        coverLetterPath: result.cl_pdf_path ?? "",
        name:            profile.name,
        email:           profile.email,
        phone:           profile.phone,
        linkedin:        profile.linkedin_url,
        github:          profile.github_url,
        address:         profile.address,
        currentCompany:  profile.current_company,
      })
      setAutofillResult(res)
      if (res.success || res.fields_filled.length > 0) {
        await updateJobStatus(job.id, "filled")
        onStatusChange("filled")
      }
    } catch (e: unknown) {
      setAutofillResult({ fields_filled: [], fields_skipped: [], error: e instanceof Error ? e.message : "Autofill failed" })
    } finally {
      setAutofilling(false)
    }
  }

  async function handleDismiss() {
    await updateJobStatus(job.id, "dismissed")
    onStatusChange("dismissed")
  }

  return (
    <div style={{ padding: 24 }}>

      {/* ── Job header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{job.title}</h1>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
              {job.job_type ? ` · ${job.job_type}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <ScorePill score={score} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href={job.url} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                <ExternalLinkIcon size={12} /> View posting
              </a>
              <button onClick={handleDismiss} title="Dismiss this job"
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}>
                <XIcon size={12} /> Dismiss
              </button>
            </div>
          </div>
        </div>

        {job.required_skills.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {job.required_skills.slice(0, 12).map(s => (
              <span key={s} style={skillTag}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Generation panel ─────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Generate Application</div>

        {/* Resume status */}
        <div style={{
          padding: "7px 10px", borderRadius: 6, marginBottom: 8,
          background: "var(--surface2)", border: "1px solid var(--border)",
          fontSize: 12, color: resumeFile ? "var(--text)" : "var(--muted)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <FileIcon size={12} color={resumeFile ? "var(--green)" : "var(--muted)"} />
          {resumeFile ? `Resume: ${resumeFile.name}` : "No resume — upload in search panel first"}
        </div>

        {/* API key */}
        <input
          type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder="Anthropic API key"
          style={{ ...inp, marginBottom: 8 }}
        />

        {/* Generation settings toggle */}
        <button onClick={() => setShowSettings(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
            color: "var(--muted)", fontSize: 12, cursor: "pointer", marginBottom: showSettings ? 10 : 0 }}>
          {showSettings ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
          Generation settings
        </button>

        {showSettings && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <input value={githubUrl}  onChange={e => setGithubUrl(e.target.value)}
              placeholder="GitHub URL (for project matching)" style={inp} />
            <input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
              placeholder="LinkedIn URL" style={inp} />
            <input
              type="password" value={ghToken} onChange={e => setGhToken(e.target.value)}
              placeholder="GitHub token (avoids rate limits)" style={inp} />
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={inp}>
              <option value="Calibri">Calibri</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
            </select>
            <select value={pageOption} onChange={e => setPageOption(e.target.value)} style={inp}>
              <option value="1-page">1-page resume</option>
              <option value="2-page">2-page resume</option>
            </select>
            <select value={clTone} onChange={e => setClTone(e.target.value)} style={inp}>
              <option value="Professional">Professional tone</option>
              <option value="Conversational">Conversational tone</option>
              <option value="Concise">Concise tone</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} />
              Use my own resume (skip generation)
            </label>
            {useCustom && (
              <div onClick={() => customRef.current?.click()}
                style={{ ...inp, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--muted)" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <UploadIcon size={12} />{customResume ? customResume.name : "Upload custom resume PDF"}
                <input ref={customRef} type="file" accept=".pdf" hidden
                  onChange={e => e.target.files?.[0] && setCustomResume(e.target.files[0])} />
              </div>
            )}
          </div>
        )}

        {/* Progress log */}
        {(loading || progress.length > 0) && (
          <div style={{
            background: "var(--bg)", borderRadius: 6, padding: 10, marginBottom: 10,
            maxHeight: 140, overflowY: "auto", fontSize: 12, fontFamily: "monospace",
            border: "1px solid var(--border)",
          }}>
            {progress.map((p, i) => <div key={i} style={{ color: "var(--muted)", lineHeight: 1.6 }}>{p}</div>)}
            {loading && <div style={{ color: "var(--accent)" }}>…</div>}
          </div>
        )}

        {error && (
          <div style={{ background: "#2d0a0a", border: "1px solid var(--red)", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 12, color: "var(--red)" }}>
            {error}
          </div>
        )}

        <button onClick={handleGenerate} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}>
          {loading
            ? <><LoaderIcon size={14} className="spin" /> Generating…</>
            : <><FileTextIcon size={14} /> Generate Resume + Cover Letter</>}
        </button>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.scores && <ScoreCard scores={result.scores} />}

          {/* Downloads */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {result.pdf_id  && <DownloadBtn href={downloadUrl(result.pdf_id)}  label="Resume PDF"         />}
            {result.docx_id && <DownloadBtn href={downloadUrl(result.docx_id)} label="Resume DOCX"        />}
            {result.cl_pdf_id  && <DownloadBtn href={downloadUrl(result.cl_pdf_id)}  label="Cover Letter PDF"  />}
            {result.cl_docx_id && <DownloadBtn href={downloadUrl(result.cl_docx_id)} label="Cover Letter DOCX" />}
          </div>

          {/* Cover letter preview */}
          {result.cover_letter_text && (
            <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Cover Letter Preview</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--muted)", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
                {result.cover_letter_text}
              </div>
            </div>
          )}

          {/* Autofill */}
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Autofill Application Form</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
              Opens the job application in a browser window, fills all detected fields with your info
              and resume, then pauses. You review and click Apply yourself.
            </p>
            <button onClick={handleAutofill} disabled={autofilling}
              style={{ ...primaryBtn, background: "#166534", opacity: autofilling ? 0.6 : 1 }}>
              {autofilling
                ? <><LoaderIcon size={14} className="spin" /> Opening browser…</>
                : <><ZapIcon size={14} /> Autofill Form</>}
            </button>

            {autofillResult && (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                {autofillResult.error ? (
                  <div style={{ color: "var(--red)" }}>Error: {autofillResult.error}</div>
                ) : (
                  <>
                    <div style={{ color: "var(--green)" }}>
                      Filled {autofillResult.fields_filled.length} fields: {autofillResult.fields_filled.join(", ")}
                    </div>
                    {autofillResult.fields_skipped.length > 0 && (
                      <div style={{ color: "var(--muted)", marginTop: 2 }}>
                        Skipped: {autofillResult.fields_skipped.join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Job Description ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Job Description</div>
          <button onClick={handleFetchDescription} disabled={fetchingDesc}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
              color: "var(--muted)", fontSize: 12, cursor: "pointer" }}>
            {fetchingDesc ? <LoaderIcon size={12} className="spin" /> : <RefreshCwIcon size={12} />}
            {fetchingDesc ? "Fetching…" : "Refresh full JD"}
          </button>
        </div>
        {jobDesc ? (
          <div style={{
            fontSize: 13, lineHeight: 1.7, color: "var(--muted)",
            whiteSpace: "pre-wrap", background: "var(--surface)",
            borderRadius: 8, padding: 16, border: "1px solid var(--border)",
            maxHeight: 400, overflowY: "auto",
          }}>
            {jobDesc}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>
            No description scraped. Click "Refresh full JD" to fetch it.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import React from "react"

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? "var(--green)" : score >= 45 ? "var(--yellow)" : "var(--muted)"
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color,
      border: `1px solid ${color}`, borderRadius: 6, padding: "3px 10px",
      background: "var(--surface)",
    }}>
      Match {score}%
    </div>
  )
}

type Scores = {
  ats_score: number; ats_label: string
  match_score: number; match_label: string
  ats_feedback?: string[]; match_feedback?: string[]
  matched_keywords?: string[]; missing_keywords?: string[]
  error?: string
}

function ScoreCard({ scores }: { scores: Scores }) {
  if (scores.error) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>
        Scoring unavailable: {scores.error}
      </div>
    )
  }
  return (
    <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
        <ScoreNum label="ATS Score"  score={scores.ats_score}   label2={scores.ats_label} />
        <ScoreNum label="JD Match"   score={scores.match_score} label2={scores.match_label} />
      </div>
      {(scores.ats_feedback ?? []).length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>ATS Tips</div>
          {scores.ats_feedback!.map((t, i) => <div key={i}>• {t}</div>)}
        </div>
      )}
      {(scores.matched_keywords ?? []).length > 0 && (
        <div style={{ fontSize: 12, color: "var(--green)", marginBottom: 2 }}>
          ✓ {scores.matched_keywords!.slice(0, 12).join(", ")}
        </div>
      )}
      {(scores.missing_keywords ?? []).length > 0 && (
        <div style={{ fontSize: 12, color: "var(--red)" }}>
          ✗ Missing: {scores.missing_keywords!.slice(0, 8).join(", ")}
        </div>
      )}
    </div>
  )
}

function ScoreNum({ label, score, label2 }: { label: string; score: number; label2: string }) {
  const color = score >= 7 ? "var(--green)" : score >= 5 ? "var(--yellow)" : "var(--red)"
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>
        {score}<span style={{ fontSize: 13, color: "var(--muted)" }}>/10</span>
      </div>
      <div style={{ fontSize: 11, color }}>{label2}</div>
    </div>
  )
}

function DownloadBtn({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 500,
        background: "var(--surface2)", border: "1px solid var(--border)",
        color: "var(--text)", textDecoration: "none", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <FileTextIcon size={13} color="var(--accent)" />{label}
    </a>
  )
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 6,
  background: "var(--surface2)", border: "1px solid var(--border)",
  color: "var(--text)", fontSize: 13, outline: "none",
}

const primaryBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  width: "100%", padding: "9px 0", borderRadius: 6, border: "none",
  background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 13,
  cursor: "pointer", transition: "opacity 0.15s",
}

const skillTag: React.CSSProperties = {
  fontSize: 11, padding: "2px 8px", borderRadius: 4,
  background: "var(--surface2)", border: "1px solid var(--border)",
  color: "var(--muted)",
}
