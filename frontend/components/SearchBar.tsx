"use client"

import { useState, useRef, useEffect } from "react"
import type { Job } from "@/lib/types"
import type { ExperienceLevel, PostedWithin, JobTypeFilter } from "./AutoApplyApp"
import { searchJobs } from "@/lib/api"
import {
  SearchIcon, LoaderIcon, SlidersHorizontalIcon,
  XIcon, ChevronDownIcon, CheckIcon,
} from "lucide-react"

interface Props {
  onJobsFound:      (jobs: Job[]) => void
  sort:             "newest" | "relevance"
  onSortChange:     (s: "newest" | "relevance") => void
  exp:              ExperienceLevel
  onExpChange:      (e: ExperienceLevel) => void
  jobType:          JobTypeFilter
  onJobTypeChange:  (j: JobTypeFilter) => void
  within:           PostedWithin
  onWithinChange:   (w: PostedWithin) => void
}

const LOCATIONS = [
  { label: "USA",    value: "United States" },
  { label: "Europe", value: "Europe"        },
  { label: "India",  value: "India"         },
  { label: "Remote", value: "Remote"        },
]

const EXP_OPTIONS: { label: string; value: ExperienceLevel; sub?: string }[] = [
  { label: "Any level",                    value: "any"     },
  { label: "Internship",                   value: "intern",  sub: "Summer / Co-op / Placement" },
  { label: "New Grad / Entry",             value: "newgrad", sub: "0–2 years" },
  { label: "Mid-Level",                    value: "mid",     sub: "2–5 years" },
  { label: "Senior",                       value: "senior",  sub: "5–8 years" },
  { label: "Staff / Lead / Principal",     value: "staff",   sub: "8+ years"  },
]

const JOB_TYPE_OPTIONS: { label: string; value: JobTypeFilter; sub?: string }[] = [
  { label: "Any type",    value: "any"        },
  { label: "Full-time",   value: "full-time"  },
  { label: "Part-time",   value: "part-time"  },
  { label: "Contract",    value: "contract",   sub: "Includes consultant" },
  { label: "Internship",  value: "internship" },
  { label: "Remote",      value: "remote"     },
  { label: "Hybrid",      value: "hybrid"     },
  { label: "On-site",     value: "onsite"     },
]

const WITHIN_OPTIONS: { label: string; value: PostedWithin }[] = [
  { label: "Any time",     value: "any" },
  { label: "Last 7 days",  value: "7"   },
  { label: "Last 2 weeks", value: "14"  },
  { label: "Last 30 days", value: "30"  },
]

const SORT_OPTIONS = [
  { label: "Newest first",   value: "newest"    as const },
  { label: "Most relevant",  value: "relevance" as const },
]

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  greenhouse: { bg: "#dcfce7", color: "#15803d" },
  lever:      { bg: "#dbeafe", color: "#1d4ed8" },
  ashby:      { bg: "#ede9fe", color: "#6d28d9" },
  adzuna:     { bg: "#fef3c7", color: "#92400e" },
}

