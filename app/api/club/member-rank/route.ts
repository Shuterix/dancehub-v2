import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

const RANKS = ["E", "D", "C", "B", "A", "S"] as const

export async function PATCH(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	let body: { user_id?: string; rank_standard?: string | null; rank_latin?: string | null }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const { user_id: targetUserId, rank_standard, rank_latin } = body
	if (!targetUserId || typeof targetUserId !== "string") {
		return NextResponse.json({ error: "user_id is required" }, { status: 400 })
	}

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()

	if (!myProfile?.club_id) {
		return NextResponse.json({ error: "No club" }, { status: 404 })
	}

	const { data: myMember } = await supabase
		.from("club_members")
		.select("role")
		.eq("club_id", myProfile.club_id)
		.eq("user_id", user.id)
		.maybeSingle()

	if (myMember?.role !== "trainer") {
		return NextResponse.json({ error: "Only trainers can update member ranks" }, { status: 403 })
	}

	const { data: targetMember } = await supabase
		.from("club_members")
		.select("role")
		.eq("club_id", myProfile.club_id)
		.eq("user_id", targetUserId)
		.maybeSingle()

	if (!targetMember || targetMember.role !== "student") {
		return NextResponse.json({ error: "User is not a student in your club" }, { status: 400 })
	}

	const updates: { rank_standard?: string | null; rank_latin?: string | null } = {}
	if (rank_standard !== undefined) {
		updates.rank_standard =
			rank_standard === null || rank_standard === ""
				? null
				: RANKS.includes(rank_standard as (typeof RANKS)[number])
					? rank_standard
					: undefined
		if (updates.rank_standard === undefined) {
			return NextResponse.json({ error: "Invalid rank_standard" }, { status: 400 })
		}
	}
	if (rank_latin !== undefined) {
		updates.rank_latin =
			rank_latin === null || rank_latin === ""
				? null
				: RANKS.includes(rank_latin as (typeof RANKS)[number])
					? rank_latin
					: undefined
		if (updates.rank_latin === undefined) {
			return NextResponse.json({ error: "Invalid rank_latin" }, { status: 400 })
		}
	}

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ error: "Provide rank_standard and/or rank_latin" }, { status: 400 })
	}

	const { error: updateError } = await supabase
		.from("profiles")
		.update(updates)
		.eq("id", targetUserId)

	if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
	return NextResponse.json({ ok: true })
}
