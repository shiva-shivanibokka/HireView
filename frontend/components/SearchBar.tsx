"use client"

import { useState, useRef, useEffect } from "react"
import type { Job } from "@/lib/types"
import type { ExperienceLevel, PostedWithin, JobTypeFilter } from "./HireView"
import type { SponsorshipFilter } from "@/lib/sponsorship"
import { searchJobs, fetchSuggestions, fetchCompanySuggestions, getResume, saveResume } from "@/lib/api"
import type { CompanySuggestion } from "@/lib/api"
import {
  SearchIcon, LoaderIcon, SlidersHorizontalIcon,
  XIcon, CheckIcon, BuildingIcon,
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
  sponsor:          SponsorshipFilter
  onSponsorChange:  (s: SponsorshipFilter) => void
}

const SPONSOR_OPTIONS: { label: string; value: SponsorshipFilter; sub?: string }[] = [
  { label: "Any",                value: "any"                                              },
  { label: "Sponsor-friendly",   value: "friendly", sub: "Hide roles that exclude sponsorship" },
  { label: "Explicit sponsors",  value: "only",     sub: "Only roles that mention sponsorship"  },
]

const LOCATIONS = [
  { label: "USA",    value: "United States" },
  { label: "Europe", value: "Europe"        },
  { label: "India",  value: "India"         },
  { label: "Remote", value: "Remote"        },
]

const EXP_OPTIONS: { label: string; value: ExperienceLevel; sub?: string }[] = [
  { label: "Any level",                value: "any"     },
  { label: "Internship",               value: "intern",  sub: "Summer / Co-op / Placement" },
  { label: "New Grad / Entry",         value: "newgrad", sub: "0–2 years" },
  { label: "Mid-Level",                value: "mid",     sub: "2–5 years" },
  { label: "Senior",                   value: "senior",  sub: "5–8 years" },
  { label: "Staff / Lead / Principal", value: "staff",   sub: "8+ years"  },
]

const JOB_TYPE_OPTIONS: { label: string; value: JobTypeFilter; sub?: string }[] = [
  { label: "Any type",   value: "any"        },
  { label: "Full-time",  value: "full-time"  },
  { label: "Part-time",  value: "part-time"  },
  { label: "Contract",   value: "contract",   sub: "Includes consultant" },
  { label: "Internship", value: "internship" },
  { label: "Remote",     value: "remote"     },
  { label: "Hybrid",     value: "hybrid"     },
  { label: "On-site",    value: "onsite"     },
]

const WITHIN_OPTIONS: { label: string; value: PostedWithin }[] = [
  { label: "Any time",     value: "any" },
  { label: "Last 7 days",  value: "7"   },
  { label: "Last 2 weeks", value: "14"  },
  { label: "Last 30 days", value: "30"  },
]

