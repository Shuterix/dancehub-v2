import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { checkAuthRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
	if (!checkAuthRateLimit(request)) {
		return NextResponse.json(
			{ error: "Too many attempts. Please try again in a minute." },
			{ status: 429 }
		)
	}
	try {
		const body = await request.json()
		const { email, password, name } = body as { email?: string; password?: string; name?: string }

		if (!email || !password || !name) {
			return NextResponse.json({ error: "Missing email, password, or name" }, { status: 400 })
		}

		const { data, error } = await supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { full_name: name },
		})

		if (error) return NextResponse.json({ error: error.message }, { status: 400 })
		return NextResponse.json({ ok: true, message: "User registered successfully", user: data.user?.id })
	} catch {
		return NextResponse.json({ error: "Registration failed" }, { status: 500 })
	}
}