import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
		const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : ""
		if (!code) {
			return NextResponse.json({ error: "Access code is required" }, { status: 400 })
		}

		const admin = createAdminClient()
		const { data: profile, error: profileError } = await admin
			.from("profiles")
			.select("id, external_login_email, login_code")
			.eq("login_code", code)
			.maybeSingle()
		if (profileError || !profile?.external_login_email) {
			return NextResponse.json({ error: "Invalid or expired access code" }, { status: 401 })
		}
		const cookieStore = await cookies()
		const supabase = createClient(cookieStore)
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: profile.external_login_email,
			password: profile.login_code,
		})
		if (signInError) {
			return NextResponse.json({ error: "Sign in failed. The code may have been reset." }, { status: 401 })
		}
		return NextResponse.json({ ok: true })
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Sign in failed" },
			{ status: 500 }
		)
	}
}