const SORT_OPTIONS = [
  { label: "Newest first",  value: "newest"    as const },
  { label: "Most relevant", value: "relevance" as const },
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
  sponsor, onSponsorChange,
}: Props) {
  const [selectedTitles, setSelectedTitles]           = useState<string[]>([])
  const [inputValue, setInputValue]                   = useState("")
  const [suggestions, setSuggestions]                 = useState<string[]>([])
  const [showDropdown, setShowDropdown]               = useState(false)
  const [focusedIdx, setFocusedIdx]                   = useState(-1)
  const [titleFocused, setTitleFocused]               = useState(false)
  const [selectedCompanies, setSelectedCompanies]     = useState<CompanySuggestion[]>([])
  const [companyInput, setCompanyInput]               = useState("")
  const [companySuggestions, setCompanySuggestions]   = useState<CompanySuggestion[]>([])
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [companyFocusedIdx, setCompanyFocusedIdx]     = useState(-1)
  const [companyFocused, setCompanyFocused]           = useState(false)
  const [location, setLocation]                   = useState("United States")
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState("")
  const [showFilters, setShowFilters]       = useState(false)
  const [adzunaId, setAdzunaId]             = useState("")
  const [adzunaKey, setAdzunaKey]           = useState("")
  const [useGH, setUseGH]                   = useState(true)
  const [useLV, setUseLV]                   = useState(true)
  const [useAB, setUseAB]                   = useState(true)
  const [resumeText, setResumeText]         = useState("")
  const [resumeSaved, setResumeSaved]       = useState(false)

  // Load any previously-saved resume so the panel reflects current state.
  useEffect(() => {
    getResume()
      .then(r => { if (r.text) { setResumeText(r.text); setResumeSaved(true) } })
      .catch(() => {})
  }, [])

  async function handleSaveResume() {
    try {
      await saveResume(resumeText)
      setResumeSaved(true)
    } catch {
      // leave unsaved; user can retry
    }
  }

  const inputRef           = useRef<HTMLInputElement>(null)
  const dropdownRef        = useRef<HTMLDivElement>(null)
  const debounceRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const companyInputRef    = useRef<HTMLInputElement>(null)
  const companyDropdownRef = useRef<HTMLDivElement>(null)
  const companyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!inputValue.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(inputValue)
      const filtered = results.filter(t => !selectedTitles.includes(t))
      setSuggestions(filtered)
      setShowDropdown(filtered.length > 0)
      setFocusedIdx(-1)
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [inputValue, selectedTitles])

  // Close title dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Company suggestions debounce
  useEffect(() => {
    if (companyDebounceRef.current) clearTimeout(companyDebounceRef.current)
    if (!companyInput.trim()) {
      setCompanySuggestions([])
      setShowCompanyDropdown(false)
      return
    }
    companyDebounceRef.current = setTimeout(async () => {
      const results = await fetchCompanySuggestions(companyInput)
      const filtered = results.filter(c => !selectedCompanies.some(s => s.slug === c.slug && s.platform === c.platform))
      setCompanySuggestions(filtered)
      setShowCompanyDropdown(filtered.length > 0)
      setCompanyFocusedIdx(-1)
    }, 200)
    return () => { if (companyDebounceRef.current) clearTimeout(companyDebounceRef.current) }
  }, [companyInput, selectedCompanies])

  // Close company dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node) &&
        companyInputRef.current && !companyInputRef.current.contains(e.target as Node)
      ) {
        setShowCompanyDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function addCompany(company: CompanySuggestion) {
    if (!selectedCompanies.some(c => c.slug === company.slug && c.platform === company.platform)) {
      setSelectedCompanies(prev => [...prev, company])
    }
    setCompanyInput("")
    setCompanySuggestions([])
    setShowCompanyDropdown(false)
    companyInputRef.current?.focus()
  }

  function removeCompany(slug: string, platform: string) {
    setSelectedCompanies(prev => prev.filter(c => !(c.slug === slug && c.platform === platform)))
  }

  function handleCompanyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCompanyFocusedIdx(i => Math.min(i + 1, companySuggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCompanyFocusedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (companyFocusedIdx >= 0 && companySuggestions[companyFocusedIdx]) {
        addCompany(companySuggestions[companyFocusedIdx])
      }
    } else if (e.key === "Backspace" && companyInput === "" && selectedCompanies.length > 0) {
      const last = selectedCompanies[selectedCompanies.length - 1]
      removeCompany(last.slug, last.platform)
    } else if (e.key === "Escape") {
      setShowCompanyDropdown(false)
    }
  }

  function addTitle(title: string) {
    if (!selectedTitles.includes(title)) {
      setSelectedTitles(prev => [...prev, title])
    }
    setInputValue("")
    setSuggestions([])
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function removeTitle(title: string) {
    setSelectedTitles(prev => prev.filter(t => t !== title))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (focusedIdx >= 0 && suggestions[focusedIdx]) {
        addTitle(suggestions[focusedIdx])
      } else if (inputValue.trim()) {
        // Allow freeform entry if user types something not in the list
        addTitle(inputValue.trim())
      } else if (selectedTitles.length > 0) {
        handleSearch()
      }
    } else if (e.key === "Backspace" && inputValue === "" && selectedTitles.length > 0) {
      removeTitle(selectedTitles[selectedTitles.length - 1])
    } else if (e.key === "Escape") {
      setShowDropdown(false)
    }
  }

  async function handleSearch() {
    if (selectedTitles.length === 0 && selectedCompanies.length === 0) {
      setError("Enter at least one job title or company")
      return
    }
    setError("")
    setLoading(true)
    try {
      const keywords = selectedTitles.join(", ")
      const res = await searchJobs({
        keywords, location,
        adzunaAppId: adzunaId, adzunaAppKey: adzunaKey,
        useGreenhouse: useGH, useLever: useLV, useAshby: useAB,
        companies: selectedCompanies.length > 0 ? selectedCompanies : undefined,
      })
      onJobsFound(res.jobs)
      if (res.jobs.length === 0)
        setError(res.message ?? "No jobs found. Try different titles.")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

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
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Title tag input */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center",
              gap: 6, padding: "8px 12px",
              background: "var(--surface)",
              border: `2px solid ${titleFocused ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12, cursor: "text", minHeight: 48,
              transition: "border-color 0.15s",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            <SearchIcon size={15} color="var(--muted)" style={{ flexShrink: 0, marginRight: 2 }} />

            {selectedTitles.map(title => (
              <span key={title} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 20,
                background: "var(--accent)", color: "#fff",
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>
                {title}
                <button
                  onClick={e => { e.stopPropagation(); removeTitle(title) }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", padding: 0, opacity: 0.8 }}
                >
                  <XIcon size={12} />
                </button>
              </span>
            ))}

            <input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setTitleFocused(true)
                if (inputValue.trim() && suggestions.length > 0) setShowDropdown(true)
              }}
              onBlur={() => setTitleFocused(false)}
              placeholder={selectedTitles.length === 0 ? "Type a job title… e.g. ML Engineer" : "Add another title…"}
              style={{
                flex: 1, minWidth: 160, padding: "2px 0",
                background: "none", border: "none", outline: "none",
                fontSize: 14, color: "var(--text)",
              }}
            />
          </div>

          {/* Suggestions dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                zIndex: 50, overflow: "hidden",
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseDown={e => { e.preventDefault(); addTitle(s) }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 14px",
                    background: i === focusedIdx ? "var(--surface2)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontSize: 14, color: "var(--text)",
                    borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                  onMouseEnter={() => setFocusedIdx(i)}
                  onMouseLeave={() => setFocusedIdx(-1)}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SearchIcon size={13} color="var(--muted)" />
                    {s}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>↵</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center",
              gap: 6, padding: "8px 12px",
              background: "var(--surface)",
              border: `2px solid ${companyFocused ? "#0891b2" : "var(--border)"}`,
              borderRadius: 12, cursor: "text", minHeight: 48,
              transition: "border-color 0.15s",
            }}
            onClick={() => companyInputRef.current?.focus()}
          >
            <BuildingIcon size={15} color="var(--muted)" style={{ flexShrink: 0, marginRight: 2 }} />

            {selectedCompanies.map(c => (
              <span key={`${c.platform}-${c.slug}`} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 10px", borderRadius: 20,
                background: "#0891b2", color: "#fff",
                fontSize: 13, fontWeight: 600, flexShrink: 0,
              }}>
                {c.name}
                <button
                  onClick={e => { e.stopPropagation(); removeCompany(c.slug, c.platform) }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", padding: 0, opacity: 0.8 }}
                >
                  <XIcon size={12} />
                </button>
              </span>
            ))}

            <input
              ref={companyInputRef}
              value={companyInput}
              onChange={e => setCompanyInput(e.target.value)}
              onKeyDown={handleCompanyKeyDown}
              onFocus={() => {
                setCompanyFocused(true)
                if (companyInput.trim() && companySuggestions.length > 0) setShowCompanyDropdown(true)
              }}
              onBlur={() => setCompanyFocused(false)}
              placeholder={selectedCompanies.length === 0 ? "Company (optional)" : "Add company…"}
              style={{
                flex: 1, minWidth: 100, padding: "2px 0",
                background: "none", border: "none", outline: "none",
                fontSize: 14, color: "var(--text)",
              }}
            />
          </div>

          {showCompanyDropdown && companySuggestions.length > 0 && (
            <div
              ref={companyDropdownRef}
              style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                background: "var(--surface)", border: "1.5px solid var(--border)",
                borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                zIndex: 50, overflow: "hidden",
              }}
            >
              {companySuggestions.map((c, i) => (
                <button
                  key={`${c.platform}-${c.slug}`}
                  onMouseDown={e => { e.preventDefault(); addCompany(c) }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 14px",
                    background: i === companyFocusedIdx ? "var(--surface2)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontSize: 14, color: "var(--text)",
                    borderBottom: i < companySuggestions.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                  onMouseEnter={() => setCompanyFocusedIdx(i)}
                  onMouseLeave={() => setCompanyFocusedIdx(-1)}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <BuildingIcon size={13} color="var(--muted)" />
                    {c.name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                    background: c.platform === "greenhouse" ? "#dcfce7" : c.platform === "lever" ? "#dbeafe" : "#ede9fe",
                    color: c.platform === "greenhouse" ? "#15803d" : c.platform === "lever" ? "#1d4ed8" : "#6d28d9",
                  }}>
                    {c.platform}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSearch} disabled={loading} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 24px", borderRadius: 12, border: "none",
          background: loading ? "var(--surface2)" : "var(--accent)",
          color: loading ? "var(--muted)" : "#fff",
          fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s", flexShrink: 0, alignSelf: "flex-start",
          marginTop: 1,
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
          transition: "all 0.15s", flexShrink: 0, alignSelf: "flex-start",
          marginTop: 1,
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

      {/* Active filter pills */}
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

      {/* Filters dropdown panel */}
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
                <DropdownOption key={loc.value} label={loc.label}
                  active={location === loc.value} onClick={() => setLocation(loc.value)} />
              ))}
            </FilterGroup>

            <FilterGroup label="Experience level">
              {EXP_OPTIONS.map(opt => (
                <DropdownOption key={opt.value} label={opt.label} sub={opt.sub}
                  active={exp === opt.value} onClick={() => onExpChange(opt.value)} />
              ))}
            </FilterGroup>

            <FilterGroup label="Job type">
              {JOB_TYPE_OPTIONS.map(opt => (
                <DropdownOption key={opt.value} label={opt.label} sub={opt.sub}
                  active={jobType === opt.value} onClick={() => onJobTypeChange(opt.value)} />
              ))}
            </FilterGroup>

            <FilterGroup label="Date posted">
              {WITHIN_OPTIONS.map(opt => (
                <DropdownOption key={opt.value} label={opt.label}
                  active={within === opt.value} onClick={() => onWithinChange(opt.value)} />
              ))}
            </FilterGroup>

            <FilterGroup label="Visa sponsorship">
              {SPONSOR_OPTIONS.map(opt => (
                <DropdownOption key={opt.value} label={opt.label} sub={opt.sub}
                  active={sponsor === opt.value} onClick={() => onSponsorChange(opt.value)} />
              ))}
            </FilterGroup>

            <FilterGroup label="Sort by">
              {SORT_OPTIONS.map(opt => (
                <DropdownOption key={opt.value} label={opt.label}
                  active={sort === opt.value} onClick={() => onSortChange(opt.value)} />
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

            <FilterGroup label="Resume (rank by fit)">
              <textarea
                value={resumeText}
                onChange={e => { setResumeText(e.target.value); setResumeSaved(false) }}
                placeholder="Paste your resume text to rank jobs by how well they match. Then sort by 'Most relevant'."
                rows={5}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <button
                  onClick={handleSaveResume}
                  disabled={resumeSaved}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: resumeSaved ? "default" : "pointer",
                    background: resumeSaved ? "#dcfce7" : "var(--accent)",
                    color: resumeSaved ? "#15803d" : "#fff",
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  {resumeSaved ? "Saved ✓" : "Save resume"}
                </button>
                {resumeText && (
                  <button
                    onClick={() => { setResumeText(""); saveResume("").catch(() => {}); setResumeSaved(false) }}
                    style={{
                      padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
                      background: "none", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </FilterGroup>

          </div>

          <div style={{
            display: "flex", justifyContent: "flex-end", gap: 8,
            marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
          }}>
            <button onClick={() => {
              setLocation("United States")
              onExpChange("any"); onJobTypeChange("any")
              onWithinChange("any"); onSortChange("newest")
              onSponsorChange("any")
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
      cursor: "pointer", textAlign: "left", transition: "background 0.1s",
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
