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

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: roomId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: room, error: roomError } = await supabase
		.from("rooms")
		.select("id, name")
		.eq("id", roomId)
		.eq("club_id", clubId)
		.single()

	if (roomError || !room) {
		return NextResponse.json({ error: "Room not found" }, { status: 404 })
	}

	const { data: roomTeachers } = await supabase
		.from("room_teachers")
		.select("user_id")
		.eq("room_id", roomId)

	const teacher_ids = (roomTeachers ?? []).map((rt) => rt.user_id)

	return NextResponse.json({
		id: room.id,
		name: room.name,
		teacher_ids,
	})
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: roomId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: room, error: roomError } = await supabase
		.from("rooms")
		.select("id")
		.eq("id", roomId)
		.eq("club_id", clubId)
		.single()

	if (roomError || !room) {
		return NextResponse.json({ error: "Room not found" }, { status: 404 })
	}

	let body: { name?: string; teacher_ids?: string[] }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	if (typeof body.name === "string") {
		const name = body.name.trim()
		if (!name) {
			return NextResponse.json({ error: "Room name cannot be empty" }, { status: 400 })
		}
		await supabase.from("rooms").update({ name }).eq("id", roomId)
	}

	if (Array.isArray(body.teacher_ids)) {
		const validIds = body.teacher_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
		await supabase.from("room_teachers").delete().eq("room_id", roomId)
		if (validIds.length > 0) {
			await supabase.from("room_teachers").insert(
				validIds.map((user_id) => ({ room_id: roomId, user_id }))
			)
		}
	}

	return NextResponse.json({ ok: true })
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: roomId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: room, error: roomError } = await supabase
		.from("rooms")
		.select("id")
		.eq("id", roomId)
		.eq("club_id", clubId)
		.single()

	if (roomError || !room) {
		return NextResponse.json({ error: "Room not found" }, { status: 404 })
	}

	const { error: deleteError } = await supabase.from("rooms").delete().eq("id", roomId)

	if (deleteError) {
		return NextResponse.json({ error: deleteError.message }, { status: 500 })
	}
	return NextResponse.json({ ok: true })
}
