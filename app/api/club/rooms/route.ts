import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

async function getClubAndAuth(supabase: ReturnType<typeof createClient>) {
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

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: rooms, error: roomsError } = await supabase
		.from("rooms")
		.select("id, name")
		.eq("club_id", clubId)
		.order("name")

	if (roomsError) {
		return NextResponse.json({ error: roomsError.message }, { status: 500 })
	}

	const roomIds = (rooms ?? []).map((r) => r.id)
	if (roomIds.length === 0) {
		return NextResponse.json({ rooms: [] })
	}

	const { data: roomTeachers } = await supabase
		.from("room_teachers")
		.select("room_id, user_id")
		.in("room_id", roomIds)

	const byRoom = new Map<string, string[]>()
	for (const rt of roomTeachers ?? []) {
		if (!byRoom.has(rt.room_id)) byRoom.set(rt.room_id, [])
		byRoom.get(rt.room_id)!.push(rt.user_id)
	}

	const result = (rooms ?? []).map((r) => ({
		id: r.id,
		name: r.name,
		teacher_ids: byRoom.get(r.id) ?? [],
	}))

	return NextResponse.json({ rooms: result })
}

export async function POST(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

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
		return NextResponse.json({ error: "Room name is required" }, { status: 400 })
	}

	const { data: newRoom, error: insertError } = await supabase
		.from("rooms")
		.insert({ club_id: clubId, name })
		.select("id")
		.single()

	if (insertError) {
		return NextResponse.json({ error: insertError.message }, { status: 500 })
	}
	return NextResponse.json({ id: newRoom?.id })
}
