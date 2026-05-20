import { NextRequest, NextResponse } from "next/server"

const BACKEND = "http://localhost:8000"

export async function GET(req: NextRequest) {
  try {
    const q     = req.nextUrl.searchParams.get("q") ?? ""
    const limit = req.nextUrl.searchParams.get("limit") ?? "10"
    const res   = await fetch(
      `${BACKEND}/api/companies?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: AbortSignal.timeout(5_000) }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ companies: [] }, { status: 200 })
  }
}
