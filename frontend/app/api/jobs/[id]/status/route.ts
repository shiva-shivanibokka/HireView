import { NextRequest, NextResponse } from "next/server"

const BACKEND = "http://localhost:8000"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.formData()
    const res  = await fetch(`${BACKEND}/api/jobs/${id}/status`, {
      method: "PATCH",
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update status"
    return NextResponse.json({ detail: msg }, { status: 502 })
  }
}
