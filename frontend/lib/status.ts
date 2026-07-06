import type { Job } from "./types"

// Single source of truth for the application-pipeline funnel.
// "new" = untracked (no badge); "dismissed" = hidden from the grid.
export const PIPELINE_STAGES: Job["status"][] = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
]

export const STATUS_META: Record<Job["status"], { label: string; bg: string; color: string }> = {
  new:          { label: "New",          bg: "#f3f4f6", color: "#6b7280" },
  saved:        { label: "Saved",        bg: "#eef1fb", color: "#5b5ef4" },
  applied:      { label: "Applied",      bg: "#dbeafe", color: "#1d4ed8" },
  interviewing: { label: "Interviewing", bg: "#fef3c7", color: "#92400e" },
  offer:        { label: "Offer",        bg: "#dcfce7", color: "#15803d" },
  rejected:     { label: "Rejected",     bg: "#fee2e2", color: "#b91c1c" },
  dismissed:    { label: "Dismissed",    bg: "#f3f4f6", color: "#9ca3af" },
}
