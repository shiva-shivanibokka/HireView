import { NextRequest, NextResponse } from "next/server"
import { BACKEND } from "@/lib/backend"

// No timeout on Next.js route handlers — this is the fix for long-running searches
export const maxDuration = 120  // seconds (Vercel/Next limit, local has no limit)

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData()
    const res  = await fetch(`${BACKEND}/api/search`, {
      method:  "POST",
      body,
      signal: AbortSignal.timeout(115_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Search failed"
    return NextResponse.json({ detail: msg }, { status: 502 })
  }
}
