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

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: types, error: typesError } = await supabase
		.from("group_lesson_types")
		.select("id, group_id, name, duration_minutes")
		.eq("club_id", clubId)
		.order("name")

	if (typesError) {
		return NextResponse.json({ error: typesError.message }, { status: 500 })
	}

	const groupIds = [...new Set((types ?? []).map((t) => t.group_id))]
	if (groupIds.length === 0) {
		return NextResponse.json({ group_lesson_types: [] })
	}

	const { data: groups } = await supabase
		.from("groups")
		.select("id, name")
		.in("id", groupIds)
	const groupByName = new Map((groups ?? []).map((g) => [g.id, g.name ?? "Unnamed group"]))

	const result = (types ?? []).map((t) => ({
		id: t.id,
		group_id: t.group_id,
		group_name: groupByName.get(t.group_id) ?? "",
		name: t.name,
		duration_minutes: t.duration_minutes,
	}))

	return NextResponse.json({ group_lesson_types: result })
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

	let body: { group_id?: string; name?: string; duration_minutes?: number }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const groupId = typeof body.group_id === "string" ? body.group_id.trim() : ""
	if (!groupId) {
		return NextResponse.json({ error: "Group is required" }, { status: 400 })
	}

	const name = typeof body.name === "string" ? body.name.trim() : ""
	if (!name) {
		return NextResponse.json({ error: "Lesson type name is required" }, { status: 400 })
	}

	const duration = typeof body.duration_minutes === "number" ? body.duration_minutes : Number(body.duration_minutes)
	if (!Number.isInteger(duration) || duration < 1) {
		return NextResponse.json({ error: "Duration must be a positive number of minutes" }, { status: 400 })
	}

	const { data: group } = await supabase
		.from("groups")
		.select("id")
		.eq("id", groupId)
		.eq("club_id", clubId)
		.single()

	if (!group) {
		return NextResponse.json({ error: "Group not found" }, { status: 404 })
	}

	const { data: newType, error: insertError } = await supabase
		.from("group_lesson_types")
		.insert({ club_id: clubId, group_id: groupId, name, duration_minutes: duration })
		.select("id")
		.single()

	if (insertError) {
		return NextResponse.json({ error: insertError.message }, { status: 500 })
	}
	return NextResponse.json({ id: newType?.id })
}
