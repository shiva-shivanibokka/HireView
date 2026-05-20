"use client"

import { useState, useCallback } from "react"
import type { Job } from "@/lib/types"
import SearchBar from "./SearchBar"
import JobGrid from "./JobGrid"
import JobModal from "./JobModal"
import { BriefcaseIcon } from "lucide-react"

export type ExperienceLevel = "any" | "intern" | "newgrad" | "mid" | "senior" | "staff"
export type PostedWithin    = "any" | "7" | "14" | "30"
export type JobTypeFilter   = "any" | "full-time" | "part-time" | "contract" | "internship" | "remote" | "hybrid" | "onsite"

// Title signals checked first (higher confidence), then description year-range patterns.
const EXP_SIGNALS: Record<Exclude<ExperienceLevel, "any">, {
  title: string[]
  desc:  string[]
}> = {
  intern: {
    title: ["intern", "internship", "co-op", "coop", "placement", "werkstudent", "apprentice", "trainee"],
    desc:  ["internship program", "intern position", "summer internship", "intern role"],
  },
  newgrad: {
    title: ["junior", "jr.", "jr ", "associate", "entry level", "entry-level",
            "new grad", "new-grad", "graduate", "early career", "early-career",
            "level 1", "level i", " i ", "l1 "],
    desc:  ["0-2 year", "0 to 2 year", "1-2 year", "1 to 2 year",
            "less than 2 year", "no experience required", "recent graduate",
            "fresh graduate", "0+ year", "entry level", "new graduate",
            "bachelor.*recent", "degree required.*no experience"],
  },
  mid: {
    title: ["mid-level", "mid level", "midlevel", "intermediate",
            "level 2", "level ii", "level 3", "level iii", " ii ", " iii ", "l2 ", "l3 "],
    desc:  ["2\\+ year", "3\\+ year", "4\\+ year", "2-4 year", "2-5 year",
            "3-5 year", "3 to 5 year", "2 to 4 year", "2 to 5 year",
            "at least 2 year", "at least 3 year", "minimum 2 year", "minimum 3 year"],
  },
  senior: {
    title: ["senior", "sr\\.", "sr ", "level 4", "level iv", "level 5", "level v",
            " iv ", " v ", "l4 ", "l5 "],
    desc:  ["5\\+ year", "6\\+ year", "7\\+ year", "5-8 year", "5-7 year",
            "5 to 8 year", "6 to 8 year", "at least 5 year", "minimum 5 year",
            "minimum 6 year", "extensive experience"],
  },
  staff: {
    title: ["staff", "principal", " lead ", "tech lead", "director", "head of",
            "vp ", "vice president", "level 6", "level 7", "l6 ", "l7 ",
            "distinguished", "fellow"],
    desc:  ["8\\+ year", "9\\+ year", "10\\+ year", "8-12 year", "10 or more year",
            "decade.*experience", "at least 8 year", "minimum 8 year"],
  },
}

function classifyExperience(job: Job): Exclude<ExperienceLevel, "any"> | null {
  const title = ` ${job.title.toLowerCase()} `
  const desc  = (job.description || "").toLowerCase().slice(0, 3000)

  for (const level of ["intern", "newgrad", "mid", "senior", "staff"] as const) {
    const { title: titleKws, desc: descPatterns } = EXP_SIGNALS[level]

    if (titleKws.some(kw => title.includes(kw))) return level

    if (descPatterns.some(p => {
      try { return new RegExp(p).test(desc) } catch { return false }
    })) return level
  }

  return null
}

function matchesExperience(job: Job, level: ExperienceLevel): boolean {
  if (level === "any") return true
  return classifyExperience(job) === level
}

