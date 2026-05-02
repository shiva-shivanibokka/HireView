"use client"

import { useState, useRef } from "react"
import type { Job, JobGenState, UserProfile } from "@/lib/types"
import { generateApplication, autofillJob, updateJobStatus, downloadUrl } from "@/lib/api"
import {
  ExternalLinkIcon, FileTextIcon, FileIcon, LoaderIcon,
  ZapIcon, UploadIcon, ChevronDownIcon, ChevronUpIcon,
} from "lucide-react"

interface Props {
  job:        Job
  profile:    UserProfile
  genState:   JobGenState
  onGenState: (s: Partial<JobGenState>) => void
}

export default function JobDetail({ job, profile, genState, onGenState }: Props) {
  const [resumeFile, setResumeFile]     = useState<File | null>(null)
  const [githubUrl, setGithubUrl]       = useState("")
  const [linkedinUrl, setLinkedinUrl]   = useState(profile.linkedin_url || "")
  const [apiKey, setApiKey]             = useState("")
  const [pageOption, setPageOption]     = useState("1-page")
  const [clTone, setClTone]             = useState("Professional")
  const [showSettings, setShowSettings] = useState(false)
  const [autofilling, setAutofilling]   = useState(false)
  const [autofillResult, setAutofillResult] = useState<{fields_filled: string[]; error: string | null} | null>(null)
  const [useCustom, setUseCustom]       = useState(false)
  const [customResume, setCustomResume] = useState<File | null>(null)
  const resumeRef  = useRef<HTMLInputElement>(null)
  const customRef  = useRef<HTMLInputElement>(null)

  const { loading, progress, result, error } = genState
  const score = Math.round(job.match_score * 100)

  async function handleGenerate() {
    if (!resumeFile) { alert("Please upload your base resume first"); return }
    if (!apiKey.trim()) { alert("Please enter your Anthropic API key"); return }

    onGenState({ loading: true, progress: [], result: null, error: null })
    try {
      const res = await generateApplication({
        jobId: job.id,
        resumeFile,
        githubUrl,
        ghToken: "",
        linkedinUrl,
        apiKey,
        pageOption,
        fontFamily: "Calibri",
        clTone,
        useCustomResume: useCustom,
        customResume: customResume ?? undefined,
        onProgress: (msg) => onGenState({ progress: [...(genState.progress ?? []), msg] }),
      })
      onGenState({ loading: false, result: res })
      updateJobStatus(job.id, "generated")
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
    } catch (e: unknown) {
      setAutofillResult({ fields_filled: [], error: e instanceof Error ? e.message : "Autofill failed" })
    } finally {
      setAutofilling(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {/* ── Job header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{job.title}</h1>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
              {job.company}{job.location ? ` · ${job.location}` : ""}
              {job.job_type ? ` · ${job.job_type}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <ScorePill score={score} />
            <a href={job.url} target="_blank" rel="noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
              <ExternalLinkIcon size={12} /> View posting
            </a>
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

      {/* ── Generation controls ─────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Generate Application</div>

        {/* Resume upload */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <FileUploadBtn
            label={resumeFile ? resumeFile.name : "Upload base resume"}
            accept=".pdf,.docx"
            inputRef={resumeRef}
            onChange={f => setResumeFile(f)}
            icon={<UploadIcon size={12} />}
          />
          <input
            type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Anthropic API key"
            style={inp}
          />
        </div>

        {/* Settings toggle */}
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
            <select value={pageOption} onChange={e => setPageOption(e.target.value)} style={inp}>
              <option value="1-page">1-page resume</option>
              <option value="2-page">2-page resume</option>
            </select>
            <select value={clTone} onChange={e => setClTone(e.target.value)} style={inp}>
              <option value="Professional">Professional tone</option>
              <option value="Conversational">Conversational tone</option>
              <option value="Concise">Concise tone</option>
            </select>
            {/* Custom resume override */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} />
              Use my own resume (skip generation)
            </label>
            {useCustom && (
              <FileUploadBtn
                label={customResume ? customResume.name : "Upload custom resume PDF"}
                accept=".pdf"
                inputRef={customRef}
                onChange={f => setCustomResume(f)}
                icon={<FileIcon size={12} />}
              />
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

        <button onClick={handleGenerate} disabled={loading}
          style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? <><LoaderIcon size={14} className="spin" /> Generating…</> : <><FileTextIcon size={14} /> Generate Resume + Cover Letter</>}
        </button>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Scores */}
          {result.scores && (
            <ScoreCard scores={result.scores} />
          )}

          {/* Download buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {result.pdf_id && (
              <DownloadBtn href={downloadUrl(result.pdf_id)} label="Resume PDF" />
            )}
            {result.docx_id && (
              <DownloadBtn href={downloadUrl(result.docx_id)} label="Resume DOCX" />
            )}
            {result.cl_pdf_id && (
              <DownloadBtn href={downloadUrl(result.cl_pdf_id)} label="Cover Letter PDF" />
            )}
            {result.cl_docx_id && (
              <DownloadBtn href={downloadUrl(result.cl_docx_id)} label="Cover Letter DOCX" />
            )}
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
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Autofill Application Form</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
              Playwright will open the job application in a visible browser window,
              fill all detected fields with your info and resume, then stop.
              You review the form and click Apply yourself.
            </p>
            <button onClick={handleAutofill} disabled={autofilling}
              style={{ ...primaryBtn, background: "#166534", opacity: autofilling ? 0.6 : 1 }}>
              {autofilling
                ? <><LoaderIcon size={14} className="spin" /> Opening browser…</>
                : <><ZapIcon size={14} /> Autofill Form</>}
            </button>
            {autofillResult && (
              <div style={{ marginTop: 10, fontSize: 12, color: autofillResult.error ? "var(--red)" : "var(--green)" }}>
                {autofillResult.error
                  ? `Error: ${autofillResult.error}`
                  : `Filled ${autofillResult.fields_filled.length} fields: ${autofillResult.fields_filled.join(", ")}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── JD Description ──────────────────────────────────────────────────── */}
      {job.description && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Job Description</div>
          <div style={{
            fontSize: 13, lineHeight: 1.7, color: "var(--muted)",
            whiteSpace: "pre-wrap", background: "var(--surface)",
            borderRadius: 8, padding: 16, border: "1px solid var(--border)",
            maxHeight: 400, overflowY: "auto",
          }}>
            {job.description}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

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

function ScoreCard({ scores }: { scores: NonNullable<ReturnType<() => { ats_score: number; ats_label: string; match_score: number; match_label: string; ats_feedback: string[]; match_feedback: string[]; matched_keywords: string[]; missing_keywords: string[] }>> }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
        <ScoreNum label="ATS Score"    score={scores.ats_score}   label2={scores.ats_label} />
        <ScoreNum label="JD Match"     score={scores.match_score} label2={scores.match_label} />
      </div>
      {scores.ats_feedback?.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>ATS Tips</div>
          {scores.ats_feedback.map((t, i) => <div key={i}>• {t}</div>)}
        </div>
      )}
      {scores.matched_keywords?.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--green)" }}>
          ✓ {scores.matched_keywords.slice(0, 12).join(", ")}
        </div>
      )}
      {scores.missing_keywords?.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--red)" }}>
          ✗ Missing: {scores.missing_keywords.slice(0, 8).join(", ")}
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
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{score}<span style={{ fontSize: 13, color: "var(--muted)" }}>/10</span></div>
      <div style={{ fontSize: 11, color }}>{label2}</div>
    </div>
  )
}

function FileUploadBtn({ label, accept, inputRef, onChange, icon }: {
  label: string; accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (f: File) => void
  icon: React.ReactNode
}) {
  return (
    <div onClick={() => inputRef.current?.click()}
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
        ...inp, fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {icon}{label}
      <input ref={inputRef} type="file" accept={accept} hidden
        onChange={e => e.target.files?.[0] && onChange(e.target.files[0])} />
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
        color: "var(--text)", textDecoration: "none",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <FileTextIcon size={13} color="var(--accent)" />
      {label}
    </a>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
