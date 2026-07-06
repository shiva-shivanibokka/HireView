import type { Job } from "./types"

export type Sponsorship = "likely" | "unlikely" | "unknown"

// Phrases that signal a role will NOT sponsor a work visa. Checked first — an
// explicit "no sponsorship" always wins over a generic "visa" mention.
const NEGATIVE = [
  "no sponsorship", "not sponsor", "cannot sponsor", "can not sponsor",
  "unable to sponsor", "not able to sponsor", "without sponsorship",
  "do not provide sponsorship", "does not provide sponsorship",
  "not provide visa", "no visa sponsorship", "sponsorship is not available",
  "must be authorized to work in the united states",
  "authorized to work in the us without", "us citizen", "u.s. citizen",
  "citizenship is required", "security clearance",
]

const POSITIVE = [
  "visa sponsorship", "will sponsor", "sponsorship available",
  "provide sponsorship", "offer sponsorship", "sponsor visa",
  "h-1b", "h1b", "open to sponsor", "eligible for sponsorship",
]

// ponytail: keyword heuristic over whatever description text we have. Descriptions
// are sparse until fetched, so most jobs read "unknown" until opened — honest
// ceiling. Upgrade path: run this server-side after fetch-description and persist.
export function sponsorshipSignal(text: string): Sponsorship {
  const t = (text || "").toLowerCase()
  if (!t) return "unknown"
  if (NEGATIVE.some(p => t.includes(p))) return "unlikely"
  if (POSITIVE.some(p => t.includes(p))) return "likely"
  return "unknown"
}

export type SponsorshipFilter = "any" | "friendly" | "only"

export function matchesSponsorship(job: Job, filter: SponsorshipFilter): boolean {
  if (filter === "any") return true
  const signal = sponsorshipSignal(job.description)
  if (filter === "friendly") return signal !== "unlikely"  // hide explicit no-sponsor
  return signal === "likely"                                // only explicit sponsors
}
