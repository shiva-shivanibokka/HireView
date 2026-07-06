"use client"

import type { Job } from "@/lib/types"
import { PIPELINE_STAGES, STATUS_META } from "@/lib/status"
import JobGrid from "./JobGrid"
import { LoaderIcon, InboxIcon } from "lucide-react"

interface Props {
  jobs:           Job[]
  loading:        boolean
  onSelect:       (job: Job) => void
  onStatusChange: (id: string, status: Job["status"]) => void
}

export default function PipelineBoard({ jobs, loading, onSelect, onStatusChange }: Props) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "60px 0", color: "var(--muted)" }}>
        <LoaderIcon size={24} className="spin" color="var(--accent)" />
        <span style={{ fontSize: 13 }}>Loading your pipeline…</span>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 0", color: "var(--muted)", textAlign: "center" }}>
        <InboxIcon size={30} color="var(--muted)" />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Your pipeline is empty</div>
        <div style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.6 }}>
          Search for jobs, then track ones you like — Save, Applied, Interviewing — and they’ll show up here, grouped by stage.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {PIPELINE_STAGES.map(stage => {
        const inStage = jobs.filter(j => j.status === stage)
        if (inStage.length === 0) return null
        const meta = STATUS_META[stage]
        return (
          <section key={stage}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                fontSize: 13, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
                background: meta.bg, color: meta.color,
              }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                {inStage.length}
              </span>
            </div>
            <JobGrid
              jobs={inStage}
              onSelect={onSelect}
              onDismiss={id => onStatusChange(id, "dismissed")}
            />
          </section>
        )
      })}
    </div>
  )
}
