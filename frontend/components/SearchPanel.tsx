"use client"

import { useState, useRef } from "react"
import type { Job, UserProfile } from "@/lib/types"
import { searchJobs, parseResumeInfo } from "@/lib/api"
import {
  SearchIcon, UploadIcon, ChevronDownIcon, ChevronUpIcon,
  LoaderIcon, GlobeIcon, CheckCircleIcon,
} from "lucide-react"

interface Props {
  profile:         UserProfile
  onProfileChange: (p: UserProfile) => void
  onJobsFound:     (jobs: Job[]) => void
}

const LOCATIONS = [
  { label: "🇺🇸  USA",    value: "United States" },
  { label: "🇪🇺  Europe", value: "Europe"        },
  { label: "🇮🇳  India",  value: "India"         },
  { label: "🌐  Remote", value: "remote"        },
]

export default function SearchPanel({ profile, onProfileChange, onJobsFound }: Props) {
  const [keywords, setKeywords]         = useState("")
  const [location, setLocation]         = useState("United States")
  const [resumeFile, setResumeFile]     = useState<File | null>(null)
  const [resumeParsed, setResumeParsed] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [parsing, setParsing]           = useState(false)
  const [error, setError]               = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [adzunaId, setAdzunaId]         = useState("")
  const [adzunaKey, setAdzunaKey]       = useState("")
  const [useGH, setUseGH]               = useState(true)
  const [useLV, setUseLV]               = useState(true)
  const [useAB, setUseAB]               = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleResumeUpload(file: File) {
    setResumeFile(file)
    setResumeParsed(false)
    setParsing(true)
    try {
      const info = await parseResumeInfo(file)
      // Only overwrite fields that are currently empty
      onProfileChange({
        name:            profile.name            || info.name            || "",
        email:           profile.email           || info.email           || "",
        phone:           profile.phone           || info.phone           || "",
        linkedin_url:    profile.linkedin_url    || info.linkedin_url    || "",
        github_url:      profile.github_url      || info.github_url      || "",
        address:         profile.address         || "",
        current_company: profile.current_company || "",
      })
      setResumeParsed(true)
    } catch {
      // Silent — just don't auto-populate
    } finally {
      setParsing(false)
    }
  }

  async function handleSearch() {
    if (!keywords.trim()) { setError("Enter at least one keyword"); return }
    if (!resumeFile)      { setError("Upload your resume for matching"); return }
    setError("")
    setLoading(true)
    try {
      const res = await searchJobs({
        keywords, location,
        resumeFile,
        adzunaAppId: adzunaId, adzunaAppKey: adzunaKey,
        useGreenhouse: useGH, useLever: useLV, useAshby: useAB,
      })
      onJobsFound(res.jobs)
      if (res.jobs.length === 0) setError(res.message ?? "No jobs found. Try broader keywords.")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>

      {/* Keywords */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <SearchIcon size={14} style={{
          position: "absolute", left: 10, top: "50%",
          transform: "translateY(-50%)", color: "var(--muted)",
        }} />
        <input
          value={keywords} onChange={e => setKeywords(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="ML Engineer, AI Engineer, LLM…"
          style={inputStyle({ paddingLeft: 32 })}
        />
      </div>

      {/* Location — preset pill buttons */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 11, color: "var(--muted)", marginBottom: 5,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <GlobeIcon size={11} /> Location
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LOCATIONS.map(loc => (
            <button key={loc.value} onClick={() => setLocation(loc.value)} style={{
              padding: "5px 12px", borderRadius: 20, border: "1px solid",
              borderColor: location === loc.value ? "var(--accent)" : "var(--border)",
              background:  location === loc.value ? "var(--accent)" : "var(--surface2)",
              color:       location === loc.value ? "#fff" : "var(--muted)",
              fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            }}>
              {loc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resume upload — auto-parses contact info on upload */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderRadius: 6, cursor: "pointer",
          border: "1px dashed var(--border)", marginBottom: 8,
          color: resumeFile ? "var(--text)" : "var(--muted)", fontSize: 13,
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        {parsing
          ? <LoaderIcon size={14} color="var(--accent)" className="spin" />
          : resumeParsed
            ? <CheckCircleIcon size={14} color="var(--green)" />
            : <UploadIcon size={14} color="var(--accent)" />
        }
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {parsing
            ? "Parsing resume…"
            : resumeFile
              ? resumeParsed
                ? `${resumeFile.name} — contact info extracted`
                : resumeFile.name
              : "Upload resume (PDF or DOCX) — contact info auto-filled"}
        </span>
        <input ref={fileRef} type="file" accept=".pdf,.docx" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f) }} />
      </div>

      {/* LinkedIn + GitHub — shown so user can verify/override what was parsed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        {([
          ["LinkedIn", "linkedin_url", "linkedin.com/in/…"   ],
          ["GitHub",   "github_url",   "github.com/username" ],
        ] as const).map(([label, key, ph]) => (
          <div key={key}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
            <input
              value={(profile as unknown as Record<string, string>)[key] ?? ""}
              onChange={e => onProfileChange({ ...profile, [key]: e.target.value })}
              placeholder={ph}
              style={inputStyle({ fontSize: "12px" })}
            />
          </div>
        ))}
      </div>

      {/* Advanced toggle */}
      <button onClick={() => setShowAdvanced(v => !v)}
        style={{ ...ghostBtn, marginBottom: showAdvanced ? 8 : 0 }}>
        {showAdvanced ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        Advanced options
      </button>

      {showAdvanced && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            <input value={adzunaId}  onChange={e => setAdzunaId(e.target.value)}
              placeholder="Adzuna App ID" style={inputStyle({ fontSize: "12px" })} />
            <input value={adzunaKey} onChange={e => setAdzunaKey(e.target.value)}
              placeholder="Adzuna App Key" style={inputStyle({ fontSize: "12px" })} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)" }}>
            {([
              ["Greenhouse", useGH, setUseGH],
              ["Lever",      useLV, setUseLV],
              ["Ashby",      useAB, setUseAB],
            ] as const).map(([label, val, set]) => (
              <label key={label} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <button onClick={handleSearch} disabled={loading} style={{
        width: "100%", padding: "9px 0", borderRadius: 6, border: "none",
        background: loading ? "var(--surface2)" : "var(--accent)",
        color: "#fff", fontWeight: 600, fontSize: 13,
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        transition: "background 0.15s",
      }}>
        {loading
          ? <><LoaderIcon size={14} className="spin" /> Searching…</>
          : <><SearchIcon size={14} /> Search Jobs</>}
      </button>
    </div>
  )
}

function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    width: "100%", padding: "7px 10px", borderRadius: 6, outline: "none",
    background: "var(--surface2)", border: "1px solid var(--border)",
    color: "var(--text)", fontSize: 13,
    ...extra,
  }
}

const ghostBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  background: "none", border: "none", color: "var(--muted)",
  fontSize: 12, cursor: "pointer", padding: "2px 0",
}
