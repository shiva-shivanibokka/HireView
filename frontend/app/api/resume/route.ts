import { NextRequest, NextResponse } from "next/server"
import { BACKEND } from "@/lib/backend"

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/resume`, { signal: AbortSignal.timeout(5_000) })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ text: "", has_resume: false, length: 0 }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData()
    const res  = await fetch(`${BACKEND}/api/resume`, { method: "POST", body })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save resume"
    return NextResponse.json({ detail: msg }, { status: 502 })
  }
}
