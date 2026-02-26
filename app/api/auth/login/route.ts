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
		const body = await request.json()
		const { email, password } = body as { email?: string; password?: string }

		if (!email || !password) return NextResponse.json({ error: "Missing email or password" }, { status: 400 })

		const cookieStore = await cookies()
		const supabase = createClient(cookieStore)
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		})

		if (error) return NextResponse.json({ error: error.message }, { status: 400 })
		// Session is stored in cookies automatically by the server client
		return NextResponse.json({ ok: true, message: "User logged in successfully", user: data.user?.id })
	} catch {
		return NextResponse.json({ error: "Login failed" }, { status: 500 })
	}
}
