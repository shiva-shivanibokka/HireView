import { NextRequest, NextResponse } from "next/server"
import { BACKEND } from "@/lib/backend"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res  = await fetch(`${BACKEND}/api/jobs/${id}/fetch-description`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch description"
    return NextResponse.json({ detail: msg }, { status: 502 })
  }
}
