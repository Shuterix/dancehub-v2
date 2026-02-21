import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email, password } = body as { email?: string; password?: string }

		if (!email || !password) return NextResponse.json({ error: "Missing email or password" }, { status: 400 })

		const supabase = await createClient()
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