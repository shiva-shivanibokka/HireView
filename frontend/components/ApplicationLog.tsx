"use client"

import { useState, useEffect } from "react"
import type { Application } from "@/lib/types"
import { getApplications } from "@/lib/api"
import { ClipboardListIcon, LoaderIcon, BuildingIcon, CalendarIcon } from "lucide-react"

export default function ApplicationLog() {
  const [apps, setApps]       = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    getApplications()
      .then(r => setApps(r.applications))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", padding: 32 }}>
      <LoaderIcon size={16} className="spin" /> Loading applications…
    </div>
  )

  if (error) return <div style={{ color: "var(--red)", padding: 32 }}>{error}</div>

  if (apps.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      color: "var(--muted)", padding: 64 }}>
      <ClipboardListIcon size={40} strokeWidth={1.2} />
      <p>No applications yet. Autofill a job to see history here.</p>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Application History</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {apps.map(app => (
          <div key={app.id} style={{
            background: "var(--surface)", borderRadius: 10, padding: 16,
            border: "1px solid var(--border)",
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{app.job_title}</div>
            <div style={{ display: "flex", gap: 16, marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <BuildingIcon size={12} /> {app.company}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <CalendarIcon size={12} /> {new Date(app.filled_at).toLocaleDateString()}
              </span>
            </div>
            {app.notes && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{app.notes}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
