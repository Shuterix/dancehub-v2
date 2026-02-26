import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const body = await request.json().catch(() => ({}))
	const name = (body?.name as string)?.trim()
	if (!name) {
		return NextResponse.json({ error: "Club name is required." }, { status: 400 })
	}

	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	let club: { id: string } | null = null
	let createdCode: string | null = null
	let insertError: { message: string } | null = null
	for (let attempt = 0; attempt < 3; attempt++) {
		const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
		const result = await supabase
			.from("clubs")
			.insert({ name, code, created_by: user.id })
			.select("id")
			.single()
		if (!result.error) {
			club = result.data
			createdCode = code
			break
		}
		if (result.error.code !== "23505") {
			insertError = result.error
			break
		}
	}
	if (insertError || !club) {
		return NextResponse.json({ error: insertError?.message ?? "Failed to create club. Try again." }, { status: 500 })
	}

	const { error: memberError } = await supabase
		.from("club_members")
		.insert({ club_id: club.id, user_id: user.id, role: "trainer" })

	if (memberError) {
		return NextResponse.json({ error: memberError.message }, { status: 500 })
	}

	const { error: profileUpdateError } = await supabase
		.from("profiles")
		.update({ club_id: club.id, onboarding_completed: true })
		.eq("id", user.id)

	if (profileUpdateError) {
		return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
	}

	return NextResponse.json({ ok: true, club_id: club.id, code: createdCode })
}
