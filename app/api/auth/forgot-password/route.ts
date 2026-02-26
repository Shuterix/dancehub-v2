import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { checkAuthRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
	if (!checkAuthRateLimit(request)) {
		return NextResponse.json(
			{ error: "Too many attempts. Please try again in a minute." },
			{ status: 429 }
		)
	}
	try {
		const body = await request.json().catch(() => ({}))
		const email = typeof body?.email === "string" ? body.email.trim() : ""
		if (!email) {
			return NextResponse.json({ error: "Email is required." }, { status: 400 })
		}

		const cookieStore = await cookies()
		const supabase = createClient(cookieStore)
		const origin = request.headers.get("origin") ?? new URL(request.url).origin
		const redirectTo = `${origin}/auth/reset-password`

		await supabase.auth.resetPasswordForEmail(email, {
			redirectTo,
		})
		// Always return the same message so we don't reveal whether the email exists
		return NextResponse.json({
			ok: true,
			message: "If an account exists for this email, you will receive a password reset link.",
		})
	} catch {
		return NextResponse.json({ error: "Request failed. Try again later." }, { status: 500 })
	}
}
