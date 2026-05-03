"use client"

import { useState, useCallback } from "react"
import type { Job, GenerateResult, JobGenState, UserProfile } from "@/lib/types"
import SearchPanel from "./SearchPanel"
import JobList from "./JobList"
import JobDetail from "./JobDetail"
import ApplicationLog from "./ApplicationLog"
import { BriefcaseIcon, ClipboardListIcon, SearchIcon } from "lucide-react"

type Tab = "search" | "applications"

export default function AutoApplyApp() {
  const [tab, setTab]                   = useState<Tab>("search")
  const [jobs, setJobs]                 = useState<Job[]>([])
  const [selectedJob, setSelectedJob]   = useState<Job | null>(null)
  const [genStates, setGenStates]       = useState<Record<string, JobGenState>>({})
  const [resumeFile, setResumeFile]     = useState<File | null>(null)   // shared across panels
  const [profile, setProfile]           = useState<UserProfile>({
    name: "", email: "", phone: "", linkedin_url: "",
    github_url: "", address: "", current_company: "",
  })

  const handleJobsFound = useCallback((found: Job[]) => {
    setJobs(found)
    setSelectedJob(found[0] ?? null)
  }, [])

  const handleSelectJob = useCallback((job: Job) => {
    setSelectedJob(job)
  }, [])

  const handleGenState = useCallback((jobId: string, state: Partial<JobGenState>) => {
    setGenStates(prev => ({
      ...prev,
      [jobId]: { ...prev[jobId], loading: false, progress: [], result: null, error: null, ...state },
    }))
  }, [])

  // Update job status in local state after generation / dismiss
  const handleJobStatusChange = useCallback((jobId: string, status: Job["status"]) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
    setSelectedJob(prev => prev?.id === jobId ? { ...prev, status } : prev)
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 24px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <BriefcaseIcon size={22} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>
          AutoApply Job Agent
        </span>

        <div style={{ display: "flex", gap: 4, marginLeft: 24 }}>
          {([
            ["search",       "Job Search",   SearchIcon],
            ["applications", "Applications", ClipboardListIcon],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, border: "none",
              cursor: "pointer", fontSize: 13, fontWeight: 500,
              background: tab === id ? "var(--accent)" : "transparent",
              color: tab === id ? "#fff" : "var(--muted)",
              transition: "all 0.15s",
            }}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {jobs.length > 0 && `${jobs.length} jobs found`}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      {tab === "search" ? (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left — search + job list */}
          <div style={{
            width: 380, flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <SearchPanel
              profile={profile}
              onProfileChange={setProfile}
              onJobsFound={handleJobsFound}
              resumeFile={resumeFile}
              onResumeFile={setResumeFile}
            />
            <div style={{ flex: 1, overflowY: "auto" }}>
              <JobList
                jobs={jobs}
                selectedId={selectedJob?.id ?? null}
                genStates={genStates}
                onSelect={handleSelectJob}
                onDismiss={(jobId) => handleJobStatusChange(jobId, "dismissed")}
              />
            </div>
          </div>

          {/* Right — job detail */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {selectedJob ? (
              <JobDetail
                job={selectedJob}
                profile={profile}
                resumeFile={resumeFile}
                genState={genStates[selectedJob.id] ?? { loading: false, progress: [], result: null, error: null }}
                onGenState={(state) => handleGenState(selectedJob.id, state)}
                onStatusChange={(status) => handleJobStatusChange(selectedJob.id, status)}
              />
            ) : (
              <Empty />
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <ApplicationLog />
        </div>
      )}
    </div>
  )
}

function Empty() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", gap: 12,
      color: "var(--muted)",
    }}>
      <BriefcaseIcon size={40} strokeWidth={1.2} />
      <p style={{ fontSize: 14 }}>Search for jobs to get started</p>
    </div>
  )
}
