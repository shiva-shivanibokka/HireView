"use client"

import type { Job, JobGenState } from "@/lib/types"
import { MapPinIcon, BuildingIcon, CheckCircleIcon, LoaderIcon } from "lucide-react"

interface Props {
  jobs:       Job[]
  selectedId: string | null
  genStates:  Record<string, JobGenState>
  onSelect:   (job: Job) => void
}

export default function JobList({ jobs, selectedId, genStates, onSelect }: Props) {
  if (jobs.length === 0) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        No jobs yet. Run a search above.
      </div>
    )
  }

  return (
    <div>
      {jobs.map(job => {
        const gs = genStates[job.id]
        const isSelected = job.id === selectedId
        const score = Math.round(job.match_score * 100)

        return (
          <div key={job.id} onClick={() => onSelect(job)}
            style={{
              padding: "12px 16px", cursor: "pointer",
              borderBottom: "1px solid var(--border)",
              background: isSelected ? "var(--surface2)" : "transparent",
              borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface)" }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent" }}
          >
            {/* Title + score */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, flex: 1 }}>
                {job.title}
              </div>
              <ScoreBadge score={score} />
            </div>

            {/* Company + location */}
            <div style={{ display: "flex", gap: 12, marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <BuildingIcon size={11} /> {job.company}
              </span>
              {job.location && (
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <MapPinIcon size={11} /> {job.location}
                </span>
              )}
            </div>

            {/* Status tags */}
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <SourceTag source={job.source} />
              {job.status === "filled" && (
                <Tag color="var(--green)" bg="#052e16">
                  <CheckCircleIcon size={10} /> Applied
                </Tag>
              )}
              {job.status === "generated" && (
                <Tag color="var(--accent)" bg="#1e1b4b">
                  Resume ready
                </Tag>
              )}
              {gs?.loading && (
                <Tag color="var(--yellow)" bg="#422006">
                  <LoaderIcon size={10} /> Generating…
                </Tag>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "var(--green)" : score >= 45 ? "var(--yellow)" : "var(--muted)"
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color,
      background: "var(--surface)", border: `1px solid ${color}`,
      borderRadius: 4, padding: "2px 6px", flexShrink: 0,
    }}>
      {score}%
    </div>
  )
}

function SourceTag({ source }: { source: string }) {
  const colors: Record<string, string> = {
    greenhouse: "#166534", lever: "#1e3a5f", ashby: "#3b1f5e", adzuna: "#3f2a00",
  }
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
      background: colors[source] ?? "var(--surface2)",
      color: "var(--text)", textTransform: "capitalize",
    }}>
      {source}
    </span>
  )
}

function Tag({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 3,
      fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
      background: bg, color,
    }}>
      {children}
    </span>
  )
}
