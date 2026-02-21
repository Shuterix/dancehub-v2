import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	const supabase = await createClient()
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

	let body: { partner1_user_id?: string; partner2_user_id?: string; name?: string | null }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const partner1_user_id = typeof body.partner1_user_id === "string" ? body.partner1_user_id.trim() : null
	const partner2_user_id = typeof body.partner2_user_id === "string" ? body.partner2_user_id.trim() : null
	const name = typeof body.name === "string" ? body.name.trim() || null : null

	if (!partner1_user_id || !partner2_user_id) {
		return NextResponse.json({ error: "partner1_user_id and partner2_user_id required" }, { status: 400 })
	}
	if (partner1_user_id === partner2_user_id) {
		return NextResponse.json({ error: "Partners must be different users" }, { status: 400 })
	}

	const studentIds = new Set((members ?? []).filter((m) => m.role === "student").map((m) => m.user_id))
	if (!studentIds.has(partner1_user_id) || !studentIds.has(partner2_user_id)) {
		return NextResponse.json({ error: "Both users must be students in your club" }, { status: 400 })
	}

	const { data: existingCouples } = await supabase
		.from("couples")
		.select("id, partner1_user_id, partner2_user_id")
		.eq("club_id", myProfile.club_id)

	const pairedIds = new Set<string>()
	for (const c of existingCouples ?? []) {
		if (c.partner1_user_id) pairedIds.add(c.partner1_user_id)
		if (c.partner2_user_id) pairedIds.add(c.partner2_user_id)
	}
	if (pairedIds.has(partner1_user_id) || pairedIds.has(partner2_user_id)) {
		return NextResponse.json({ error: "One or both users are already in a couple" }, { status: 400 })
	}

	const { data: newCouple, error: insertError } = await supabase
		.from("couples")
		.insert({
			club_id: myProfile.club_id,
			partner1_user_id,
			partner2_user_id,
			name,
		})
		.select("id")
		.single()

	if (insertError) {
		return NextResponse.json({ error: insertError.message }, { status: 500 })
	}
	return NextResponse.json({ id: newCouple?.id })
}
