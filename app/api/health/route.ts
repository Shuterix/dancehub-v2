import { NextResponse } from "next/server"

/** Simple health check for monitoring and deploy verification. */
export async function GET() {
	return NextResponse.json({ ok: true, status: "healthy" })
}
