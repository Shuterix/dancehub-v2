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

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()

	if (!myProfile?.club_id) {
		return NextResponse.json({ error: "No club" }, { status: 404 })
	}

	const { data: members } = await supabase
		.from("club_members")
		.select("user_id, role")
		.eq("club_id", myProfile.club_id)

	const isTrainer = (members ?? []).some((m) => m.user_id === user.id && m.role === "trainer")
	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	let body: { name?: string }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const name = typeof body.name === "string" ? body.name.trim() : ""
	if (!name) {
		return NextResponse.json({ error: "Group name is required" }, { status: 400 })
	}

	const { data: newGroup, error: insertError } = await supabase
		.from("groups")
		.insert({ club_id: myProfile.club_id, name })
		.select("id")
		.single()

	if (insertError) {
		return NextResponse.json({ error: insertError.message }, { status: 500 })
	}
	return NextResponse.json({ id: newGroup?.id })
}
