import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email, password, full_name } = body as {
			email?: string
			password?: string
			full_name?: string
		}

		if (!email || !password) {
			return NextResponse.json({ error: "Missing email or password" }, { status: 400 })
		}

		const supabase = await createClient()
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: { data: { full_name: full_name?.trim() ?? "" } },
		})

		if (error) return NextResponse.json({ error: error.message }, { status: 400 })
		// If email confirmation is enabled, user may not have session yet
		return NextResponse.json({
			ok: true,
			user: data.user?.id,
			session: !!data.session,
		})
	} catch {
		return NextResponse.json({ error: "Sign up failed" }, { status: 500 })
	}
}
