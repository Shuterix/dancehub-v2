import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { refreshGroupAvailability } from "@/lib/availability-db"

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
	const { id: groupId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: group, error: groupError } = await supabase
		.from("groups")
		.select("id, name, created_at")
		.eq("id", groupId)
		.eq("club_id", clubId)
		.single()

	if (groupError || !group) {
		return NextResponse.json({ error: "Group not found" }, { status: 404 })
	}

	const { data: groupMembers } = await supabase
		.from("group_members")
		.select("user_id, couple_id")
		.eq("group_id", groupId)

	const studentIds = (groupMembers ?? []).map((m) => m.user_id).filter(Boolean) as string[]
	const coupleIds = (groupMembers ?? []).map((m) => m.couple_id).filter(Boolean) as string[]

	return NextResponse.json({
		id: group.id,
		name: group.name,
		created_at: group.created_at,
		student_ids: studentIds,
		couple_ids: coupleIds,
	})
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: groupId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: group, error: groupError } = await supabase
		.from("groups")
		.select("id")
		.eq("id", groupId)
		.eq("club_id", clubId)
		.single()

	if (groupError || !group) {
		return NextResponse.json({ error: "Group not found" }, { status: 404 })
	}

	let body: { name?: string; student_ids?: string[]; couple_ids?: string[] }
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	if (typeof body.name === "string") {
		const name = body.name.trim()
		if (!name) {
			return NextResponse.json({ error: "Group name cannot be empty" }, { status: 400 })
		}
		await supabase.from("groups").update({ name }).eq("id", groupId)
	}

	const studentIds = Array.isArray(body.student_ids)
		? body.student_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
		: undefined
	const coupleIds = Array.isArray(body.couple_ids)
		? body.couple_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
		: undefined

	if (studentIds !== undefined || coupleIds !== undefined) {
		await supabase.from("group_members").delete().eq("group_id", groupId)

		const studentIdsSet = new Set(studentIds ?? [])
		const coupleIdsSet = new Set(coupleIds ?? [])

		const { data: members } = await supabase
			.from("club_members")
			.select("user_id, role")
			.eq("club_id", clubId)
		const clubStudentIds = new Set((members ?? []).filter((m) => m.role === "student").map((m) => m.user_id))

		const { data: clubCouples } = await supabase
			.from("couples")
			.select("id, partner1_user_id, partner2_user_id")
			.eq("club_id", clubId)
		const validCoupleIds = new Set((clubCouples ?? []).map((c) => c.id))

		// Users who are partners in any of the couples we're adding: do not add them as individual students
		const partnerUserIdsInSelectedCouples = new Set<string>()
		for (const c of clubCouples ?? []) {
			if (coupleIdsSet.has(c.id)) {
				if (c.partner1_user_id) partnerUserIdsInSelectedCouples.add(c.partner1_user_id)
				if (c.partner2_user_id) partnerUserIdsInSelectedCouples.add(c.partner2_user_id)
			}
		}

		const toInsert: { group_id: string; user_id: string | null; couple_id: string | null }[] = []
		for (const uid of studentIdsSet) {
			if (partnerUserIdsInSelectedCouples.has(uid)) continue
			if (clubStudentIds.has(uid)) {
				toInsert.push({ group_id: groupId, user_id: uid, couple_id: null })
			}
		}
		for (const cid of coupleIdsSet) {
			if (validCoupleIds.has(cid)) {
				toInsert.push({ group_id: groupId, user_id: null, couple_id: cid })
			}
		}
		if (toInsert.length > 0) {
			await supabase.from("group_members").insert(toInsert)
		}
		await refreshGroupAvailability(supabase, groupId)
	}

	return NextResponse.json({ ok: true })
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: groupId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: group, error: groupError } = await supabase
		.from("groups")
		.select("id")
		.eq("id", groupId)
		.eq("club_id", clubId)
		.single()

	if (groupError || !group) {
		return NextResponse.json({ error: "Group not found" }, { status: 404 })
	}

	const { error: deleteError } = await supabase.from("groups").delete().eq("id", groupId)

	if (deleteError) {
		return NextResponse.json({ error: deleteError.message }, { status: 500 })
	}
	return NextResponse.json({ ok: true })
}