function matchesJobType(job: Job, filter: JobTypeFilter): boolean {
  if (filter === "any") return true
  if (filter === "remote" || filter === "hybrid" || filter === "onsite") {
    if (job.workplace) return job.workplace === filter
    const loc = job.location.toLowerCase()
    if (filter === "remote") return loc.includes("remote")
    if (filter === "hybrid") return loc.includes("hybrid")
    // Only classify as onsite if the location gives a positive signal — never assume
    if (filter === "onsite") return loc.length > 0 && !loc.includes("remote") && !loc.includes("hybrid")
  }
  if (job.job_type) return job.job_type === filter
  const title = job.title.toLowerCase()
  if (filter === "internship") return title.includes("intern")
  if (filter === "part-time")  return title.includes("part-time") || title.includes("part time")
  if (filter === "contract")   return title.includes("contract") || title.includes("consultant")
  if (filter === "full-time")  return !title.includes("intern") && !title.includes("part-time") && !title.includes("contract")
  return true
}

function matchesPostedWithin(job: Job, within: PostedWithin): boolean {
  if (within === "any") return true
  const date = job.posted_at || job.scraped_at
  if (!date) return true
  const days = (Date.now() - new Date(date).getTime()) / 86400000
  return days <= parseInt(within, 10)
}

export default function HireView() {
  const [jobs, setJobs]         = useState<Job[]>([])
  const [selected, setSelected] = useState<Job | null>(null)
  const [sort, setSort]         = useState<"newest" | "relevance">("newest")
  const [exp, setExp]           = useState<ExperienceLevel>("any")
  const [within, setWithin]     = useState<PostedWithin>("any")
  const [jobType, setJobType]   = useState<JobTypeFilter>("any")
  const [searched, setSearched] = useState(false)

  const handleJobsFound = useCallback((found: Job[]) => {
    setJobs(found)
    setSearched(true)
  }, [])

  const handleStatusChange = useCallback((jobId: string, status: Job["status"]) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
    if (status === "dismissed") setSelected(null)
  }, [])

  const visible = jobs
    .filter(j => j.status !== "dismissed")
    .filter(j => matchesExperience(j, exp))
    .filter(j => matchesJobType(j, jobType))
    .filter(j => matchesPostedWithin(j, within))
    .sort((a, b) => {
      if (sort === "newest") {
        const da = a.posted_at || a.scraped_at
        const db = b.posted_at || b.scraped_at
        return new Date(db || 0).getTime() - new Date(da || 0).getTime()
      }
      return b.match_score - a.match_score
    })

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 32px",
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "sticky",
        top: 0,
        zIndex: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            background: "var(--accent)", borderRadius: 8,
            width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BriefcaseIcon size={15} color="#fff" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.4px", color: "var(--accent)" }}>
            HireView
          </span>
        </div>
        {searched && jobs.length > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: 13, color: "var(--muted)",
            background: "var(--surface2)", padding: "3px 10px",
            borderRadius: 20, border: "1px solid var(--border)",
          }}>
            {visible.length} jobs
          </span>
        )}
      </header>

      <div style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "20px 32px",
      }}>
        <SearchBar
          onJobsFound={handleJobsFound}
          sort={sort}
          onSortChange={setSort}
          exp={exp}
          onExpChange={setExp}
          jobType={jobType}
          onJobTypeChange={setJobType}
          within={within}
          onWithinChange={setWithin}
        />
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {!searched ? (
          <EmptyState />
        ) : visible.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "60px 0", fontSize: 15 }}>
            No jobs found. Try different keywords.
          </div>
        ) : (
          <JobGrid
            jobs={visible}
            onSelect={setSelected}
            onDismiss={(id) => handleStatusChange(id, "dismissed")}
          />
        )}
      </div>

      {selected && (
        <JobModal
          job={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(status) => handleStatusChange(selected.id, status)}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "80px 0" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 64, height: 64, borderRadius: 16,
        background: "linear-gradient(135deg, #eef1fb, #e0e4ff)",
        marginBottom: 16,
      }}>
        <BriefcaseIcon size={28} color="var(--accent)" strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
        Find your next role
      </div>
      <div style={{ fontSize: 14, color: "var(--muted)" }}>
        Search across Greenhouse, Lever, and Ashby — hundreds of companies at once
      </div>
    </div>
  )
}
