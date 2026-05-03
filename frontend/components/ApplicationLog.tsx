"use client"

import { useState, useEffect, useCallback } from "react"
import type { Application } from "@/lib/types"
import { getApplications } from "@/lib/api"
import { ClipboardListIcon, LoaderIcon, BuildingIcon, CalendarIcon, RefreshCwIcon } from "lucide-react"

export default function ApplicationLog() {
  const [apps, setApps]       = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const r = await getApplications()
      setApps(r.applications)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function formatDate(isoStr: string): string {
    // Append Z so browsers parse it as UTC, not ambiguous local time
    const d = new Date(isoStr.endsWith("Z") ? isoStr : `${isoStr}Z`)
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontWeight: 700, fontSize: 18 }}>Application History</h2>
        <button onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none",
            color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>
          {loading ? <LoaderIcon size={14} className="spin" /> : <RefreshCwIcon size={14} />}
          Refresh
        </button>
      </div>

      {error && <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading && apps.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", padding: 32 }}>
          <LoaderIcon size={16} className="spin" /> Loading…
        </div>
      ) : apps.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          color: "var(--muted)", padding: 64 }}>
          <ClipboardListIcon size={40} strokeWidth={1.2} />
          <p>No applications yet. Autofill a job to see history here.</p>
        </div>
      ) : (
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
                  <CalendarIcon size={12} /> {formatDate(app.filled_at)}
                </span>
              </div>
              {app.notes && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{app.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
