import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: coupleId } = await params
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

	const { data: couple, error: fetchError } = await supabase
		.from("couples")
		.select("id, club_id")
		.eq("id", coupleId)
		.single()

	if (fetchError || !couple || couple.club_id !== myProfile.club_id) {
		return NextResponse.json({ error: "Couple not found" }, { status: 404 })
	}

	const { error: deleteError } = await supabase.from("couples").delete().eq("id", coupleId)

	if (deleteError) {
		return NextResponse.json({ error: deleteError.message }, { status: 500 })
	}
	return NextResponse.json({ ok: true })
}
