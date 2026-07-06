"use client"

import React from "react"
import type { Job } from "@/lib/types"
import { STATUS_META } from "@/lib/status"
import { MapPinIcon, BuildingIcon, ExternalLinkIcon, XIcon } from "lucide-react"

interface Props {
  jobs:      Job[]
  onSelect:  (job: Job) => void
  onDismiss: (id: string) => void
}

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  greenhouse: { bg: "#dcfce7", color: "#15803d", label: "Greenhouse" },
  lever:      { bg: "#dbeafe", color: "#1d4ed8", label: "Lever"      },
  ashby:      { bg: "#ede9fe", color: "#6d28d9", label: "Ashby"      },
  adzuna:     { bg: "#fef3c7", color: "#92400e", label: "Adzuna"     },
}

const CARD_ACCENTS = [
  "var(--accent)",
  "var(--teal)",
  "var(--pink)",
  "var(--violet)",
  "#0e9f6e",
  "#d97706",
]

export default function JobGrid({ jobs, onSelect, onDismiss }: Props) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
      gap: 16,
    }}>
      {jobs.map((job, i) => (
        <JobCard
          key={job.id}
          job={job}
          accent={CARD_ACCENTS[i % CARD_ACCENTS.length]}
          onSelect={onSelect}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

function JobCard({ job, accent, onSelect, onDismiss }: {
  job: Job
  accent: string
  onSelect: (job: Job) => void
  onDismiss: (id: string) => void
}) {
  const src = SOURCE_STYLES[job.source] ?? { bg: "#f3f4f6", color: "#6b7280", label: job.source }
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      onClick={() => onSelect(job)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        border: `1.5px solid ${hovered ? accent : "var(--border)"}`,
        padding: 0,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        boxShadow: hovered
          ? `0 6px 24px ${accent}22`
          : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ height: 4, background: accent }} />

      <div style={{ padding: "14px 16px 16px" }}>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(job.id) }}
          style={{
            position: "absolute", top: 10, right: 10,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s", display: "flex", alignItems: "center",
            padding: 4, borderRadius: 6,
          }}
          title="Dismiss"
        >
          <XIcon size={13} />
        </button>

        <div style={{ marginBottom: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
            background: src.bg, color: src.color,
          }}>
            {src.label}
          </span>
          {job.status !== "new" && job.status !== "dismissed" && (
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              padding: "2px 8px", borderRadius: 6,
              background: STATUS_META[job.status].bg, color: STATUS_META[job.status].color,
            }}>
              {STATUS_META[job.status].label}
            </span>
          )}
          {job.is_new && job.status === "new" && (
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              padding: "2px 8px", borderRadius: 6,
              background: "#dcfce7", color: "#15803d",
            }}>
              New
            </span>
          )}
        </div>

        <div style={{
          fontWeight: 700, fontSize: 15, lineHeight: 1.35,
          color: "var(--text)", marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {job.title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--muted)" }}>
            <BuildingIcon size={12} color={accent} /> {job.company}
          </span>
          {job.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}>
              <MapPinIcon size={12} /> {job.location}
            </span>
          )}
        </div>

        {job.required_skills.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {job.required_skills.slice(0, 4).map(s => (
              <span key={s} style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4,
                background: "var(--surface2)", color: "var(--muted)",
                border: "1px solid var(--border)", fontWeight: 500,
              }}>
                {s}
              </span>
            ))}
            {job.required_skills.length > 4 && (
              <span style={{ fontSize: 10, color: "var(--muted)", padding: "2px 0" }}>
                +{job.required_skills.length - 4}
              </span>
            )}
          </div>
        )}

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 10, borderTop: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              {job.workplace && <TypeBadge label={job.workplace} />}
              {job.job_type  && <TypeBadge label={job.job_type}  />}
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
              {job.posted_at ? `Posted ${timeAgo(job.posted_at)}` : ""}
            </span>
          </div>
      </div>
    </div>
  )
}

const TYPE_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  remote:      { bg: "#dcfce7", color: "#15803d" },
  hybrid:      { bg: "#dbeafe", color: "#1d4ed8" },
  onsite:      { bg: "#f3f4f6", color: "#374151" },
  "full-time": { bg: "#eef1fb", color: "#5b5ef4" },
  "part-time": { bg: "#fef3c7", color: "#92400e" },
  contract:    { bg: "#fce7f3", color: "#9d174d" },
  internship:  { bg: "#ede9fe", color: "#6d28d9" },
}

function TypeBadge({ label }: { label: string }) {
  const style = TYPE_BADGE_COLORS[label.toLowerCase()] ?? { bg: "#f3f4f6", color: "#6b7280" }
  const display = label.charAt(0).toUpperCase() + label.slice(1)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: style.bg, color: style.color,
    }}>
      {display}
    </span>
  )
}

function timeAgo(iso: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  if (isNaN(diff)) return ""
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  if (mins < 1)    return "just now"
  if (mins < 60)   return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days < 7)    return `${days}d ago`
  if (days < 30)   return `${weeks}w ago`
  if (months < 12) return `${months}mo ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}