export default function SearchBar({
  onJobsFound, sort, onSortChange, exp, onExpChange,
  jobType, onJobTypeChange, within, onWithinChange,
}: Props) {
  const [keywords, setKeywords]       = useState("")
  const [location, setLocation]       = useState("United States")
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [adzunaId, setAdzunaId]       = useState("")
  const [adzunaKey, setAdzunaKey]     = useState("")
  const [useGH, setUseGH]             = useState(true)
  const [useLV, setUseLV]             = useState(true)
  const [useAB, setUseAB]             = useState(true)

  async function handleSearch() {
    if (!keywords.trim()) { setError("Enter a job title or keywords"); return }
    setError("")
    setLoading(true)
    try {
      const res = await searchJobs({
        keywords, location,
        adzunaAppId: adzunaId, adzunaAppKey: adzunaKey,
        useGreenhouse: useGH, useLever: useLV, useAshby: useAB,
      })
      onJobsFound(res.jobs)
      if (res.jobs.length === 0)
        setError(res.message ?? "No jobs found. Try broader keywords.")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  // Active filter count for badge on Filters button
  const activeCount = [
    location !== "United States",
    exp !== "any",
    jobType !== "any",
    within !== "any",
    sort !== "newest",
    !useGH || !useLV || !useAB,
  ].filter(Boolean).length

  const expLabel     = EXP_OPTIONS.find(o => o.value === exp)?.label ?? "Any level"
  const jobTypeLabel = JOB_TYPE_OPTIONS.find(o => o.value === jobType)?.label ?? "Any type"
  const withinLabel  = WITHIN_OPTIONS.find(o => o.value === within)?.label ?? "Any time"
  const sortLabel    = SORT_OPTIONS.find(o => o.value === sort)?.label ?? "Newest first"

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10,
          background: "var(--surface)", border: "2px solid var(--border)",
          borderRadius: 12, padding: "0 14px", transition: "border-color 0.15s",
        }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlurCapture={e  => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <SearchIcon size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
          <input
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Job title, keywords, company…"
            style={{
              flex: 1, padding: "12px 0", background: "none",
              border: "none", outline: "none", fontSize: 15, color: "var(--text)",
            }}
          />
          {keywords && (
            <button onClick={() => setKeywords("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex" }}>
              <XIcon size={14} />
            </button>
          )}
        </div>

        <button onClick={handleSearch} disabled={loading} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 24px", borderRadius: 12, border: "none",
          background: loading ? "var(--surface2)" : "var(--accent)",
          color: loading ? "var(--muted)" : "#fff",
          fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s", flexShrink: 0,
        }}>
          {loading
            ? <><LoaderIcon size={15} className="spin" /> Searching…</>
            : <><SearchIcon size={15} /> Search</>}
        </button>
        <button onClick={() => setShowFilters(v => !v)} style={{
          display: "flex", alignItems: "center", gap: 6, position: "relative",
          padding: "12px 14px", borderRadius: 12,
          border: `2px solid ${showFilters || activeCount > 0 ? "var(--accent)" : "var(--border)"}`,
          background: showFilters ? "#eef1fb" : "var(--surface)",
          color: showFilters || activeCount > 0 ? "var(--accent)" : "var(--muted)",
          fontWeight: 600, fontSize: 13, cursor: "pointer",
          transition: "all 0.15s", flexShrink: 0,
        }}>
          <SlidersHorizontalIcon size={14} /> Filters
          {activeCount > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -6,
              background: "var(--accent)", color: "#fff",
              fontSize: 10, fontWeight: 700,
              width: 18, height: 18, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>
      {(exp !== "any" || jobType !== "any" || within !== "any" || sort !== "newest" || location !== "United States") && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {location !== "United States" && (
            <FilterPill label={location} color="#0891b2" onClear={() => setLocation("United States")} />
          )}
          {exp !== "any" && (
            <FilterPill label={expLabel} color="var(--accent)" onClear={() => onExpChange("any")} />
          )}
          {jobType !== "any" && (
            <FilterPill label={jobTypeLabel} color="#7c3aed" onClear={() => onJobTypeChange("any")} />
          )}
          {within !== "any" && (
            <FilterPill label={withinLabel} color="#16a34a" onClear={() => onWithinChange("any")} />
          )}
          {sort !== "newest" && (
            <FilterPill label={sortLabel} color="#d97706" onClear={() => onSortChange("newest")} />
          )}
        </div>
      )}
      {showFilters && (
        <div style={{
          marginTop: 10, padding: "20px 20px 16px",
          background: "var(--surface)",
          border: "1.5px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 20,
          }}>
            <FilterGroup label="Location">
              {LOCATIONS.map(loc => (
                <DropdownOption
                  key={loc.value}
                  label={loc.label}
                  active={location === loc.value}
                  onClick={() => setLocation(loc.value)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Experience level">
              {EXP_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  label={opt.label}
                  sub={opt.sub}
                  active={exp === opt.value}
                  onClick={() => onExpChange(opt.value)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Job type">
              {JOB_TYPE_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  label={opt.label}
                  sub={opt.sub}
                  active={jobType === opt.value}
                  onClick={() => onJobTypeChange(opt.value)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Date posted">
              {WITHIN_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  label={opt.label}
                  active={within === opt.value}
                  onClick={() => onWithinChange(opt.value)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Sort by">
              {SORT_OPTIONS.map(opt => (
                <DropdownOption
                  key={opt.value}
                  label={opt.label}
                  active={sort === opt.value}
                  onClick={() => onSortChange(opt.value)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Sources">
              {([
                ["Greenhouse", useGH, setUseGH, "greenhouse"],
                ["Lever",      useLV, setUseLV, "lever"     ],
                ["Ashby",      useAB, setUseAB, "ashby"     ],
              ] as const).map(([label, val, set, key]) => (
                <label key={label} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                  background: val ? SOURCE_COLORS[key].bg : "transparent",
                  border: `1px solid ${val ? SOURCE_COLORS[key].color + "55" : "var(--border)"}`,
                  color: val ? SOURCE_COLORS[key].color : "var(--muted)",
                  fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                  marginBottom: 4,
                }}>
                  <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                    style={{ accentColor: SOURCE_COLORS[key].color }} />
                  {label}
                </label>
              ))}
            </FilterGroup>
            <FilterGroup label="Adzuna API (optional)">
              <input value={adzunaId} onChange={e => setAdzunaId(e.target.value)}
                placeholder="App ID"  style={{ ...inputStyle, marginBottom: 6 }} />
              <input value={adzunaKey} onChange={e => setAdzunaKey(e.target.value)}
                placeholder="App Key" style={inputStyle} />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                Free key at developer.adzuna.com
              </div>
            </FilterGroup>

          </div>
          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 8,
            marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
          }}>
            <button onClick={() => {
              setLocation("United States")
              onExpChange("any")
              onJobTypeChange("any")
              onWithinChange("any")
              onSortChange("newest")
              setUseGH(true); setUseLV(true); setUseAB(true)
              setAdzunaId(""); setAdzunaKey("")
            }} style={{
              padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)",
              background: "none", color: "var(--muted)", fontSize: 13,
              cursor: "pointer", fontWeight: 500,
            }}>
              Reset all
            </button>
            <button onClick={() => setShowFilters(false)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#fff", fontSize: 13,
              cursor: "pointer", fontWeight: 600,
            }}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 10,
          background: "#fef2f2", border: "1px solid #fecaca",
          color: "var(--red)", fontSize: 13, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function DropdownOption({ label, sub, active, onClick }: {
  label: string; sub?: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", padding: "7px 10px", borderRadius: 8, border: "none",
      background: active ? "#eef1fb" : "transparent",
      color: active ? "var(--accent)" : "var(--text)",
      fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: "pointer", textAlign: "left",
      transition: "background 0.1s",
      marginBottom: 2,
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)" }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent" }}
    >
      <div>
        <div>{label}</div>
        {sub && (
          <div style={{ fontSize: 11, color: active ? "var(--accent)" : "var(--muted)", fontWeight: 400, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      {active && <CheckIcon size={13} color="var(--accent)" style={{ flexShrink: 0 }} />}
    </button>
  )
}

function FilterPill({ label, color, onClear }: { label: string; color: string; onClear: () => void }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 12, fontWeight: 600, color,
      background: color + "15", padding: "3px 10px",
      borderRadius: 20, border: `1px solid ${color}33`,
    }}>
      {label}
      <button onClick={onClear} style={{
        background: "none", border: "none", cursor: "pointer",
        color, display: "flex", padding: 0, lineHeight: 1,
      }}>
        <XIcon size={11} />
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "7px 10px",
  borderRadius: 8, outline: "none",
  background: "var(--surface2)", border: "1px solid var(--border)",
  color: "var(--text)", fontSize: 12,
}
