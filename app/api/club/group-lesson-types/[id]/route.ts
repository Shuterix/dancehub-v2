import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

async function getClubAndAuth(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (!myProfile?.club_id) return { error: NextResponse.json({ error: "No club" }, { status: 404 }) }

	const { data: members } = await supabase
		.from("club_members")
		.select("user_id, role")
		.eq("club_id", myProfile.club_id)
	const isTrainer = (members ?? []).some((m) => m.user_id === user.id && m.role === "trainer")

	return { user, clubId: myProfile.club_id, isTrainer }
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: typeId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: existing, error: fetchError } = await supabase
		.from("group_lesson_types")
		.select("id, group_id")
		.eq("id", typeId)
		.eq("club_id", clubId)
		.single()

	if (fetchError || !existing) {
		return NextResponse.json({ error: "Lesson type not found" }, { status: 404 })
	}

	let body: { name?: string; duration_minutes?: number; group_id?: string }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const updates: { name?: string; duration_minutes?: number; group_id?: string } = {}

	if (typeof body.name === "string") {
		const name = body.name.trim()
		if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
		updates.name = name
	}
	if (typeof body.duration_minutes === "number" || (typeof body.duration_minutes === "string" && body.duration_minutes !== "")) {
		const duration = Number(body.duration_minutes)
		if (!Number.isInteger(duration) || duration < 1) {
			return NextResponse.json({ error: "Duration must be a positive number of minutes" }, { status: 400 })
		}
		updates.duration_minutes = duration
	}
	if (typeof body.group_id === "string" && body.group_id.trim() !== "") {
		const { data: group } = await supabase
			.from("groups")
			.select("id")
			.eq("id", body.group_id.trim())
			.eq("club_id", clubId)
			.single()
		if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
		updates.group_id = group.id
	}

	if (Object.keys(updates).length === 0) {
		return NextResponse.json({ ok: true })
	}

	const { error: updateError } = await supabase
		.from("group_lesson_types")
		.update(updates)
		.eq("id", typeId)

	if (updateError) {
		return NextResponse.json({ error: updateError.message }, { status: 500 })
	}
	return NextResponse.json({ ok: true })
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: typeId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: existing, error: fetchError } = await supabase
		.from("group_lesson_types")
		.select("id")
		.eq("id", typeId)
		.eq("club_id", clubId)
		.single()

	if (fetchError || !existing) {
		return NextResponse.json({ error: "Lesson type not found" }, { status: 404 })
	}

	const { error: deleteError } = await supabase
		.from("group_lesson_types")
		.delete()
		.eq("id", typeId)

	if (deleteError) {
		return NextResponse.json({ error: deleteError.message }, { status: 500 })
	}
	return NextResponse.json({ ok: true })
}
